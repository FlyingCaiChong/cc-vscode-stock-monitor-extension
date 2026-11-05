import { ColorScheme, DisplayField, StockColorOverride } from '../config';
import { PositionMetrics } from '../position';
import { Quote, Trend } from '../types';

/**
 * 纯函数格式化工具（不依赖 vscode 模块，便于单元测试）。
 */

/** 判断涨跌方向：以涨跌额为准，涨跌额为 0 视为平盘 */
export function trendOf(quote: Pick<Quote, 'change' | 'changePercent'>): Trend {
  const value = Number.isFinite(quote.change) && quote.change !== 0 ? quote.change : quote.changePercent;
  if (value > 0) {
    return 'up';
  }
  if (value < 0) {
    return 'down';
  }
  return 'flat';
}

/**
 * 涨跌方向 → 颜色值。
 *
 * 返回值可能是：
 * - VS Code 主题色 ID（如 `charts.green`）
 * - 用户配置的十六进制颜色（如 `#22c55e`）
 */
export function colorIdFor(
  trend: Trend,
  scheme: ColorScheme,
  upColor?: string,
  downColor?: string
): string {
  if (trend === 'flat') {
    return 'descriptionForeground'; // 灰色
  }
  if (trend === 'up' && upColor) {
    return upColor;
  }
  if (trend === 'down' && downColor) {
    return downColor;
  }
  if (scheme === 'redUp') {
    return trend === 'up' ? 'charts.red' : 'charts.green';
  }
  return trend === 'up' ? 'charts.green' : 'charts.red';
}

/** 查找单只股票的颜色覆盖配置 */
export function stockColorOverrideOf(
  key: string,
  overrides: StockColorOverride[]
): StockColorOverride | undefined {
  return overrides.find((item) => item.key === key);
}

/** 计算某只股票最终生效的涨跌颜色 */
export function colorIdForStock(
  key: string,
  trend: Trend,
  scheme: ColorScheme,
  globalUpColor: string | undefined,
  globalDownColor: string | undefined,
  overrides: StockColorOverride[]
): string {
  const override = stockColorOverrideOf(key, overrides);
  return colorIdFor(
    trend,
    scheme,
    override?.upColor ?? globalUpColor,
    override?.downColor ?? globalDownColor
  );
}

/** 涨跌停判定允许的误差（价格保留 2 位小数，用半分作为容差） */
const LIMIT_EPSILON = 0.001;

/**
 * 判断是否处于涨/跌停状态。
 * 仅 A 股提供涨跌停价，其它市场 `limitUp` / `limitDown` 恒为 0，此处自然返回无状态。
 */
export function limitStatusOf(
  quote: Pick<Quote, 'price' | 'limitUp' | 'limitDown'>
): Trend | undefined {
  if (quote.limitUp > 0 && quote.price >= quote.limitUp - LIMIT_EPSILON) {
    return 'up';
  }
  if (quote.limitDown > 0 && quote.price <= quote.limitDown + LIMIT_EPSILON) {
    return 'down';
  }
  return undefined;
}

/** 涨跌停标记文案，如「涨停」；未涨跌停时返回空串 */
export function limitLabelOf(quote: Pick<Quote, 'price' | 'limitUp' | 'limitDown'>): string {
  const status = limitStatusOf(quote);
  if (status === 'up') {
    return '涨停';
  }
  return status === 'down' ? '跌停' : '';
}

/** 固定小数位 */
export function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return value.toFixed(decimals);
}

/** 带正负号的数值，如 +1.85 / -0.32 */
export function formatSigned(value: number, decimals: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}`;
}

/** 带千分位的金额（无符号），如 1,234.56 */
export function formatAmount(value: number, decimals: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  const fixed = Math.abs(value).toFixed(decimals);
  const [integer, fraction] = fixed.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** 带千分位与正负号的金额，如 +1,234.56 / -320.00，用于收益展示 */
export function formatSignedAmount(value: number, decimals: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatAmount(value, decimals)}`;
}

