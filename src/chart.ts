import { MarketId, QuoteError, QuoteErrorCode, StockCode } from './types';

/** 图表周期 */
export type ChartPeriod = 'intraday' | 'daily' | 'weekly' | 'monthly';

/** 图表标题文案 */
export const CHART_PERIOD_LABEL: Record<ChartPeriod, string> = {
  intraday: '分时图',
  daily: '日K图',
  weekly: '周K图',
  monthly: '月K图',
};

/** 分时图上的单个点 */
export interface IntradayPoint {
  /** 分钟标签，如 09:30 */
  time: string;
  /** 最新价 */
  price: number;
  /** 成交量（统一换算后的股数） */
  volume: number;
  /** 成交额，单位元 */
  amount: number;
  /** 均价 */
  averagePrice: number;
}

/** K 线上的单根蜡烛 */
export interface KlinePoint {
  /** 日期标签，如 2026-11-04 */
  time: string;
  open: number;
  close: number;
  high: number;
  low: number;
  /** 成交量（统一换算后的股数） */
  volume: number;
}

/** 发给 Webview 的统一图表数据结构 */
export interface StockChartData {
  period: ChartPeriod;
  name: string;
  code: string;
  market: MarketId;
  /** 行情最新时间，优先用于标题区展示 */
  updatedAt: string;
  /** 昨收价；分时图会据此绘制中轴线 */
  previousClose?: number;
  /** 价格建议小数位，主要用于美股显示更细粒度价格 */
  priceDecimals: number;
  points: IntradayPoint[] | KlinePoint[];
}

/** 腾讯图表接口返回的 data[key] 节点 */
interface RawChartEntry {
  data?: {
    data?: string[];
    date?: string;
  };
  qt?: Record<string, string[]>;
  [key: string]: unknown;
}

/** 是否为 A 股市场（成交量需从「手」换算为「股」） */
function isCnMarket(market: MarketId): boolean {
  return market === 'sh' || market === 'sz' || market === 'bj';
}

/** 数值安全转换 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 统一分钟标签格式：0930 -> 09:30 */
function normalizeMinuteLabel(raw: string): string {
  if (!/^\d{4}$/.test(raw)) {
    return raw;
  }
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
}

/** 提取图表接口中的 qt 节点 */
function quoteFieldsOf(entry: RawChartEntry, key: string): string[] {
  const fields = entry.qt?.[key];
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new QuoteError(QuoteErrorCode.PARSE, `图表接口缺少 ${key} 的 qt 行情字段`);
  }
  return fields;
}

/** 从日 / 周 / 月 K 响应中找出真正的 K 线数组字段（如 qfqday / day / qfqweek / week） */
function klineRowsOf(entry: RawChartEntry): unknown[] {
  for (const [field, value] of Object.entries(entry)) {
    if (field === 'qt' || field === 'data') {
      continue;
    }
    if (Array.isArray(value)) {
      return value;
    }
  }
  throw new QuoteError(QuoteErrorCode.PARSE, '图表接口未返回有效的 K 线数据');
}

/** 价格显示精度：美股通常保留更多位，其余市场沿用 2 位 */
function priceDecimalsOf(market: MarketId): number {
  return market === 'us' ? 2 : 2;
}

/** 解析腾讯分时接口响应 */
export function parseIntradayChartResponse(raw: unknown, stock: StockCode): StockChartData {
  const entry = (raw as { data?: Record<string, RawChartEntry> } | undefined)?.data?.[stock.key];
  if (!entry || !Array.isArray(entry.data?.data)) {
    throw new QuoteError(QuoteErrorCode.PARSE, `未找到 ${stock.key} 的分时图数据`);
  }

  const fields = quoteFieldsOf(entry, stock.key);
  const previousClose = toNumber(fields[4]);
  const updatedAt = typeof fields[30] === 'string' ? fields[30] : '';
  const volumeScale = isCnMarket(stock.market) ? 100 : 1;

  const points: IntradayPoint[] = entry.data.data
    .map((row) => {
      const [rawTime, rawPrice, rawVolume, rawAmount] = row.split(/\s+/);
      const price = toNumber(rawPrice);
      const volume = toNumber(rawVolume) * volumeScale;
      const amount = toNumber(rawAmount);
      const averagePrice = volume > 0 ? amount / volume : price;
      if (!rawTime || price <= 0) {
        return undefined;
      }
      return {
        time: normalizeMinuteLabel(rawTime),
        price,
        volume,
        amount,
        averagePrice,
      };
    })
    .filter((point): point is IntradayPoint => point !== undefined);

  if (points.length === 0) {
    throw new QuoteError(QuoteErrorCode.EMPTY, `${stock.key} 暂无可展示的分时图数据`);
  }

  return {
    period: 'intraday',
    name: fields[1] || stock.code,
    code: stock.code,
    market: stock.market,
    updatedAt,
    previousClose,
    priceDecimals: priceDecimalsOf(stock.market),
    points,
  };
}

/** 解析腾讯日 / 周 / 月 K 响应 */
export function parseKlineChartResponse(
  raw: unknown,
  stock: StockCode,
  period: Exclude<ChartPeriod, 'intraday'>,
): StockChartData {
  const entry = (raw as { data?: Record<string, RawChartEntry> } | undefined)?.data?.[stock.key];
  if (!entry) {
    throw new QuoteError(QuoteErrorCode.PARSE, `未找到 ${stock.key} 的 ${CHART_PERIOD_LABEL[period]} 数据`);
  }

  const fields = quoteFieldsOf(entry, stock.key);
  const rows = klineRowsOf(entry);
  const volumeScale = isCnMarket(stock.market) ? 100 : 1;

  const points: KlinePoint[] = rows
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) {
        return undefined;
      }
      const [time, open, close, high, low, volume] = row;
      const parsedOpen = toNumber(open);
      const parsedClose = toNumber(close);
      const parsedHigh = toNumber(high);
      const parsedLow = toNumber(low);
      if (typeof time !== 'string' || parsedOpen <= 0 || parsedClose <= 0) {
        return undefined;
      }
      return {
        time,
        open: parsedOpen,
        close: parsedClose,
        high: parsedHigh,
        low: parsedLow,
        volume: toNumber(volume) * volumeScale,
      };
    })
    .filter((point): point is KlinePoint => point !== undefined);

  if (points.length === 0) {
    throw new QuoteError(QuoteErrorCode.EMPTY, `${stock.key} 暂无可展示的 ${CHART_PERIOD_LABEL[period]} 数据`);
  }

  return {
    period,
    name: fields[1] || stock.code,
    code: stock.code,
    market: stock.market,
    updatedAt: typeof fields[30] === 'string' ? fields[30] : '',
    previousClose: toNumber(fields[4]),
    priceDecimals: priceDecimalsOf(stock.market),
    points,
  };
}
