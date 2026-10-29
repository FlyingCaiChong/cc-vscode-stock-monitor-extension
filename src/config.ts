import * as vscode from 'vscode';

/** 状态栏停靠位置 */
export type StatusBarAlignment = 'left' | 'right';

/**
 * 涨跌配色方案：
 * - greenUp：上涨绿、下跌红（国际市场惯例，本插件默认值）
 * - redUp：上涨红、下跌绿（A 股投资者习惯）
 */
export type ColorScheme = 'greenUp' | 'redUp';

/** 状态栏 / 悬浮提示可展示的字段 */
export type DisplayField =
  | 'name'
  | 'code'
  | 'price'
  | 'change'
  | 'changePercent'
  | 'high'
  | 'low'
  | 'open'
  | 'prevClose'
  | 'volume'
  | 'turnover'
  | 'time'
  | 'profit'
  | 'totalProfit';

/** 插件配置的强类型快照 */
export interface StockMonitorConfig {
  /** 自动刷新间隔（秒） */
  refreshInterval: number;
  /** 状态栏位置 */
  statusBarAlignment: StatusBarAlignment;
  /** 状态栏优先级，数值越大越靠前 */
  statusBarPriority: number;
  /** 状态栏最多展示的股票数量 */
  maxStatusBarItems: number;
  /** 状态栏展示字段及顺序 */
  displayFields: DisplayField[];
  /** 涨跌配色方案 */
  colorScheme: ColorScheme;
  /** 价格保留小数位 */
  decimals: number;
  /** 行情接口地址 */
  apiEndpoint: string;
  /** 单次请求超时（毫秒） */
  requestTimeout: number;
  /** 首次启动时写入的默认关注列表 */
  initialWatchList: string[];
  /**
   * 持仓配置原始值（未归一化）。
   * 交给 `position.normalizePositions` 做容错解析，避免在配置层引入业务逻辑。
   */
  positions: unknown;
}

/** 配置节名称，与 package.json 中 contributes.configuration 保持一致 */
export const CONFIG_SECTION = 'stockMonitor';

/** 数值区间裁剪，防止用户配置越界导致异常 */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/** 读取并规范化当前工作区配置 */
export function readConfig(): StockMonitorConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    refreshInterval: clamp(cfg.get<number>('refreshInterval', 10), 5, 300),
    statusBarAlignment: cfg.get<StatusBarAlignment>('statusBarAlignment', 'left'),
    statusBarPriority: cfg.get<number>('statusBarPriority', 100),
    maxStatusBarItems: clamp(cfg.get<number>('maxStatusBarItems', 6), 1, 20),
    displayFields: cfg.get<DisplayField[]>('displayFields', ['name', 'price', 'changePercent']),
    colorScheme: cfg.get<ColorScheme>('colorScheme', 'greenUp'),
    decimals: clamp(cfg.get<number>('decimals', 2), 0, 4),
    apiEndpoint: (cfg.get<string>('apiEndpoint', 'https://qt.gtimg.cn') || 'https://qt.gtimg.cn').replace(/\/+$/, ''),
    requestTimeout: clamp(cfg.get<number>('requestTimeout', 5000), 1000, 30000),
    initialWatchList: cfg.get<string[]>('watchList', ['sh000001', 'sz399001', 'sh600519']),
    positions: cfg.get<unknown>('positions', []),
  };
}

/** 注册配置变更监听，返回可释放对象 */
export function onConfigChanged(handler: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      handler();
    }
  });
}
