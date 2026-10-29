import * as vscode from 'vscode';
import { WatchedStock } from './types';
import { MARKET_LABEL, parseStockCode } from './market/stockCode';
import { logger } from './logger';

/** globalState 中的存储键 */
const STORAGE_KEY = 'stockMonitor.watchList';

/** 校验持久化数据是否合法，防止旧版本残留脏数据导致崩溃 */
function isValidStock(value: unknown): value is WatchedStock {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Partial<WatchedStock>;
  return typeof v.key === 'string' && typeof v.code === 'string' && typeof v.market === 'string';
}

/**
 * 关注列表存储器。
 *
 * 数据保存在 `context.globalState`（跨工作区共享），首次启动时用配置项
 * `stockMonitor.watchList` 初始化，之后完全由用户操作维护。
 */
export class WatchListStore {
  private stocks: WatchedStock[];

  private readonly changeEmitter = new vscode.EventEmitter<void>();

  /** 列表变化事件，UI 层据此刷新状态栏与树视图 */
  readonly onDidChange: vscode.Event<void> = this.changeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext, seedCodes: string[]) {
    this.stocks = this.restore(seedCodes);
  }

  /** 读取持久化数据，不存在时按种子配置初始化 */
  private restore(seedCodes: string[]): WatchedStock[] {
    const saved = this.context.globalState.get<unknown>(STORAGE_KEY);
    if (Array.isArray(saved) && saved.length > 0) {
      const valid = saved.filter(isValidStock);
      logger.info(`已加载关注列表，共 ${valid.length} 只股票`);
      return valid.map((s) => ({ ...s, favorite: Boolean(s.favorite), name: s.name ?? '' }));
    }

    const stocks: WatchedStock[] = [];
    for (const raw of seedCodes) {
      const parsed = parseStockCode(raw);
      if (parsed.ok && !stocks.some((s) => s.key === parsed.value.key)) {
        stocks.push({ ...parsed.value, name: '', favorite: false });
      } else if (!parsed.ok) {
        logger.warn(`默认关注列表中的 "${raw}" 无法识别，已跳过：${parsed.reason}`);
      }
    }
    logger.info(`首次启动，已用默认关注列表初始化 ${stocks.length} 只股票`);
    return stocks;
  }

  /** 持久化当前列表 */
  private persist(): void {
    void this.context.globalState.update(STORAGE_KEY, this.stocks);
    this.changeEmitter.fire();
  }

  /** 全部关注股票（收藏项排在前面） */
  list(): WatchedStock[] {
    return [...this.stocks].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  }

  get size(): number {
    return this.stocks.length;
  }

  has(key: string): boolean {
    return this.stocks.some((s) => s.key === key);
  }

  get(key: string): WatchedStock | undefined {
    return this.stocks.find((s) => s.key === key);
  }

  /** 新增关注，返回失败原因（成功时为 undefined） */
  add(stock: WatchedStock): string | undefined {
    if (this.has(stock.key)) {
      return `已关注 ${stock.name || stock.code}（${MARKET_LABEL[stock.market]}）`;
    }
    this.stocks.push(stock);
    this.persist();
    logger.info(`新增关注 ${stock.key}`);
    return undefined;
  }

  /** 移除关注，返回是否移除成功 */
  remove(key: string): boolean {
    const before = this.stocks.length;
    this.stocks = this.stocks.filter((s) => s.key !== key);
    if (this.stocks.length === before) {
      return false;
    }
    this.persist();
    logger.info(`移除关注 ${key}`);
    return true;
  }

  /** 切换收藏状态，返回切换后的值；代码不存在时返回 undefined */
  toggleFavorite(key: string): boolean | undefined {
    const stock = this.stocks.find((s) => s.key === key);
    if (!stock) {
      return undefined;
    }
    stock.favorite = !stock.favorite;
    this.persist();
    return stock.favorite;
  }

  /** 回填股票名称（行情首次拉取成功时），仅在名称变化时写盘 */
  updateName(key: string, name: string): void {
    const stock = this.stocks.find((s) => s.key === key);
    if (!stock || !name || stock.name === name) {
      return;
    }
    stock.name = name;
    void this.context.globalState.update(STORAGE_KEY, this.stocks);
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}
