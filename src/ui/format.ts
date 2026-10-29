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
  return parts.filter(Boolean).join(' ');
}

/** 悬浮提示的明细行，[标签, 值] */
export function detailRows(quote: Quote, decimals: number): Array<[string, string]> {
  return [
    ['最新价', formatNumber(quote.price, decimals)],
    ['涨跌额', formatSigned(quote.change, decimals)],
    ['涨跌幅', `${formatSigned(quote.changePercent, 2)}%`],
    ['今开', formatNumber(quote.open, decimals)],
    ['昨收', formatNumber(quote.prevClose, decimals)],
    ['最高', formatNumber(quote.high, decimals)],
    ['最低', formatNumber(quote.low, decimals)],
    ['成交量', formatVolume(quote.volume)],
    ['成交额', formatTurnover(quote.turnover)],
    ['行情时间', quote.time || '--'],
  ];
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
