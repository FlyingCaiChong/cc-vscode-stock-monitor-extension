import * as assert from 'assert';
import { normalizeQuoteTime, parseQuoteLine, parseQuoteResponse } from '../../market/quoteParser';
import { StockCode } from '../../types';

/**
 * 行情文本解析单元测试。
 * 使用人工构造的腾讯接口报文，避免依赖真实网络，保证测试稳定可重复。
 */

const SH600519: StockCode = { key: 'sh600519', code: '600519', market: 'sh' };
const HK00700: StockCode = { key: 'hk00700', code: '00700', market: 'hk' };
const US_AAPL: StockCode = { key: 'usAAPL', code: 'AAPL', market: 'us' };

/** 构造一条 40 字段的行情报文（含关键字段默认值，可按下标覆盖） */
function buildPayload(overrides: Record<number, string> = {}): string {
  const fields = new Array<string>(40).fill('0');
  fields[0] = '1';
  fields[1] = '贵州茅台';
  fields[2] = '600519';
  fields[3] = '1330.75';
  fields[4] = '1355.90';
  fields[5] = '1350.00';
  fields[30] = '20261028161454';
  fields[31] = '-25.15';
  fields[32] = '-1.86';
  fields[33] = '1355.00';
  fields[34] = '1320.00';
  fields[36] = '45678';
  fields[37] = '612345';
  for (const [index, value] of Object.entries(overrides)) {
    fields[Number(index)] = value;
  }
  return fields.join('~');
}

suite('quoteParser / normalizeQuoteTime', () => {
  test('A 股紧凑时间格式转 HH:mm:ss', () => {
    assert.strictEqual(normalizeQuoteTime('20261028161454'), '16:14:54');
  });

  test('港美股带分隔符的时间格式归一化', () => {
    assert.strictEqual(normalizeQuoteTime('2026/10/28 16:08:30'), '16:08:30');
    // 小时为个位数时补零，缺少秒时补 00
    assert.strictEqual(normalizeQuoteTime('2026/10/28 9:05'), '09:05:00');
  });

  test('无法解析时返回空串', () => {
    assert.strictEqual(normalizeQuoteTime(''), '');
    assert.strictEqual(normalizeQuoteTime('--'), '');
  });
});

suite('quoteParser / parseQuoteResponse', () => {
  test('A 股：成交量为「手」需乘 100，成交额为「万元」需乘 10000', () => {
    const text = `v_sh600519="${buildPayload()}";`;
    const result = parseQuoteResponse(text, [SH600519]);

    const quote = result.get('sh600519');
    assert.ok(quote, '应解析出 sh600519');
    assert.strictEqual(quote.name, '贵州茅台');
    assert.strictEqual(quote.price, 1330.75);
    assert.strictEqual(quote.prevClose, 1355.9);
    assert.strictEqual(quote.change, -25.15);
    assert.strictEqual(quote.changePercent, -1.86);
    assert.strictEqual(quote.volume, 4567800); // 45678 手 × 100
    assert.strictEqual(quote.turnover, 6123450000); // 612345 万元 × 10000
    assert.strictEqual(quote.time, '16:14:54');
  });

  test('港股 / 美股：成交量与成交额无需换算', () => {
    const text = `v_hk00700="${buildPayload({ 1: '腾讯控股', 2: '00700', 3: '588.5' })}";`;
    const hk = parseQuoteResponse(text, [HK00700]).get('hk00700');
    assert.ok(hk);
    assert.strictEqual(hk.volume, 45678);
    assert.strictEqual(hk.turnover, 612345);

    const usText = `v_usAAPL="${buildPayload({ 1: '苹果', 2: 'AAPL', 3: '230.1' })}";`;
    const us = parseQuoteResponse(usText, [US_AAPL]).get('usAAPL');
    assert.ok(us);
    assert.strictEqual(us.market, 'us');
    assert.strictEqual(us.volume, 45678);
  });

  test('未在请求列表中的代码也能解析，市场由 key 前缀推断', () => {
    const text = `v_sh600519="${buildPayload()}";`;
    const quote = parseQuoteResponse(text, []).get('sh600519');
    assert.ok(quote);
    assert.strictEqual(quote.market, 'sh');
    assert.strictEqual(quote.code, '600519');
  });

  test('空报文（代码不存在）与字段不足的报文被忽略', () => {
    assert.strictEqual(parseQuoteResponse('v_sh600519="";', [SH600519]).size, 0);

    const shortPayload = new Array<string>(10).fill('1').join('~');
    assert.strictEqual(parseQuoteResponse(`v_sh600519="${shortPayload}";`, [SH600519]).size, 0);
  });

  test('一条报文包含多条记录时全部解析', () => {
    const text = [
      `v_sh600519="${buildPayload()}";`,
      `v_hk00700="${buildPayload({ 1: '腾讯控股', 2: '00700', 3: '588.5' })}";`,
    ].join('\n');
    const result = parseQuoteResponse(text, [SH600519, HK00700]);
    assert.strictEqual(result.size, 2);
    assert.ok(result.has('sh600519') && result.has('hk00700'));
  });
});

suite('quoteParser / parseQuoteLine', () => {
  test('价格为 0 或名称为空时视为无有效行情', () => {
    assert.strictEqual(parseQuoteLine('sh600519', buildPayload({ 3: '0' }), SH600519), undefined);
    assert.strictEqual(parseQuoteLine('sh600519', buildPayload({ 1: '  ' }), SH600519), undefined);
  });

  test('今开 / 最高 / 最低 缺失时回退为最新价', () => {
    const quote = parseQuoteLine('sh600519', buildPayload({ 5: '0', 33: '0', 34: '0' }), SH600519);
    assert.ok(quote);
    assert.strictEqual(quote.open, quote.price);
    assert.strictEqual(quote.high, quote.price);
    assert.strictEqual(quote.low, quote.price);
  });
});
