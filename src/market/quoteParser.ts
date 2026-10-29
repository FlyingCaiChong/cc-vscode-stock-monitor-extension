import { MarketId, Quote, StockCode } from '../types';

/**
 * 腾讯财经行情文本解析器。
 *
 * 说明：本文件为纯函数实现，不依赖 `vscode` 模块与网络，
 * 因此可以被普通 mocha 单元测试直接引用（无需启动扩展宿主）。
 *
 * 接口返回格式（GBK 文本，每个代码一行）：
 *   v_sh600519="1~贵州茅台~600519~1330.75~1355.90~...";
 *
 * 字段下标（各市场一致）：
 *   1 名称 | 2 代码 | 3 最新价 | 4 昨收 | 5 今开
 *   30 行情时间 | 31 涨跌额 | 32 涨跌幅 | 33 最高 | 34 最低
 *   36 成交量  | 37 成交额
 */

/** 安全地把字符串转为数字，非法值返回 0 */
function toNumber(raw: string | undefined): number {
  if (!raw) {
    return 0;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

/** 将各市场不同的时间格式统一为 HH:mm:ss */
export function normalizeQuoteTime(raw: string): string {
  if (!raw) {
    return '';
  }
  const compact = /^(\d{14})$/.exec(raw); // A 股：20261028161454
  if (compact) {
    return `${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
  }
  const separated = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw); // 港股/US：2026/10/28 16:08:30
  if (separated) {
    const [, hh, mm, ss] = separated;
    return `${hh.padStart(2, '0')}:${mm}:${ss ?? '00'}`;
  }
  return '';
}

/**
 * 解析单条 `v_xxx="a~b~c"` 记录。
 * 返回 undefined 表示该代码无有效行情（通常是代码不存在或已退市）。
 */
export function parseQuoteLine(key: string, payload: string, expected: StockCode | undefined): Quote | undefined {
  const fields = payload.split('~');
  // 有效记录至少应包含到成交额字段（下标 37）
  if (fields.length < 38) {
    return undefined;
  }

  const market: MarketId = expected?.market ?? (key.slice(0, 2) as MarketId);
  const name = (fields[1] ?? '').trim();
  if (!name) {
    return undefined;
  }

  const price = toNumber(fields[3]);
  const prevClose = toNumber(fields[4]);
  if (price <= 0) {
    // 停牌或无成交时不伪装成 0 元，交由上层显示占位符
    return undefined;
  }

  const change = toNumber(fields[31]);
  const changePercent = toNumber(fields[32]);
  // A 股成交量单位为「手」（1 手 = 100 股），成交额为「万元」；港美股已为「股 / 元」
  const isCn = market === 'sh' || market === 'sz' || market === 'bj';
  const volume = toNumber(fields[36]) * (isCn ? 100 : 1);
  const turnover = toNumber(fields[37]) * (isCn ? 10000 : 1);

  return {
    key: expected?.key ?? key,
    code: expected?.code ?? fields[2] ?? key,
    market,
    name,
    price,
    prevClose,
    open: toNumber(fields[5]) || price,
    high: toNumber(fields[33]) || price,
    low: toNumber(fields[34]) || price,
    change,
    changePercent,
    volume,
    turnover,
    time: normalizeQuoteTime(fields[30] ?? ''),
    fetchedAt: Date.now(),
  };
}

/** 解析接口返回的完整文本，返回 key -> Quote 的映射（导出以便单元测试） */
export function parseQuoteResponse(text: string, codes: StockCode[]): Map<string, Quote> {
  const byKey = new Map<string, StockCode>();
  for (const code of codes) {
    byKey.set(code.key, code);
  }

  const result = new Map<string, Quote>();
  const pattern = /v_([A-Za-z0-9._]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const [, rawKey, payload] = match;
    if (!payload) {
      continue; // 空串表示代码不存在
    }
    const expected = byKey.get(rawKey);
    const quote = parseQuoteLine(rawKey, payload, expected);
    if (quote) {
      result.set(quote.key, quote);
    }
  }
  return result;
}
