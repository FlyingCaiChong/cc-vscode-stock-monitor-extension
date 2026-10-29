/**
 * 全局类型定义。
 *
 * 说明：本文件不依赖 `vscode` 模块，可被单元测试直接引用。
 */

/** 支持的交易市场标识 */
export type MarketId = 'sh' | 'sz' | 'bj' | 'hk' | 'us';

/** 归一化之后的股票代码 */
export interface StockCode {
  /** 归一化唯一键，同时作为行情接口请求码，如 sh600519 / hk00700 / usAAPL */
  key: string;
  /** 纯代码（用于界面展示），如 600519 / 00700 / AAPL */
  code: string;
  /** 所属市场 */
  market: MarketId;
}

/** 单只股票的实时行情快照 */
export interface Quote {
  /** 与 StockCode.key 对应 */
  key: string;
  /** 纯代码 */
  code: string;
  /** 所属市场 */
  market: MarketId;
  /** 股票名称 */
  name: string;
  /** 最新价 */
  price: number;
  /** 昨收价 */
  prevClose: number;
  /** 今开价 */
  open: number;
  /** 最高价 */
  high: number;
  /** 最低价 */
  low: number;
  /** 涨跌额 */
  change: number;
  /** 涨跌幅（百分数值，1.85 表示 +1.85%） */
  changePercent: number;
  /** 成交量，统一换算为「股」 */
  volume: number;
  /** 成交额，统一换算为「元」 */
  turnover: number;
  /** 行情时间，统一为 HH:mm:ss；无法解析时为空串 */
  time: string;
  /** 本地拉取时间戳（毫秒） */
  fetchedAt: number;
}

/** 涨跌方向 */
export type Trend = 'up' | 'down' | 'flat';

/** 关注列表中的股票 */
export interface WatchedStock {
  /** 归一化代码，主键 */
  key: string;
  /** 纯代码 */
  code: string;
  /** 所属市场 */
  market: MarketId;
  /** 展示名称，首次行情拉取成功后回填 */
  name: string;
  /** 是否收藏；收藏项在状态栏与列表中优先展示 */
  favorite: boolean;
}

/** 行情异常错误码 */
export enum QuoteErrorCode {
  /** 股票代码无法识别 */
  INVALID_CODE = 'INVALID_CODE',
  /** 网络不可达 / DNS 失败 */
  NETWORK = 'NETWORK',
  /** 请求超时 */
  TIMEOUT = 'TIMEOUT',
  /** 响应内容无法解析 */
  PARSE = 'PARSE',
  /** 接口返回为空（通常是代码不存在） */
  EMPTY = 'EMPTY',
  /** 其他未知错误 */
  UNKNOWN = 'UNKNOWN',
}

/**
 * 统一的行情异常类型。
 * 上层 UI 依据 `code` 输出友好中文提示，避免直接把堆栈抛给用户。
 */
export class QuoteError extends Error {
  constructor(
    readonly code: QuoteErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'QuoteError';
  }
}

/** 股票代码解析结果的判别联合类型 */
export type ParseStockResult =
  | { ok: true; value: StockCode }
  | { ok: false; reason: string };