/** 成交量格式化，输入单位为「股」 */
export function formatVolume(shares: number): string {
  if (!Number.isFinite(shares) || shares <= 0) {
    return '--';
  }
  if (shares >= 1e8) {
    return `${(shares / 1e8).toFixed(2)}亿股`;
  }
  if (shares >= 1e4) {
    return `${(shares / 1e4).toFixed(2)}万股`;
  }
  return `${shares}股`;
}

/** 成交额格式化，输入单位为「元」 */
export function formatTurnover(yuan: number): string {
  if (!Number.isFinite(yuan) || yuan <= 0) {
    return '--';
  }
  if (yuan >= 1e8) {
    return `${(yuan / 1e8).toFixed(2)}亿元`;
  }
  if (yuan >= 1e4) {
    return `${(yuan / 1e4).toFixed(2)}万元`;
  }
  return `${yuan}元`;
}

/**
 * 按字段拼接状态栏文本。
 * @param metrics 持仓指标（可选）。配置别名后 `name` 字段优先展示别名；
 *                `profit` / `totalProfit` 字段在未配置持仓数量时自动省略。
 */
export function formatStatusBarText(
  quote: Quote,
  fields: DisplayField[],
  decimals: number,
  metrics?: PositionMetrics
): string {
  const parts: string[] = [];
  for (const field of fields) {
    switch (field) {
      case 'name':
        parts.push(metrics?.alias || quote.name);
        break;
      case 'code':
        parts.push(quote.code);
        break;
      case 'price':
        parts.push(formatNumber(quote.price, decimals));
        break;
      case 'change':
        parts.push(formatSigned(quote.change, decimals));
        break;
      case 'changePercent':
        parts.push(`${formatSigned(quote.changePercent, 2)}%`);
        break;
      case 'high':
        parts.push(`高 ${formatNumber(quote.high, decimals)}`);
        break;
      case 'low':
        parts.push(`低 ${formatNumber(quote.low, decimals)}`);
        break;
      case 'open':
        parts.push(`开 ${formatNumber(quote.open, decimals)}`);
        break;
      case 'prevClose':
        parts.push(`昨 ${formatNumber(quote.prevClose, decimals)}`);
        break;
      case 'volume':
        parts.push(formatVolume(quote.volume));
        break;
      case 'turnover':
        parts.push(formatTurnover(quote.turnover));
        break;
      case 'turnoverRate':
        if (quote.turnoverRate > 0) {
          parts.push(`换手 ${formatNumber(quote.turnoverRate, 2)}%`);
        }
        break;
      case 'amplitude':
        if (quote.amplitude > 0) {
          parts.push(`振幅 ${formatNumber(quote.amplitude, 2)}%`);
        }
        break;
      case 'volumeRatio':
        if (quote.volumeRatio > 0) {
          parts.push(`量比 ${formatNumber(quote.volumeRatio, 2)}`);
        }
        break;
      case 'peTtm':
        if (quote.peTtm > 0) {
          parts.push(`PE ${formatNumber(quote.peTtm, 2)}`);
        }
        break;
      case 'pb':
        if (quote.pb > 0) {
          parts.push(`PB ${formatNumber(quote.pb, 2)}`);
        }
        break;
      case 'marketCap':
        if (quote.marketCap > 0) {
          parts.push(`市值 ${formatTurnover(quote.marketCap)}`);
        }
        break;
      case 'time':
        parts.push(quote.time);
        break;
      case 'profit':
        // 未配置持仓数量时 metrics.dailyProfit 为 undefined，此处自动跳过
        if (metrics?.dailyProfit !== undefined) {
          parts.push(`当日 ${formatSignedAmount(metrics.dailyProfit, decimals)}`);
        }
        break;
      case 'totalProfit':
        if (metrics?.totalProfit !== undefined) {
          parts.push(`总 ${formatSignedAmount(metrics.totalProfit, decimals)}`);
        }
        break;
      default:
        break;
    }
  }
  const text = parts.filter(Boolean).join(' ');
  // 涨跌停是强信号，无需额外配置即在状态栏末尾自动标记
  const limitLabel = limitLabelOf(quote);
  return limitLabel ? `${text} ${limitLabel}` : text;
}

