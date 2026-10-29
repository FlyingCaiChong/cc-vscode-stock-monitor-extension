import * as vscode from "vscode";
import {
  CONFIG_SECTION,
  onConfigChanged,
  readConfig,
  StockMonitorConfig,
} from "./config";
import { logger } from "./logger";
import { QuoteService } from "./market/quoteService";
import { MARKET_LABEL, parseStockCode } from "./market/stockCode";
import { normalizePositions, PositionMap } from "./position";
import {
  Quote,
  QuoteError,
  QuoteErrorCode,
  StockCode,
  WatchedStock,
} from "./types";
import { StatusBarManager } from "./ui/statusBarManager";
import { WatchListProvider, WatchListNode } from "./ui/watchListView";
import { WatchListStore } from "./watchListStore";

/** 树视图 ID，需与 package.json 中 contributes.views 保持一致 */
const VIEW_ID = "stockMonitorWatchList";

/** 旧版本持仓缓存键，仅用于兼容迁移 */
const POSITION_STORAGE_KEY = "stockMonitor.positions";

/** 刷新触发来源，用于决定错误提示策略 */
type RefreshReason = "startup" | "manual" | "timer";

let controller: StockMonitorController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  controller = new StockMonitorController(context);
  controller.start();
  context.subscriptions.push(controller);
  logger.info("Stock Monitor 插件已激活");
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}

/** 从树节点或状态栏命令参数中还原出关注项 */
function toWatchedStock(value: unknown): WatchedStock | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const node = value as Partial<WatchListNode> & Partial<WatchedStock>;
  if (node.kind === "stock") {
    return (value as { kind: "stock"; stock: WatchedStock }).stock;
  }
  return typeof node.key === "string" ? (value as WatchedStock) : undefined;
}

/**
 * 插件主控制器：串联关注列表、行情服务、状态栏与树视图。
 */
class StockMonitorController implements vscode.Disposable {
  private config: StockMonitorConfig;

  private readonly store: WatchListStore;

  private readonly service = new QuoteService();

  private readonly statusBar: StatusBarManager;

  private readonly treeProvider: WatchListProvider;

  private readonly disposables: vscode.Disposable[] = [];

  /** 最近一次成功获取的行情快照 */
  private quotes = new Map<string, Quote>();

  /** 归一化后的持仓配置，key -> 持仓设置 */
  private positions: PositionMap = new Map();

  /**
   * 上一次已合并进内存的 `stockMonitor.positions` 快照。
   * 仅在用户手动改动该配置项时才重新合并，避免修改其它配置项（如刷新间隔）
   * 时把用户在命令里设置的持仓覆盖回去。
   */
  private positionsConfigSnapshot = "";

  private timer: NodeJS.Timeout | undefined;

  /** 防止上一轮请求未返回时重复发起，造成请求堆积 */
  private refreshing = false;

  /** 上一次已弹窗提示的错误码，用于抑制轮询期间的重复打扰 */
  private lastNotifiedError: QuoteErrorCode | undefined;

