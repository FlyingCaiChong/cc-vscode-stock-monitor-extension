import { parseStockCode } from './market/stockCode';
import { MarketId, Quote } from './types';

/**
 * 持仓收益计算。
 *
 * 说明：本文件为纯函数实现，不依赖 `vscode` 模块与网络，
 * 可被普通 mocha 单元测试直接引用。
 *
 * 数据来源：配置项 `stockMonitor.positions`，形如
 *   [{ "code": "sh600519", "alias": "茅台", "costPrice": 1200, "shares": 100 }]
 */

/** 单条持仓配置（已完成代码归一化） */
export interface PositionSetting {
  /** 归一化代码，如 sh600519 */
  key: string;
  /** 纯代码，如 600519 */
  code: string;
  /** 所属市场 */
  market: MarketId;
  /** 别名，展示时优先于股票名称 */
  alias?: string;
  /** 持仓成本价 */
  costPrice?: number;
  /** 持仓数量（股） */
  shares?: number;
}

/** 归一化后的持仓表：key -> 持仓配置 */
export type PositionMap = Map<string, PositionSetting>;

/** 归一化结果，issues 为被丢弃条目的原因，供日志输出 */
export interface NormalizedPositions {
  positions: PositionMap;
  issues: string[];
}

/**
 * 实时计算出的持仓指标。
 * 未配置持仓数量时只提供 alias / costPrice，收益类字段为 undefined。
 */
export interface PositionMetrics {
  /** 别名 */
  alias?: string;
  /** 成本价 */
  costPrice?: number;
  /** 持仓数量（股） */
  shares?: number;
  /** 持仓市值 = 最新价 × 持仓数量 */
  marketValue?: number;
  /** 当日收益 = （最新价 - 昨收）× 持仓数量 */
  dailyProfit?: number;
  /** 当日收益率（%），即行情涨跌幅 */
  dailyProfitPercent?: number;
  /** 持仓总收益 = （最新价 - 成本价）× 持仓数量 */
  totalProfit?: number;
  /** 持仓收益率（%）= （最新价 - 成本价）/ 成本价 × 100 */
  totalProfitPercent?: number;
}

/** 持仓汇总指标（针对全部已配置且已获取行情的持仓） */
export interface PortfolioSummary {
  /** 已纳入汇总计算的持仓股票数量 */
  count: number;
  /** 持仓总市值 */
  marketValue: number;
  /** 当日参考盈亏总和 */
  dailyProfit: number;
  /** 持仓总收益总和；仅统计配置了成本价的持仓 */
  totalProfit?: number;
}

/** 判断是否为有效正数（用于过滤脏配置） */
function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * 归一化用户配置的持仓列表。
 * 非法条目（代码无法识别、字段类型错误）会被丢弃并记录原因，不会导致插件异常。
 */
export function normalizePositions(raw: unknown): NormalizedPositions {
  const positions: PositionMap = new Map();
  const issues: string[] = [];
  if (raw === undefined || raw === null) {
    return { positions, issues };
  }
  if (!Array.isArray(raw)) {
    issues.push('stockMonitor.positions 需要是数组，当前配置已被忽略');
    return { positions, issues };
  }

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      issues.push(`持仓配置项不是对象，已跳过：${JSON.stringify(entry)}`);
      continue;
    }
    const item = entry as Record<string, unknown>;
    const codeRaw = typeof item.code === 'string' ? item.code : '';
    const parsed = parseStockCode(codeRaw);
    if (!parsed.ok) {
      issues.push(`持仓配置的股票代码 "${codeRaw || '(空)'}" 无法识别，已跳过：${parsed.reason}`);
      continue;
    }

    const setting: PositionSetting = { ...parsed.value };
    if (typeof item.alias === 'string' && item.alias.trim()) {
      setting.alias = item.alias.trim();
    }
    if (isPositiveNumber(item.costPrice)) {
      setting.costPrice = item.costPrice;
    }
    if (isPositiveNumber(item.shares)) {
      setting.shares = item.shares;
    }

    if (positions.has(setting.key)) {
      issues.push(`持仓配置中存在重复代码 ${setting.key}，已用后一条覆盖前一条`);
    }
    positions.set(setting.key, setting);
  }

  return { positions, issues };
}

/** 是否已配置可计算收益的持仓（即持仓数量有效） */
export function hasPosition(metrics: PositionMetrics | undefined): boolean {
  return Boolean(metrics?.shares && metrics.shares > 0);
}

/**
 * 依据最新行情与持仓配置计算收益指标。
 * @param quote 最新行情快照
 * @param setting 该股票的持仓配置
 */
export function computePosition(quote: Quote, setting: PositionSetting): PositionMetrics {
  const metrics: PositionMetrics = { alias: setting.alias, costPrice: setting.costPrice };
  const shares = setting.shares;
  if (!shares || !Number.isFinite(shares) || shares <= 0) {
    // 仅配置了别名／成本价时无法计算收益，直接返回基础信息
    return metrics;
  }

  metrics.shares = shares;
  metrics.marketValue = quote.price * shares;
  metrics.dailyProfit = (quote.price - quote.prevClose) * shares;
  metrics.dailyProfitPercent = quote.changePercent;

  if (setting.costPrice && setting.costPrice > 0) {
    metrics.totalProfit = (quote.price - setting.costPrice) * shares;
    metrics.totalProfitPercent = ((quote.price - setting.costPrice) / setting.costPrice) * 100;
  }

  return metrics;
}

/**
 * 汇总全部持仓的整体收益指标。
 *
 * 规则说明：
 * 1. 仅统计“已配置持仓数量且已有实时行情”的股票；
 * 2. `totalProfit` 只累计配置了成本价的持仓；
 * 3. 若当前没有任何可计算持仓，则返回 undefined，调用方可直接跳过展示。
 */
export function computePortfolioSummary(
  quotes: Map<string, Quote>,
  positions: PositionMap
): PortfolioSummary | undefined {
  let count = 0;
  let marketValue = 0;
  let dailyProfit = 0;
  let totalProfit = 0;
  let hasTotalProfit = false;

  for (const [key, setting] of positions) {
    const quote = quotes.get(key);
    if (!quote) {
      continue;
    }
    const metrics = computePosition(quote, setting);
    if (!hasPosition(metrics) || metrics.marketValue === undefined || metrics.dailyProfit === undefined) {
      continue;
    }
    count += 1;
    marketValue += metrics.marketValue;
    dailyProfit += metrics.dailyProfit;
    if (metrics.totalProfit !== undefined) {
      totalProfit += metrics.totalProfit;
      hasTotalProfit = true;
    }
  }

  if (count === 0) {
    return undefined;
  }

  return {
    count,
    marketValue,
    dailyProfit,
    totalProfit: hasTotalProfit ? totalProfit : undefined,
  };
}
