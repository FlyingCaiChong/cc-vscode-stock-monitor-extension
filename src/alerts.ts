import { parseStockCode } from './market/stockCode';
import { Quote } from './types';

/**
 * 价格 / 涨跌幅预警。
 *
 * 说明：本文件为纯函数实现，不依赖 `vscode` 模块与网络，
 * 可被普通 mocha 单元测试直接引用。
 *
 * 数据来源：配置项 `stockMonitor.alerts`，形如
 *   [{ "code": "sh600519", "above": 1600, "below": 1400, "changePercentAbove": 5 }]
 */

/** 单条预警规则（已完成代码归一化） */
export interface AlertRule {
  /** 归一化代码，如 sh600519 */
  key: string;
  /** 纯代码，展示用，如 600519 */
  code: string;
  /** 最新价上破该值时提醒 */
  above?: number;
  /** 最新价下破该值时提醒 */
  below?: number;
  /** 涨跌幅上破该百分比时提醒，如 5 表示 +5% */
  changePercentAbove?: number;
  /** 涨跌幅下破该百分比时提醒，如 -5 表示 -5% */
  changePercentBelow?: number;
  /**
   * 是否只在「未触发 → 触发」的瞬间提醒一次。
   * 条件恢复（如价格回落）后会自动重新武装，可再次提醒，避免持续刷屏。
   */
  once: boolean;
}

/** 数值格式化，统一保留两位小数（与预警阈值配置精度一致） */
function fmt(value: number): string {
  return value.toFixed(2);
}

/** 是否为正的有限数值 */
function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** 是否为有限数值（涨跌幅允许为负） */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 归一化用户配置的预警规则。
 *
 * 容错策略：
 * - 代码无法识别、未配置任何阈值、或阈值类型非法的条目会被丢弃（记录在 issues 中）
 * - 同一只股票只保留最后一条规则，如需同时监控上破与下破，请写在同一对象内
 */
export function normalizeAlerts(raw: unknown): { alerts: AlertRule[]; issues: string[] } {
  const issues: string[] = [];
  if (raw === undefined || raw === null) {
    return { alerts: [], issues };
  }
  if (!Array.isArray(raw)) {
    issues.push('stockMonitor.alerts 需要是数组，当前配置已被忽略');
    return { alerts: [], issues };
  }

  const byKey = new Map<string, AlertRule>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      issues.push(`预警规则不是对象，已跳过：${JSON.stringify(entry)}`);
      continue;
    }
    const item = entry as Record<string, unknown>;
    const parsed = parseStockCode(typeof item.code === 'string' ? item.code : '');
    if (!parsed.ok) {
      issues.push(`预警规则的股票代码 "${String(item.code ?? '(空)')}" 无法识别，已跳过：${parsed.reason}`);
      continue;
    }

    const rule: AlertRule = { ...parsed.value, once: item.once !== false };
    if (isPositiveNumber(item.above)) {
      rule.above = item.above;
    }
    if (isPositiveNumber(item.below)) {
      rule.below = item.below;
    }
    if (isFiniteNumber(item.changePercentAbove)) {
      rule.changePercentAbove = item.changePercentAbove;
    }
    if (isFiniteNumber(item.changePercentBelow)) {
      rule.changePercentBelow = item.changePercentBelow;
    }

    // 四个阈值全部缺失时该规则没有意义，直接丢弃
    if (
      rule.above === undefined &&
      rule.below === undefined &&
      rule.changePercentAbove === undefined &&
      rule.changePercentBelow === undefined
    ) {
      issues.push(`预警规则 ${rule.key} 未配置任何阈值，已跳过`);
      continue;
    }

    if (byKey.has(rule.key)) {
      issues.push(`预警配置中存在重复代码 ${rule.key}，已用后一条覆盖前一条`);
    }
    byKey.set(rule.key, rule);
  }

  return { alerts: [...byKey.values()], issues };
}

/**
 * 计算每条规则当前是否处于触发状态。
 *
 * 注意：本函数只反映「当前是否越界」，与是否已经提醒过无关；
 * 调用方（控制器）据此决定：
 * - 用返回的 key 集合在状态栏做高亮
 * - 结合 `AlertRule.once` 与自身记录的已提醒状态决定是否弹窗
 *
 * @param rules 已归一化的预警规则
 * @param quotes 当前行情快照（键为 StockCode.key）
 * @returns 触发中的股票：key -> 人类可读的触发原因列表
 */
export function evaluateAlerts(
  rules: readonly AlertRule[],
  quotes: Map<string, Quote>,
): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const rule of rules) {
    const quote = quotes.get(rule.key);
    if (!quote) {
      continue; // 该股票暂无行情（或已被移除），跳过
    }

    const reasons: string[] = [];
    if (rule.above !== undefined && quote.price >= rule.above) {
      reasons.push(`最新价 ${fmt(quote.price)} 已上破 ${fmt(rule.above)}`);
    }
    if (rule.below !== undefined && quote.price <= rule.below) {
      reasons.push(`最新价 ${fmt(quote.price)} 已下破 ${fmt(rule.below)}`);
    }
    if (rule.changePercentAbove !== undefined && quote.changePercent >= rule.changePercentAbove) {
      reasons.push(`涨跌幅 ${fmt(quote.changePercent)}% 已上破 ${fmt(rule.changePercentAbove)}%`);
    }
    if (rule.changePercentBelow !== undefined && quote.changePercent <= rule.changePercentBelow) {
      reasons.push(`涨跌幅 ${fmt(quote.changePercent)}% 已下破 ${fmt(rule.changePercentBelow)}%`);
    }

    if (reasons.length > 0) {
      hits.set(rule.key, reasons);
    }
  }
  return hits;
}
