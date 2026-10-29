import * as vscode from 'vscode';
import { MARKET_LABEL } from '../market/stockCode';
import { StockMonitorConfig } from '../config';
import { computePortfolioSummary, computePosition, PortfolioSummary, PositionMap, PositionMetrics } from '../position';
import { Quote, WatchedStock } from '../types';
import { colorIdFor, colorIdForStock, detailRows, formatAmount, formatSignedAmount, formatStatusBarText, positionRows, trendOf } from './format';

/**
 * 状态栏管理器：为关注列表中的每只股票维护一个 StatusBarItem。
 *
 * 设计要点：
 * 1. StatusBarItem 的对齐方式与优先级只能在创建时指定，因此当这两项配置变化时，
 *    需要销毁全部 item 后重建（通过 signature 比对实现）。
 * 2. 收藏的股票优先展示；超过 maxStatusBarItems 的部分自动隐藏，避免状态栏拥挤。
 * 3. 暂无行情时展示占位符而非空白，让用户明确知道插件正在工作。
 */
export class StatusBarManager {
  private readonly items = new Map<string, vscode.StatusBarItem>();

  private placeholder: vscode.StatusBarItem | undefined;

  private summaryItem: vscode.StatusBarItem | undefined;

  private signature = '';

  constructor(private readonly emptyCommand: string) {}

  /** 渲染状态栏 */
  render(
    stocks: WatchedStock[],
    quotes: Map<string, Quote>,
    positions: PositionMap,
    config: StockMonitorConfig
  ): void {
    const signature = `${config.statusBarAlignment}|${config.statusBarPriority}`;
    if (this.signature !== signature) {
      this.disposeItems();
      this.disposeSummary();
      this.signature = signature;
    }

    const alignment =
      config.statusBarAlignment === 'right' ? vscode.StatusBarAlignment.Right : vscode.StatusBarAlignment.Left;

    if (stocks.length === 0) {
      this.disposeItems();
      this.disposeSummary();
      this.showPlaceholder(alignment, config.statusBarPriority);
      return;
    }
    this.disposePlaceholder();

    const summary = config.showPortfolioSummary
      ? computePortfolioSummary(quotes, positions)
      : undefined;
    if (summary) {
      this.showSummary(summary, alignment, config);
    } else {
      this.disposeSummary();
    }

    const visible = stocks.slice(0, config.maxStatusBarItems);
    visible.forEach((stock, index) => {
      // 优先级逐项递减，保证多只股票的相对顺序稳定
      const item = this.ensureItem(stock.key, alignment, config.statusBarPriority - index);
      const quote = quotes.get(stock.key);
      const metrics = this.metricsOf(stock.key, quote, positions);
      // 配置别名后，状态栏与提示中的名称统一展示别名
      const displayName = metrics?.alias || stock.name || quote?.name || stock.code;
      if (quote) {
        item.text = formatStatusBarText(quote, config.displayFields, config.decimals, metrics);
        item.color = this.toStatusBarColor(
          colorIdForStock(
            stock.key,
            trendOf(quote),
            config.colorScheme,
            config.upColor,
            config.downColor,
            config.stockColors
          )
        );
        item.tooltip = this.buildTooltip(quote, stock, metrics, config.decimals);
      } else {
        item.text = `${displayName} --`;
        item.color = new vscode.ThemeColor('descriptionForeground');
        item.tooltip = new vscode.MarkdownString(`正在获取 **${displayName}** 的行情数据...`);
      }
      item.show();
    });

    // 隐藏超出展示上限的 item（保留实例以便用户调大上限后立即复用）
    const visibleKeys = new Set(visible.map((s) => s.key));
    for (const [key, item] of this.items) {
      if (!visibleKeys.has(key)) {
        item.hide();
      }
    }
    // 彻底移除已被删除股票的 item
    const aliveKeys = new Set(stocks.map((s) => s.key));
    for (const [key, item] of [...this.items]) {
      if (!aliveKeys.has(key)) {
        item.dispose();
        this.items.delete(key);
      }
    }
  }

  /** 把颜色字符串转换为 VS Code 状态栏可识别的颜色值 */
  private toStatusBarColor(color: string): string | vscode.ThemeColor {
    return color.startsWith('#') ? color : new vscode.ThemeColor(color);
  }

