import { MarketId, ParseStockResult, StockCode } from '../types';

/**
 * 市场前缀/后缀别名表。
 * 同时兼容「前缀式」（sh600519、us.AAPL）与「后缀式」（600519.SH、0700.HK、AAPL.OQ）。
 */
const MARKET_ALIAS: Record<string, MarketId> = {
  SH: 'sh', // 上交所
  SS: 'sh', // Yahoo 风格后缀 600519.SS
  SZ: 'sz', // 深交所
  BJ: 'bj', // 北交所
  HK: 'hk', // 港交所
  US: 'us', // 美股
  OQ: 'us', // 纳斯达克（腾讯行情返回 AAPL.OQ）
  N: 'us',  // 纽交所
  NASDAQ: 'us',
  NYSE: 'us',
  AMEX: 'us',
  ARCA: 'us',
};

/** 市场中文名，用于提示信息 */
export const MARKET_LABEL: Record<MarketId, string> = {
  sh: '沪市',
  sz: '深市',
  bj: '北交所',
  hk: '港股',
  us: '美股',
};

/**
 * 根据 A 股代码首位数字推断交易所。
 * 说明：000001 同时是「上证指数」与「平安银行」，无前缀时按深市个股处理；
 * 需要上证指数请显式书写 `sh000001`。
 */
function inferCnMarket(code: string): MarketId {
  const head = code[0];
  if (head === '6' || head === '9' || head === '5' || head === '7') {
    return 'sh'; // 沪市 A/B 股、ETF、配股
  }
  if (head === '0' || head === '1' || head === '2' || head === '3') {
    return 'sz'; // 深市 A/B 股、创业板、ETF
  }
  if (head === '4' || head === '8') {
    return 'bj'; // 北交所
  }
  return 'sh';
}

/** 构造归一化结果 */
function build(market: MarketId, code: string): StockCode {
  const normalized = market === 'us' ? code.toUpperCase() : code;
  return { key: `${market}${normalized}`, code: normalized, market };
}

/**
 * 将用户输入解析为标准股票代码。
 *
 * 支持写法：
 * - A 股：`600519`、`sh600519`、`600519.SH`、`600519.SS`
 * - 港股：`700`、`00700`、`hk00700`、`0700.HK`
 * - 美股：`AAPL`、`us.AAPL`、`AAPL.US`、`NASDAQ:AAPL`
 *
 * 注意：`usAAPL` 这种「无分隔符的字母前缀」写法存在歧义（如 USB 是真实美股代码），
 * 因此不予以识别，请改用 `us.AAPL` 或直接输入 `AAPL`。
 */
export function parseStockCode(rawInput: string): ParseStockResult {
  const input = (rawInput ?? '').trim().replace(/\s+/g, '');
  if (!input) {
    return { ok: false, reason: '股票代码不能为空' };
  }

  let explicit: MarketId | undefined;
  let body = input;

  // 1) 带分隔符的前缀式写法，如 sh.600519 / NASDAQ:AAPL；仅当前缀是已知市场别名时才生效
  const sepPrefix = /^([A-Za-z]{1,8})[:.](.+)$/.exec(body);
  if (sepPrefix && MARKET_ALIAS[sepPrefix[1].toUpperCase()]) {
    explicit = MARKET_ALIAS[sepPrefix[1].toUpperCase()];
    body = sepPrefix[2];
  } else {
    // 2) 后缀式写法，如 600519.SH / 0700.HK / AAPL.OQ
    const sepSuffix = /^(.+)[.]([A-Za-z]{1,6})$/.exec(body);
    if (sepSuffix && MARKET_ALIAS[sepSuffix[2].toUpperCase()]) {
      explicit = MARKET_ALIAS[sepSuffix[2].toUpperCase()];
      body = sepSuffix[1];
    } else {
      // 3) 紧凑前缀式写法，仅放开「字母前缀 + 纯数字」的组合（无歧义）
      const dense = /^(SH|SZ|BJ|HK)(\d+)$/i.exec(body);
      if (dense) {
        explicit = MARKET_ALIAS[dense[1].toUpperCase()];
        body = dense[2];
      }
    }
  }

  // 纯数字：6 位为 A 股，1~5 位为港股
  if (/^\d+$/.test(body)) {
    if (body.length === 6) {
      if (explicit === 'hk' || explicit === 'us') {
        return { ok: false, reason: `"${input}" 与${MARKET_LABEL[explicit]}代码格式不匹配` };
      }
      return { ok: true, value: build(explicit ?? inferCnMarket(body), body) };
    }
    if (body.length <= 5) {
      if (explicit === 'sh' || explicit === 'sz' || explicit === 'bj' || explicit === 'us') {
        return { ok: false, reason: `"${input}" 与${MARKET_LABEL[explicit]}代码格式不匹配` };
      }
      return { ok: true, value: build('hk', body.padStart(5, '0')) };
    }
    return { ok: false, reason: `"${input}" 不是有效的股票代码（A 股为 6 位数字，港股不超过 5 位）` };
  }

  // 字母（允许 . 与 -）：按美股代码处理，美股代码最长 5 位
  if (/^[A-Za-z][A-Za-z.\-]{0,4}$/.test(body)) {
    if (explicit && explicit !== 'us') {
      return { ok: false, reason: `"${input}" 与${MARKET_LABEL[explicit]}代码格式不匹配` };
    }
    return { ok: true, value: build('us', body) };
  }

  return { ok: false, reason: `无法识别的股票代码 "${input}"，支持 A股(600519)、港股(00700)、美股(AAPL) 等格式` };
}

/** 用于状态栏/列表的短标签，如「600519」「00700」「AAPL」 */
export function stockLabel(code: StockCode | { code: string }): string {
  return code.code;
}
