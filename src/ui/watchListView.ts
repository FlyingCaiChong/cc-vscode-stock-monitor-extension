import * as vscode from 'vscode';
import { MARKET_LABEL } from '../market/stockCode';
import { StockMonitorConfig } from '../config';
import { computePosition, PositionSetting } from '../position';
import { Quote, WatchedStock } from '../types';
import {
  detailRows,
  formatNumber,
  formatSigned,
  formatSignedAmount,
  positionRows,
  trendOf,
} from './format';

/** 树节点：正常股票项或空列表引导项 */
export type WatchListNode = { kind: 'stock'; stock: WatchedStock } | { kind: 'empty' };

/** 树视图中用于区分上下文菜单的标识 */
export const CONTEXT_STOCK = 'stockItem';
export const CONTEXT_FAVORITE = 'stockItemFavorite';

/**
 * 「股票关注列表」树视图数据源。
 * 收藏的股票排在前面（排序逻辑在 WatchListStore 中完成）。
 */
export class WatchListProvider implements vscode.TreeDataProvider<WatchListNode> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData: vscode.Event<void> = this.changeEmitter.event;

  constructor(
    private readonly getStocks: () => WatchedStock[],
    private readonly getQuote: (key: string) => Quote | undefined,
    private readonly getPosition: (key: string) => PositionSetting | undefined,
    private readonly getConfig: () => StockMonitorConfig
  ) {}

  /** 通知视图重新拉取数据 */
  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(node: WatchListNode): vscode.TreeItem {
    if (node.kind === 'empty') {
      const empty = new vscode.TreeItem('暂无关注股票，点击此处添加');
      empty.contextValue = 'empty';
      empty.iconPath = new vscode.ThemeIcon('add');
      empty.command = { command: 'stockMonitor.addStock', title: '添加股票' };
      return empty;
    }

    const { stock } = node;
    const config = this.getConfig();
    const quote = this.getQuote(stock.key);
    const setting = this.getPosition(stock.key);
    const metrics = setting && quote ? computePosition(quote, setting) : undefined;
    // 配置别名后，列表标签优先展示别名
    const label = metrics?.alias || stock.name || quote?.name || stock.code;

    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = stock.favorite ? CONTEXT_FAVORITE : CONTEXT_STOCK;
    item.id = stock.key;

    if (quote) {
      const parts = [
        formatNumber(quote.price, config.decimals),
        `${formatSigned(quote.changePercent, 2)}%`,
      ];
      // 配置持仓数量后，在描述中追加当日收益，便于一眼看到盈亏
      if (metrics?.dailyProfit !== undefined) {
        parts.push(`当日 ${formatSignedAmount(metrics.dailyProfit, config.decimals)}`);
      }
      item.description = parts.join('  ');
      const trend = trendOf(quote);
      item.iconPath = new vscode.ThemeIcon(
        stock.favorite ? 'star-full' : 'circle-outline',
        stock.favorite
          ? new vscode.ThemeColor('charts.yellow')
          : new vscode.ThemeColor(trend === 'flat' ? 'descriptionForeground' : 'charts.blue')
      );
    } else {
      item.description = '等待行情...';
      item.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('descriptionForeground'));
    }

    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(
      `**${metrics?.alias || quote?.name || stock.code}** \`${stock.code}\` · ${MARKET_LABEL[stock.market]}`
    );
    if (stock.favorite) {
      md.appendMarkdown(' ⭐');
    }
    md.appendMarkdown('\n\n');
    if (quote) {
      for (const [rowLabel, value] of detailRows(quote, config.decimals)) {
        md.appendMarkdown(`${rowLabel}：${value}  \n`);
      }
      const holdings = positionRows(metrics, config.decimals);
      if (holdings.length > 0) {
        md.appendMarkdown('\n---\n\n');
        for (const [rowLabel, value] of holdings) {
          md.appendMarkdown(`${rowLabel}：${value}  \n`);
        }
      }
    } else {
      md.appendMarkdown('暂无行情数据  \n');
    }
    item.tooltip = md;

    return item;
  }

  getChildren(node?: WatchListNode): WatchListNode[] {
    if (node) {
      return [];
    }
    const stocks = this.getStocks();
    if (stocks.length === 0) {
      return [{ kind: 'empty' }];
    }
    return stocks.map((stock) => ({ kind: 'stock' as const, stock }));
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}
