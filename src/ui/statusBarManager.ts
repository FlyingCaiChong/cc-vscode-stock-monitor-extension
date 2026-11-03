import * as vscode from 'vscode';
import { MARKET_LABEL } from '../market/stockCode';
import { StockMonitorConfig } from '../config';
import { computePortfolioSummary, computePosition, PortfolioSummary, PositionMap, PositionMetrics } from '../position';
import { Quote, WatchedStock } from '../types';
import { colorIdFor, colorIdForStock, detailRows, formatAmount, formatSignedAmount, formatStatusBarText, positionRows, trendOf } from './format';

/**
 * 状态栏渲染所需的运行时状态。
 *
 * 与 `StockMonitorConfig` 的区别：这些值每次刷新都会变化，不适合放在配置里。
 */
export interface StatusBarRuntimeState {
  /** 当前触发预警的股票：key -> 触发原因（用于文字与悬浮提示） */
  alerts?: ReadonlyMap<string, readonly string[]>;
  /**
   * 行情数据超过该秒数未更新即视为陈旧；`undefined` 表示不检测。
   * 由控制器根据「是否开启自动刷新 / 是否在刷新时段内」决定是否传入。
   */
  staleAfterSeconds?: number;
}

/**
 * 状态栏管理器：为关注列表中的每只股票维护一个 StatusBarItem。
 *
 * 设计要点：
 * 1. StatusBarItem 的对齐方式与优先级只能在创建时指定，因此当这两项配置变化时，
 *    需要销毁全部 item 后重建（通过 signature 比对实现）。
 * 2. 收藏的股票优先展示；超过 maxStatusBarItems 的部分自动隐藏，避免状态栏拥挤。
 * 3. 暂无行情时展示占位符而非空白，让用户明确知道插件正在工作。
 * 4. 颜色优先级：预警高亮 > 数据陈旧 > 涨跌配色，保证异常状态最醒目。
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
    config: StockMonitorConfig,
    runtime: StatusBarRuntimeState = {}
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

    const stale = this.isDataStale(quotes, runtime.staleAfterSeconds);
    const alerts = runtime.alerts ?? new Map<string, readonly string[]>();

    const summary = config.showPortfolioSummary
      ? computePortfolioSummary(quotes, positions)
      : undefined;
    if (summary) {
      this.showSummary(summary, alignment, config, stale);
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
      const alertReasons = alerts.get(stock.key);
      if (quote) {
        // 涨跌停标记已由 formatStatusBarText 自动追加，此处只负责异常状态的前缀与配色
        const text = formatStatusBarText(quote, config.displayFields, config.decimals, metrics);
        if (alertReasons) {
          item.text = `$(bell) ${text}`;
          item.color = this.warningColor();
        } else if (stale) {
          item.text = `$(warning) ${text}`;
          item.color = this.warningColor();
        } else {
          item.text = text;
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
        }
        item.tooltip = this.buildTooltip(quote, stock, metrics, config.decimals, alertReasons, stale);
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

  /** 异常状态（预警 / 数据陈旧）统一使用的强调色 */
  private warningColor(): vscode.ThemeColor {
    return new vscode.ThemeColor('statusBarItem.warningForeground');
  }

  /**
   * 判断行情数据是否已陈旧。
   *
   * 同一次请求会统一更新所有股票的 `fetchedAt`，因此按其中最新的一条判断即可，
   * 避免逐只股票重复计算。尚未拿到任何数据时返回 false（交由占位符提示）。
   */
  private isDataStale(quotes: Map<string, Quote>, staleAfterSeconds?: number): boolean {
    if (staleAfterSeconds === undefined) {
      return false;
    }
    let newest = 0;
    for (const quote of quotes.values()) {
      if (quote.fetchedAt > newest) {
        newest = quote.fetchedAt;
      }
    }
    return newest > 0 && Date.now() - newest > staleAfterSeconds * 1000;
  }

  /** 数据陈旧提示行，未陈旧时返回 undefined */
  private staleRow(stale: boolean, quote?: Quote): string | undefined {
    if (!stale || !quote || quote.fetchedAt <= 0) {
      return undefined;
    }
    const seconds = Math.round((Date.now() - quote.fetchedAt) / 1000);
    return `⚠ 行情已 ${seconds} 秒未更新（最后更新 ${quote.time || '--'}），请检查网络`;
  }

  /** 展示持仓汇总项，便于用户快速查看全部持仓的当日参考盈亏 */
  private showSummary(
    summary: PortfolioSummary,
    alignment: vscode.StatusBarAlignment,
    config: StockMonitorConfig,
    stale: boolean
  ): void {
    if (!this.summaryItem) {
      this.summaryItem = vscode.window.createStatusBarItem(alignment, config.statusBarPriority + 1);
      this.summaryItem.command = { command: 'stockMonitor.refresh', title: '立即刷新行情' };
      this.summaryItem.name = 'Stock Monitor: portfolioSummary';
    }
    const trend = summary.dailyProfit > 0 ? 'up' : summary.dailyProfit < 0 ? 'down' : 'flat';
    const text = `${config.portfolioSummaryLabel} ${formatSignedAmount(summary.dailyProfit, config.decimals)}`;
    this.summaryItem.text = stale ? `$(warning) ${text}` : text;
    this.summaryItem.color = stale
      ? this.warningColor()
      : this.toStatusBarColor(colorIdFor(trend, config.colorScheme, config.upColor, config.downColor));

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
    decimals: number,
    alertReasons?: readonly string[],
    stale = false
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**${metrics?.alias || quote.name}** \`${quote.code}\` · ${MARKET_LABEL[stock.market]}`);
    if (stock.favorite) {
      md.appendMarkdown(' ⭐');
    }
    md.appendMarkdown('\n\n');
    // 异常状态放在最顶部，避免被长明细挤出视野
    const staleText = this.staleRow(stale, quote);
    if (staleText) {
      md.appendMarkdown(`${staleText}\n\n`);
    }
    if (alertReasons && alertReasons.length > 0) {
      for (const reason of alertReasons) {
        md.appendMarkdown(`$(bell) **预警**：${reason}  \n`);
      }
      md.appendMarkdown('\n');
    }
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