  /** 展示持仓汇总项，便于用户快速查看全部持仓的当日参考盈亏 */
  private showSummary(
    summary: PortfolioSummary,
    alignment: vscode.StatusBarAlignment,
    config: StockMonitorConfig
  ): void {
    if (!this.summaryItem) {
      this.summaryItem = vscode.window.createStatusBarItem(alignment, config.statusBarPriority + 1);
      this.summaryItem.command = { command: 'stockMonitor.refresh', title: '立即刷新行情' };
      this.summaryItem.name = 'Stock Monitor: portfolioSummary';
    }
    const trend = summary.dailyProfit > 0 ? 'up' : summary.dailyProfit < 0 ? 'down' : 'flat';
    this.summaryItem.text = `${config.portfolioSummaryLabel} ${formatSignedAmount(summary.dailyProfit, config.decimals)}`;
    this.summaryItem.color = this.toStatusBarColor(
      colorIdFor(trend, config.colorScheme, config.upColor, config.downColor)
    );

    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown('**持仓汇总**\n\n');
    md.appendMarkdown(`纳入计算：${summary.count} 只  \n`);
    md.appendMarkdown(`持仓市值：${formatAmount(summary.marketValue, config.decimals)} 元  \n`);
    md.appendMarkdown(
      `${config.portfolioSummaryLabel}：${formatSignedAmount(summary.dailyProfit, config.decimals)} 元`
    );
    if (summary.totalProfit !== undefined) {
      md.appendMarkdown(`  \n持仓总收益：${formatSignedAmount(summary.totalProfit, config.decimals)} 元`);
    }
    md.appendMarkdown('\n\n点击可立即刷新行情');
    this.summaryItem.tooltip = md;
    this.summaryItem.show();
  }

  /**
   * 计算持仓指标。
   * 无行情快照时退化为「仅别名 / 成本价」，保证别名可在行情到达前正常展示。
   */
  private metricsOf(
    key: string,
    quote: Quote | undefined,
    positions: PositionMap
  ): PositionMetrics | undefined {
    const setting = positions.get(key);
    if (!setting) {
      return undefined;
    }
    return quote ? computePosition(quote, setting) : { alias: setting.alias, costPrice: setting.costPrice };
  }

  /** 构造悬浮提示 */
  private buildTooltip(
    quote: Quote,
    stock: WatchedStock,
    metrics: PositionMetrics | undefined,
    decimals: number
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**${metrics?.alias || quote.name}** \`${quote.code}\` · ${MARKET_LABEL[stock.market]}`);
    if (stock.favorite) {
      md.appendMarkdown(' ⭐');
    }
    md.appendMarkdown('\n\n');
    for (const [label, value] of detailRows(quote, decimals)) {
      md.appendMarkdown(`${label}：${value}  \n`);
    }
    const holdings = positionRows(metrics, decimals);
    if (holdings.length > 0) {
      md.appendMarkdown('\n---\n\n');
      for (const [label, value] of holdings) {
        md.appendMarkdown(`${label}：${value}  \n`);
      }
    }
    md.appendMarkdown('\n点击可立即刷新行情');
    return md;
  }

  /** 获取或创建状态栏项 */
  private ensureItem(key: string, alignment: vscode.StatusBarAlignment, priority: number): vscode.StatusBarItem {
    let item = this.items.get(key);
    if (!item) {
      item = vscode.window.createStatusBarItem(alignment, priority);
      item.command = { command: 'stockMonitor.refresh', title: '立即刷新行情' };
      item.name = `Stock Monitor: ${key}`;
      this.items.set(key, item);
    }
    return item;
  }

  /** 关注列表为空时的引导项 */
  private showPlaceholder(alignment: vscode.StatusBarAlignment, priority: number): void {
    if (!this.placeholder) {
      this.placeholder = vscode.window.createStatusBarItem(alignment, priority);
      this.placeholder.text = '$(add) 添加股票';
      this.placeholder.tooltip = new vscode.MarkdownString('Stock Monitor：点击添加要监控的股票');
      this.placeholder.command = { command: this.emptyCommand, title: '添加股票' };
    }
    this.placeholder.show();
  }

  private disposePlaceholder(): void {
    this.placeholder?.dispose();
    this.placeholder = undefined;
  }

  private disposeSummary(): void {
    this.summaryItem?.dispose();
    this.summaryItem = undefined;
  }

  private disposeItems(): void {
    for (const item of this.items.values()) {
      item.dispose();
    }
    this.items.clear();
  }

  dispose(): void {
    this.disposeItems();
    this.disposePlaceholder();
    this.disposeSummary();
  }
}
