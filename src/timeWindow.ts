/**
 * 行情刷新时间段工具。
 *
 * 说明：本模块为纯函数实现，不依赖 `vscode`，可直接被单元测试引用。
 */

/** 单个刷新时间段，使用 `HH:mm` 24 小时制表示 */
export interface RefreshTimeRange {
  /** 开始时间，如 `09:00` */
  start: string;
  /** 结束时间，如 `11:35`（含该分钟） */
  end: string;
}

/** 默认刷新时间段：覆盖 A 股上午、下午两段连续竞价时段 */
export const DEFAULT_REFRESH_TIME_RANGES: readonly RefreshTimeRange[] = [
  { start: '09:00', end: '11:35' },
  { start: '12:55', end: '15:05' },
];

/** 时间字符串正则：允许 1 ~ 2 位小时与分钟，如 `9:00` / `09:00` */
const TIME_PATTERN = /^(\d{1,2}):(\d{1,2})$/;

/**
 * 将 `HH:mm` 解析为「当天第几分钟」，便于区间比较。
 * @param value 时间字符串，允许 `9:00` 这类未补零写法
 * @returns 合法时返回 0 ~ 1439，非法返回 undefined
 */
export function parseTimeToMinutes(value: string): number | undefined {
  const matched = TIME_PATTERN.exec(value.trim());
  if (!matched) {
    return undefined;
  }
  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (hours > 23 || minutes > 59) {
    return undefined;
  }
  return hours * 60 + minutes;
}

/**
 * 规范化时间字符串为补零的 `HH:mm`，用于统一展示与比较。
 * @returns 合法时如 `09:05`，非法返回 undefined
 */
export function normalizeTime(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const total = parseTimeToMinutes(value);
  if (total === undefined) {
    return undefined;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * 规范化时间段配置数组，非法条目直接忽略（与持仓配置容错策略一致）。
 * @param raw settings.json 中读取到的原始值
 */
export function normalizeTimeRanges(raw: unknown): RefreshTimeRange[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const ranges: RefreshTimeRange[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const item = entry as Record<string, unknown>;
    const start = normalizeTime(item.start);
    const end = normalizeTime(item.end);
    if (start && end) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

/**
 * 判断指定时间是否落在任一时间段内。
 *
 * 规则：
 * - 时间段为空时视为「不限制」，恒返回 true（避免误配导致完全不刷新）
 * - 起止时间均为**闭区间**，如 `11:35` 表示到 `11:35:59` 为止
 * - 支持跨零点时间段，如 `22:00` ~ `02:00`
 *
 * @param ranges 已规范化的时间段
 * @param now 待判断的时间，默认取当前时间
 */
export function isWithinTimeRanges(
  ranges: readonly RefreshTimeRange[],
  now: Date = new Date(),
): boolean {
  if (ranges.length === 0) {
    return true;
  }
  const current = now.getHours() * 60 + now.getMinutes();
  for (const range of ranges) {
    const start = parseTimeToMinutes(range.start);
    const end = parseTimeToMinutes(range.end);
    if (start === undefined || end === undefined) {
      continue;
    }
    if (start <= end) {
      if (current >= start && current <= end) {
        return true;
      }
    } else if (current >= start || current <= end) {
      // 跨零点：如 22:00 ~ 02:00
      return true;
    }
  }
  return false;
}
