import * as assert from 'assert';
import {
  colorIdFor,
  detailRows,
  formatNumber,
  formatSigned,
  formatStatusBarText,
  formatTurnover,
  formatVolume,
  trendOf,
} from '../../ui/format';
import { Quote } from '../../types';

/** 构造一份用于格式化断言的行情数据 */
function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    key: 'sh600519',
    code: '600519',
    market: 'sh',
    name: '贵州茅台',
    price: 1330.75,
    prevClose: 1355.9,
    open: 1350,
    high: 1355,
    low: 1320,
    change: -25.15,
    changePercent: -1.86,
    volume: 4567800,
    turnover: 6123450000,
    time: '16:14:54',
    fetchedAt: 0,
    ...overrides,
  };
}

suite('format / trendOf', () => {
  test('以涨跌额判断方向，额为零时回退到涨跌幅', () => {
    assert.strictEqual(trendOf({ change: 1, changePercent: 0.5 }), 'up');
    assert.strictEqual(trendOf({ change: -1, changePercent: -0.5 }), 'down');
    assert.strictEqual(trendOf({ change: 0, changePercent: 0 }), 'flat');
    assert.strictEqual(trendOf({ change: 0, changePercent: 1.2 }), 'up');
    assert.strictEqual(trendOf({ change: 0, changePercent: -1.2 }), 'down');
  });

  test('涨跌额非法（NaN）时以涨跌幅为准', () => {
    assert.strictEqual(trendOf({ change: Number.NaN, changePercent: -2 }), 'down');
  });
});

suite('format / colorIdFor', () => {
  test('greenUp 方案：上涨绿、下跌红', () => {
    assert.strictEqual(colorIdFor('up', 'greenUp'), 'charts.green');
    assert.strictEqual(colorIdFor('down', 'greenUp'), 'charts.red');
  });

  test('redUp 方案：上涨红、下跌绿（符合 A 股习惯）', () => {
    assert.strictEqual(colorIdFor('up', 'redUp'), 'charts.red');
    assert.strictEqual(colorIdFor('down', 'redUp'), 'charts.green');
  });

  test('平盘统一为灰色', () => {
    assert.strictEqual(colorIdFor('flat', 'greenUp'), 'descriptionForeground');
    assert.strictEqual(colorIdFor('flat', 'redUp'), 'descriptionForeground');
  });
});

suite('format / 数值格式化', () => {
  test('formatNumber 固定小数位，非法值返回占位符', () => {
    assert.strictEqual(formatNumber(1330.75, 2), '1330.75');
    assert.strictEqual(formatNumber(10, 2), '10.00');
    assert.strictEqual(formatNumber(Number.NaN, 2), '--');
    assert.strictEqual(formatNumber(Number.POSITIVE_INFINITY, 2), '--');
  });

  test('formatSigned 为正数补充 + 号', () => {
    assert.strictEqual(formatSigned(1.85, 2), '+1.85');
    assert.strictEqual(formatSigned(-0.32, 2), '-0.32');
    assert.strictEqual(formatSigned(0, 2), '0.00');
    assert.strictEqual(formatSigned(Number.NaN, 2), '--');
  });

  test('formatVolume 按股 / 万股 / 亿股分级', () => {
    assert.strictEqual(formatVolume(500), '500股');
    assert.strictEqual(formatVolume(12345), '1.23万股');
    assert.strictEqual(formatVolume(2.5e8), '2.50亿股');
    assert.strictEqual(formatVolume(0), '--');
    assert.strictEqual(formatVolume(-1), '--');
  });

  test('formatTurnover 按元 / 万元 / 亿元分级', () => {
    assert.strictEqual(formatTurnover(5000), '5000元');
    assert.strictEqual(formatTurnover(12345), '1.23万元');
    assert.strictEqual(formatTurnover(123456789), '1.23亿元');
    assert.strictEqual(formatTurnover(0), '--');
  });
});

suite('format / 状态栏与明细', () => {
  test('formatStatusBarText 按字段顺序拼接', () => {
    const quote = makeQuote();
    assert.strictEqual(formatStatusBarText(quote, ['name', 'price', 'changePercent'], 2), '贵州茅台 1330.75 -1.86%');
    assert.strictEqual(formatStatusBarText(quote, ['code', 'change'], 2), '600519 -25.15');
    assert.strictEqual(formatStatusBarText(quote, ['volume'], 2), '456.78万股');
    assert.strictEqual(formatStatusBarText(quote, [], 2), '');
  });

  test('formatStatusBarText 在有持仓时展示别名与收益', () => {
    const quote = makeQuote();
    const metrics = {
      alias: '茅台',
      costPrice: 1200,
      shares: 100,
      marketValue: 133075,
      dailyProfit: -2515,
      dailyProfitPercent: -1.86,
      totalProfit: 13075,
      totalProfitPercent: 10.8958,
    };
    assert.strictEqual(
      formatStatusBarText(quote, ['name', 'price', 'profit'], 2, metrics),
      '茅台 1330.75 当日 -2,515.00'
    );
    assert.strictEqual(formatStatusBarText(quote, ['totalProfit'], 2, metrics), '总 +13,075.00');
    // 无持仓时收益字段被自动省略
    assert.strictEqual(formatStatusBarText(quote, ['name', 'profit'], 2), '贵州茅台');
    assert.strictEqual(formatStatusBarText(quote, ['name', 'profit'], 2, { alias: '茅台' }), '茅台');
  });

  test('detailRows 返回 10 行明细且值正确', () => {
    const rows = detailRows(makeQuote(), 2);
    assert.strictEqual(rows.length, 10);
    assert.deepStrictEqual(rows[0], ['最新价', '1330.75']);
    assert.deepStrictEqual(rows[2], ['涨跌幅', '-1.86%']);
    assert.deepStrictEqual(rows[9], ['行情时间', '16:14:54']);
  });

  test('detailRows 对缺失时间显示占位符', () => {
    const rows = detailRows(makeQuote({ time: '' }), 2);
    assert.deepStrictEqual(rows[9], ['行情时间', '--']);
  });
});