  /** 启动时是否需要把旧版持仓缓存回填到 settings.json */
  private needsPositionConfigBackfill = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.config = readConfig();
    this.store = new WatchListStore(context, this.config.initialWatchList);
    this.statusBar = new StatusBarManager("stockMonitor.addStock");
    this.treeProvider = new WatchListProvider(
      () => this.store.list(),
      (key) => this.quotes.get(key),
      (key) => this.positions.get(key),
      () => this.config,
    );
    this.loadPositions();
  }

  start(): void {
    this.disposables.push(
      vscode.window.registerTreeDataProvider(VIEW_ID, this.treeProvider),
      vscode.commands.registerCommand("stockMonitor.addStock", () =>
        this.addStock(),
      ),
      vscode.commands.registerCommand(
        "stockMonitor.removeStock",
        (node?: unknown) => this.removeStock(node),
      ),
      vscode.commands.registerCommand(
        "stockMonitor.toggleFavorite",
        (node?: unknown) => this.toggleFavorite(node),
      ),
      vscode.commands.registerCommand(
        "stockMonitor.setPosition",
        (node?: unknown) => this.setPosition(node),
      ),
      vscode.commands.registerCommand("stockMonitor.refresh", () =>
        this.refresh("manual"),
      ),
      vscode.commands.registerCommand("stockMonitor.showLogs", () =>
        logger.show(),
      ),
      this.store.onDidChange(() => this.render()),
      onConfigChanged(() => this.applyConfig()),
    );

    this.render();
    void this.backfillLegacyConfigIfNeeded();
    void this.refresh("startup");
    this.scheduleTimer();
  }

  /** 读取未加默认值的原始配置项，用于判断用户是否真的写入了 settings.json */
  private readRawConfigValue<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration(CONFIG_SECTION).get<T>(key);
  }

  /**
   * 启动后把旧版缓存或默认值回填到 settings.json。
   *
   * 这样可以保证：
   * 1. 用户在 settings.json 中看到的内容与界面一致
   * 2. 旧版本遗留在 globalState 的数据能平滑迁移到新版本配置
   */
  private async backfillLegacyConfigIfNeeded(): Promise<void> {
    try {
      await this.store.backfillConfigIfNeeded();
      if (this.needsPositionConfigBackfill) {
        await this.persistPositions();
        this.needsPositionConfigBackfill = false;
      }
    } catch (err) {
      logger.error("回填配置到 settings.json 失败", err);
    }
  }

  /** 立即渲染界面（不触发网络请求） */
  private render(): void {
    this.statusBar.render(
      this.store.list(),
      this.quotes,
      this.positions,
      this.config,
    );
    this.treeProvider.refresh();
  }

  /**
   * 加载持仓数据：优先读取 settings.json。
   *
   * 兼容逻辑：
   * - 若用户已在 settings.json 中配置 `stockMonitor.positions`，则完全以其为准
   * - 若配置项尚未写入，但旧版本 globalState 中已有数据，则先恢复到内存并在启动后回填到 settings.json
   */
  private loadPositions(): void {
    const configured = this.readRawConfigValue<unknown>("positions");
    const saved = this.context.globalState.get<unknown>(POSITION_STORAGE_KEY);
    const source =
      configured === undefined && saved !== undefined ? saved : configured;
    const { positions, issues } = normalizePositions(source);
    this.logPositionIssues(issues);
    this.positions = positions;
    this.positionsConfigSnapshot = JSON.stringify(source ?? null);
    if (configured === undefined && saved !== undefined) {
      this.needsPositionConfigBackfill = true;
      logger.info(
        `已从旧版本地缓存恢复持仓配置，共 ${positions.size} 只股票，稍后将回填到 settings.json`,
      );
    }
    if (positions.size > 0) {
      logger.info(`已加载持仓配置，共 ${positions.size} 只股票`);
    }
  }

  /**
   * 把持仓数据写入 settings.json，并同步写入旧版缓存键以兼容历史数据。
   *
   * 说明：
   * - settings.json 是新的主数据源，用户可直接看到、编辑、同步
   * - globalState 仅作为兼容缓存，避免旧版本升级后历史数据丢失
   */
  private async persistPositions(): Promise<void> {
    const list = [...this.positions.values()].map((setting) => ({
      code: setting.key,
      alias: setting.alias,
      costPrice: setting.costPrice,
      shares: setting.shares,
    }));
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await cfg.update("positions", list, vscode.ConfigurationTarget.Global);
    await this.context.globalState.update(POSITION_STORAGE_KEY, list);
    this.positionsConfigSnapshot = JSON.stringify(list);
  }

  /**
   * 用 settings.json 中的持仓配置覆盖当前内存态。
   *
   * 这样用户直接编辑 settings.json 时，界面会立即与配置保持一致，
   * 不再出现“settings.json 和展示内容不一致”的情况。
   */
  private mergeConfigPositions(): void {
    const raw = this.readRawConfigValue<unknown>("positions");
    const snapshot = JSON.stringify(raw ?? null);
    if (snapshot === this.positionsConfigSnapshot) {
      return;
    }
    this.positionsConfigSnapshot = snapshot;
    const { positions, issues } = normalizePositions(raw);
    this.logPositionIssues(issues);
    this.positions = positions;
    logger.info(`已从 settings.json 同步持仓配置，共 ${positions.size} 只股票`);
  }

  /** 输出持仓配置的容错提示（非法条目不阻断插件运行） */
  private logPositionIssues(issues: string[]): void {
    for (const issue of issues) {
      logger.warn(`持仓配置：${issue}`);
    }
  }

  /** 拉取行情并刷新界面 */
  private async refresh(reason: RefreshReason): Promise<void> {
    if (this.refreshing) {
      return;
    }
    const stocks = this.store.list();
    if (stocks.length === 0) {
      this.quotes = new Map();
      this.service.clear();
      this.render();
      return;
    }

    const codes: StockCode[] = stocks.map((s) => ({
      key: s.key,
      code: s.code,
      market: s.market,
    }));
    this.refreshing = true;
    try {
      const { quotes, error } = await this.service.refresh(codes, this.config);
      this.quotes = quotes;
      // 首次拿到行情后回填股票名称，便于列表展示
      for (const quote of quotes.values()) {
        this.store.updateName(quote.key, quote.name);
      }
      this.render();
      if (error) {
        this.notifyError(error, reason);
      } else {
        this.lastNotifiedError = undefined;
      }
    } catch (err) {
      // QuoteService 内部已做异常收敛，此处仅作最后兜底
      logger.error("刷新行情时发生未预期的异常", err);
    } finally {
      this.refreshing = false;
    }
  }

  /** 依据错误码给出可操作的中文提示 */
  private notifyError(error: QuoteError, reason: RefreshReason): void {
    logger.error(`行情刷新失败：${error.message}`);
    if (reason === "timer" && this.lastNotifiedError === error.code) {
      // 轮询期间的同类错误只写日志，避免每 10 秒弹一次窗
      return;
    }
    this.lastNotifiedError = error.code;
    void vscode.window
      .showWarningMessage(`Stock Monitor：${this.errorHint(error)}`, "查看日志")
      .then((choice) => {
        if (choice === "查看日志") {
          logger.show();
        }
      });
  }

  private errorHint(error: QuoteError): string {
    switch (error.code) {
      case QuoteErrorCode.TIMEOUT:
        return "行情请求超时，请检查网络，或调大 stockMonitor.requestTimeout";
      case QuoteErrorCode.NETWORK:
        return `无法连接行情接口（${this.config.apiEndpoint}），请检查网络或代理设置`;
      case QuoteErrorCode.EMPTY:
        return "股票代码无效或接口暂无数据，请检查关注列表中的代码";
      case QuoteErrorCode.PARSE:
        return "行情数据解析失败，接口返回格式可能已变更，请查看日志";
      case QuoteErrorCode.INVALID_CODE:
        return error.message;
      default:
        return `行情刷新失败：${error.message}`;
    }
  }

  /** 配置变更时重新读取并热更新 */
  private applyConfig(): void {
    this.config = readConfig();
    this.store.syncFromConfig(this.config.initialWatchList);
    this.mergeConfigPositions();
    logger.info(
      `配置已更新：刷新间隔 ${this.config.refreshInterval}s，配色 ${this.config.colorScheme}，状态栏上限 ${this.config.maxStatusBarItems}`,
    );
    this.render();
    this.scheduleTimer();
    void this.refresh("manual");
  }

  /** 重启轮询定时器；关闭自动刷新时仅清理定时器，不发任何行情请求 */
  private scheduleTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (!this.config.autoRefresh) {
      logger.info("自动刷新已关闭，停止定时调用行情接口");
      return;
    }
    this.timer = setInterval(
      () => void this.refresh("timer"),
      this.config.refreshInterval * 1000,
    );
  }

  /** 添加关注股票 */
  private async addStock(): Promise<void> {
    const input = await vscode.window.showInputBox({
      title: "添加股票",
      prompt: "支持 A 股（600519 / sh000001）、港股（00700）、美股（AAPL）",
      placeHolder: "例如：sh600519、00700、AAPL",
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value.trim()) {
          return "请输入股票代码";
        }
        const parsed = parseStockCode(value);
        return parsed.ok ? undefined : parsed.reason;
      },
    });
    if (!input) {
      return;
    }

    const parsed = parseStockCode(input);
    if (!parsed.ok) {
      void vscode.window.showErrorMessage(`Stock Monitor：${parsed.reason}`);
      return;
    }
    const code = parsed.value;

    if (this.store.has(code.key)) {
      void vscode.window.showInformationMessage(
        `Stock Monitor：${code.code} 已在关注列表中`,
      );
      return;
    }

    // 先探测代码是否真实存在，避免把无效代码写入关注列表
    try {
      const probe = await this.service.fetchOnce([code], this.config);
      const quote = probe.get(code.key);
      if (!quote) {
        void vscode.window.showErrorMessage(
          `Stock Monitor：未查询到 ${input} 的行情，请确认股票代码是否正确（A股 6 位 / 港股 5 位 / 美股字母代码）`,
        );
        return;
      }
      const failure = await this.store.add({
        ...code,
        name: quote.name,
        favorite: false,
      });
      if (failure) {
        void vscode.window.showInformationMessage(`Stock Monitor：${failure}`);
        return;
      }
      this.quotes.set(code.key, quote);
      this.render();
      void vscode.window.showInformationMessage(
        `Stock Monitor：已添加 ${quote.name}（${MARKET_LABEL[code.market]} ${code.code}）`,
      );
    } catch (err) {
      const error =
        err instanceof QuoteError
          ? err
          : new QuoteError(
              QuoteErrorCode.UNKNOWN,
              err instanceof Error ? err.message : "未知错误",
              err,
            );
      logger.error(`添加股票 ${input} 时探测行情失败`, error);
      if (error.code === QuoteErrorCode.EMPTY) {
        void vscode.window.showErrorMessage(
          `Stock Monitor：未查询到 ${input} 的行情，请确认股票代码是否正确`,
        );
        return;
      }
      // 网络类问题不应阻止添加，后续轮询会自动补上数据
      const failure = await this.store.add({
        ...code,
        name: "",
        favorite: false,
      });
      if (failure) {
        void vscode.window.showInformationMessage(`Stock Monitor：${failure}`);
        return;
      }
      this.render();
      void vscode.window.showWarningMessage(
        `Stock Monitor：已添加 ${code.code}，但当前网络异常（${error.message}），稍后将自动重试`,
      );
    }
  }

  /** 移除关注股票：支持树视图右键与命令面板两种入口 */
  private async removeStock(node?: unknown): Promise<void> {
    const target = toWatchedStock(node);
    if (target) {
      if (await this.store.remove(target.key)) {
        void vscode.window.showInformationMessage(
          `Stock Monitor：已移除 ${this.displayNameOf(target)}`,
        );
      }
      return;
    }

    const picked = await this.pickStock("移除关注股票", "选择要移除的股票");
    if (picked) {
      if (await this.store.remove(picked.key)) {
        void vscode.window.showInformationMessage(
          `Stock Monitor：已移除 ${this.displayNameOf(picked)}`,
        );
      }
    }
  }

  /** 切换收藏状态，收藏项会优先展示在状态栏与列表顶部 */
  private async toggleFavorite(node?: unknown): Promise<void> {
    const target = toWatchedStock(node);
    if (target) {
      const favorite = await this.store.toggleFavorite(target.key);
      if (favorite !== undefined) {
        void vscode.window.showInformationMessage(
          `Stock Monitor：${favorite ? "已收藏" : "已取消收藏"} ${this.displayNameOf(target)}`,
        );
      }
      return;
    }

    const picked = await this.pickStock(
      "收藏 / 取消收藏",
      "选择要切换收藏状态的股票",
    );
    if (picked) {
      const favorite = await this.store.toggleFavorite(picked.key);
      if (favorite !== undefined) {
        void vscode.window.showInformationMessage(
          `Stock Monitor：${favorite ? "已收藏" : "已取消收藏"} ${this.displayNameOf(picked)}`,
        );
      }
    }
  }

  /**
   * 设置持仓：通过连续输入框维护别名、成本价与持仓数量，
   * 结果写入 settings.json，使配置文件与界面展示保持一致。
   */
  private async setPosition(node?: unknown): Promise<void> {
    const target =
      toWatchedStock(node) ??
      (await this.pickStock("设置持仓", "选择要设置持仓的股票"));
    if (!target) {
      return;
    }

    const current = this.positions.get(target.key);
    const displayName = this.displayNameOf(target);
    const title = `设置持仓 - ${displayName}`;

    const aliasInput = await vscode.window.showInputBox({
      title,
      prompt: "股票别名，留空则展示股票名称（全部留空将清除该股票的持仓配置）",
      value: current?.alias ?? "",
      ignoreFocusOut: true,
    });
    if (aliasInput === undefined) {
      return; // 用户取消
    }

    // 成本价与持仓数量均允许留空：仅配置别名时不会计算收益
    const costInput = await vscode.window.showInputBox({
      title,
      prompt: "持仓成本价（每股价），留空表示不计算持仓总收益",
      value: current?.costPrice !== undefined ? String(current.costPrice) : "",
      ignoreFocusOut: true,
      validateInput: this.positiveNumberValidator("成本价"),
    });
    if (costInput === undefined) {
      return;
    }

    const sharesInput = await vscode.window.showInputBox({
      title,
      prompt: "持仓数量（股），留空表示不计算收益",
      value: current?.shares !== undefined ? String(current.shares) : "",
      ignoreFocusOut: true,
      validateInput: this.positiveNumberValidator("持仓数量"),
    });
    if (sharesInput === undefined) {
      return;
    }

    const alias = aliasInput.trim() || undefined;
    const costPrice = this.toPositiveNumber(costInput);
    const shares = this.toPositiveNumber(sharesInput);
    try {
      if (alias || costPrice || shares) {
        this.positions.set(target.key, { ...target, alias, costPrice, shares });
      } else {
        // 三项均留空视为清除该股票的持仓
        this.positions.delete(target.key);
      }
      await this.persistPositions();
      this.render();
      void vscode.window.showInformationMessage(
        alias || costPrice || shares
          ? `Stock Monitor：已更新 ${displayName} 的持仓配置`
          : `Stock Monitor：已清除 ${displayName} 的持仓配置`,
      );
    } catch (err) {
      logger.error("保存持仓配置失败", err);
      void vscode.window.showErrorMessage(
        `Stock Monitor：保存持仓配置失败：${err instanceof Error ? err.message : "未知错误"}`,
      );
    }
  }

  /** 名称展示优先级：别名 > 股票名称 > 代码 */
  private displayNameOf(stock: WatchedStock): string {
    return this.positions.get(stock.key)?.alias || stock.name || stock.code;
  }

  /** 数字输入校验：留空合法，否则必须为大于 0 的数字 */
  private positiveNumberValidator(
    label: string,
  ): (value: string) => string | undefined {
    return (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) && parsed > 0
        ? undefined
        : `${label}需为大于 0 的数字`;
    };
  }

  /** 字符串转正数，非法或留空返回 undefined */
  private toPositiveNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  /** 从关注列表中选择一只股票（列表为空时给出提示） */
  private async pickStock(
    title: string,
    placeHolder: string,
  ): Promise<WatchedStock | undefined> {
    const stocks = this.store.list();
    if (stocks.length === 0) {
      void vscode.window.showInformationMessage("Stock Monitor：关注列表为空");
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      stocks.map((stock) => ({
        label: stock.favorite
          ? `$(star-full) ${stock.name || stock.code}`
          : stock.name || stock.code,
        description: `${MARKET_LABEL[stock.market]} ${stock.code}${stock.favorite ? " · 已收藏" : ""}`,
        stock,
      })),
      { title, placeHolder },
    );
    return picked?.stock;
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.statusBar.dispose();
    this.treeProvider.dispose();
    this.store.dispose();
    logger.dispose();
    void this.context;
  }
}