/** 悬浮提示的明细行，[标签, 值] */
export function detailRows(quote: Quote, decimals: number): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['最新价', formatNumber(quote.price, decimals)],
    ['涨跌额', formatSigned(quote.change, decimals)],
    ['涨跌幅', `${formatSigned(quote.changePercent, 2)}%`],
    ['今开', formatNumber(quote.open, decimals)],
    ['昨收', formatNumber(quote.prevClose, decimals)],
    ['最高', formatNumber(quote.high, decimals)],
    ['最低', formatNumber(quote.low, decimals)],
    ['成交量', formatVolume(quote.volume)],
    ['成交额', formatTurnover(quote.turnover)],
  ];
  // 以下字段并非所有市场都提供（港股无换手率、港美股无量比 / 涨跌停价），
  // 仅在拿到有效数值时追加，避免展示无意义的 0。
  if (quote.turnoverRate > 0) {
    rows.push(['换手率', `${formatNumber(quote.turnoverRate, 2)}%`]);
  }
  if (quote.amplitude > 0) {
    rows.push(['振幅', `${formatNumber(quote.amplitude, 2)}%`]);
  }
  if (quote.volumeRatio > 0) {
    rows.push(['量比', formatNumber(quote.volumeRatio, 2)]);
  }
  if (quote.peTtm > 0) {
    rows.push(['市盈率(TTM)', formatNumber(quote.peTtm, 2)]);
  }
  if (quote.pb > 0) {
    rows.push(['市净率', formatNumber(quote.pb, 2)]);
  }
  if (quote.marketCap > 0) {
    rows.push(['总市值', formatTurnover(quote.marketCap)]);
  }
  if (quote.limitUp > 0) {
    rows.push(['涨停价', formatNumber(quote.limitUp, decimals)]);
  }
  if (quote.limitDown > 0) {
    rows.push(['跌停价', formatNumber(quote.limitDown, decimals)]);
  }
  const limitLabel = limitLabelOf(quote);
  if (limitLabel) {
    rows.push(['状态', limitLabel]);
  }
  rows.push(['行情时间', quote.time || '--']);
  return rows;
}

/**
 * 持仓收益明细行，[标签, 值]。未配置持仓时返回空数组，调用方可直接跳过。
 */
export function positionRows(metrics: PositionMetrics | undefined, decimals: number): Array<[string, string]> {
  if (!metrics) {
    return [];
  }
  const rows: Array<[string, string]> = [];
  if (metrics.alias) {
    rows.push(['别名', metrics.alias]);
  }
  if (metrics.costPrice !== undefined) {
    rows.push(['成本价', formatNumber(metrics.costPrice, decimals)]);
  }
  if (metrics.shares !== undefined) {
    rows.push(['持仓数量', formatVolume(metrics.shares)]);
  }
  if (metrics.marketValue !== undefined) {
    rows.push(['持仓市值', `${formatAmount(metrics.marketValue, decimals)} 元`]);
  }
  if (metrics.dailyProfit !== undefined) {
    rows.push(['当日收益', `${formatSignedAmount(metrics.dailyProfit, decimals)} 元`]);
    rows.push(['当日收益率', `${formatSigned(metrics.dailyProfitPercent ?? 0, 2)}%`]);
  }
  if (metrics.totalProfit !== undefined) {
    rows.push(['持仓总收益', `${formatSignedAmount(metrics.totalProfit, decimals)} 元`]);
    rows.push(['持仓收益率', `${formatSigned(metrics.totalProfitPercent ?? 0, 2)}%`]);
  }
  return rows;
}
