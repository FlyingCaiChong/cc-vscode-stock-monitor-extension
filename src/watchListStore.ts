import * as vscode from 'vscode';
import { WatchedStock } from './types';
import { CONFIG_SECTION } from './config';
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

/** 校验配置项中的关注列表格式是否为字符串数组 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * 关注列表存储器。
 *
 * 数据保存在 `context.globalState`（跨工作区共享），首次启动时用配置项
 * `stockMonitor.watchList` 初始化，之后完全由用户操作维护。
 */
export class WatchListStore {
  private stocks: WatchedStock[];

  /**
   * 启动时是否需要把当前内存中的关注列表回填到 settings.json。
   *
   * 出现场景：
   * 1. 旧版本只写了 globalState，配置文件中尚无 `stockMonitor.watchList`
   * 2. 首次启动，用户还没有显式写过该配置项
   */
  private needsConfigBackfill = false;

  private readonly changeEmitter = new vscode.EventEmitter<void>();

  /** 列表变化事件，UI 层据此刷新状态栏与树视图 */
  readonly onDidChange: vscode.Event<void> = this.changeEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext, seedCodes: string[]) {
    this.stocks = this.restore(seedCodes);
  }

  /** 读取本地元数据缓存（名称 / 收藏状态），不作为列表主数据源 */
  private loadSavedMetadata(): WatchedStock[] {
    const saved = this.context.globalState.get<unknown>(STORAGE_KEY);
    if (!Array.isArray(saved)) {
      return [];
    }
    return saved.filter(isValidStock).map((s) => ({
      ...s,
      favorite: Boolean(s.favorite),
      name: s.name ?? '',
    }));
  }

  /**
   * 把原始股票代码列表和已缓存元数据合并成完整的关注列表。
   *
   * 说明：
   * - `codes` 来自 settings.json，是当前关注列表的“事实来源”
   * - `metadata` 仅用于保留名称、收藏状态等展示信息
   */
  private buildStocks(codes: string[], metadata: WatchedStock[]): WatchedStock[] {
    const metadataByKey = new Map(metadata.map((item) => [item.key, item] as const));
    const stocks: WatchedStock[] = [];
    for (const raw of codes) {
      const parsed = parseStockCode(raw);
      if (!parsed.ok) {
        logger.warn(`关注列表中的 "${raw}" 无法识别，已跳过：${parsed.reason}`);
        continue;
      }
      if (stocks.some((item) => item.key === parsed.value.key)) {
        logger.warn(`关注列表中存在重复代码 ${parsed.value.key}，已自动去重`);
        continue;
      }
      const cached = metadataByKey.get(parsed.value.key);
      stocks.push({
        ...parsed.value,
        name: cached?.name ?? '',
        favorite: Boolean(cached?.favorite),
      });
    }
    return stocks;
  }

  /** 读取持久化数据：优先使用 settings.json，旧版 globalState 仅作为迁移来源 */
  private restore(seedCodes: string[]): WatchedStock[] {
    const metadata = this.loadSavedMetadata();
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const configured = cfg.get<unknown>('watchList');

    if (isStringArray(configured)) {
      const stocks = this.buildStocks(configured, metadata);
      logger.info(`已从 settings.json 加载关注列表，共 ${stocks.length} 只股票`);
      return stocks;
    }

    if (configured !== undefined) {
      logger.warn('stockMonitor.watchList 需要是字符串数组，当前配置已被忽略');
    }

    // 兼容旧版本：当配置文件里还没有 watchList 时，先沿用原来的 globalState 数据，
    // 并在启动后回填到 settings.json，保证用户后续能在 settings.json 中看到真实列表。
    if (metadata.length > 0) {
      this.needsConfigBackfill = true;
      logger.info(`已从旧版本地缓存恢复关注列表，共 ${metadata.length} 只股票，稍后将回填到 settings.json`);
      return metadata;
    }

    this.needsConfigBackfill = true;
    const stocks = this.buildStocks(seedCodes, []);
    logger.info(`首次启动，已用默认关注列表初始化 ${stocks.length} 只股票`);
    return stocks;
  }

  /** 当前关注列表是否需要回填到 settings.json */
  shouldBackfillConfig(): boolean {
    return this.needsConfigBackfill;
  }

  /** 导出关注列表代码，用于写入 settings.json */
  exportCodes(): string[] {
    return this.stocks.map((stock) => stock.key);
  }

  /** 仅写入 settings.json 中的关注列表配置 */
  private async persistConfig(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await cfg.update('watchList', this.exportCodes(), vscode.ConfigurationTarget.Global);
  }

  /** 仅写入本地元数据缓存 */
  private async persistMetadata(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, this.stocks);
  }

  /** 持久化当前列表：settings.json 保存主列表，本地缓存保存展示元数据 */
  private async persist(): Promise<void> {
    await this.persistConfig();
    await this.persistMetadata();
    this.needsConfigBackfill = false;
    this.changeEmitter.fire();
  }

  /**
   * 启动时把旧版缓存或默认值回填到 settings.json。
   * 这样用户在 settings.json 中看到的内容就会与界面一致。
   */
  async backfillConfigIfNeeded(): Promise<void> {
    if (!this.needsConfigBackfill) {
      return;
    }
    await this.persistConfig();
    await this.persistMetadata();
    this.needsConfigBackfill = false;
  }

  /**
   * 当用户直接修改 settings.json 时，用最新配置覆盖内存中的股票列表，
   * 同时尽量保留已有的名称与收藏状态，避免界面展示突然“丢元数据”。
   */
  syncFromConfig(codes: string[]): void {
    const next = this.buildStocks(codes, this.stocks);
    const currentKeys = this.stocks.map((stock) => stock.key);
    const nextKeys = next.map((stock) => stock.key);
    if (JSON.stringify(currentKeys) === JSON.stringify(nextKeys)) {
      return;
    }
    this.stocks = next;
    void this.persistMetadata().then(
      undefined,
      (err) => logger.error('同步关注列表缓存失败', err),
    );
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
  async add(stock: WatchedStock): Promise<string | undefined> {
    if (this.has(stock.key)) {
      return `已关注 ${stock.name || stock.code}（${MARKET_LABEL[stock.market]}）`;
    }
    this.stocks.push(stock);
    await this.persist();
    logger.info(`新增关注 ${stock.key}`);
    return undefined;
  }

  /** 移除关注，返回是否移除成功 */
  async remove(key: string): Promise<boolean> {
    const before = this.stocks.length;
    this.stocks = this.stocks.filter((s) => s.key !== key);
    if (this.stocks.length === before) {
      return false;
    }
    await this.persist();
    logger.info(`移除关注 ${key}`);
    return true;
  }

  /** 切换收藏状态，返回切换后的值；代码不存在时返回 undefined */
  async toggleFavorite(key: string): Promise<boolean | undefined> {
    const stock = this.stocks.find((s) => s.key === key);
    if (!stock) {
      return undefined;
    }
    stock.favorite = !stock.favorite;
    await this.persistMetadata();
    this.changeEmitter.fire();
    return stock.favorite;
  }

  /** 回填股票名称（行情首次拉取成功时），仅在名称变化时写盘 */
  updateName(key: string, name: string): void {
    const stock = this.stocks.find((s) => s.key === key);
    if (!stock || !name || stock.name === name) {
      return;
    }
    stock.name = name;
    void this.persistMetadata().then(
      undefined,
      (err) => logger.error('回填股票名称失败', err),
    );
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}
