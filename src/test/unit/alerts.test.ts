import * as assert from 'assert';
import { AlertRule, evaluateAlerts, normalizeAlerts } from '../../alerts';
import { Quote } from '../../types';

/**
 * 预警规则单元测试。
 *
 * 覆盖两块纯逻辑：
 * 1. `normalizeAlerts`：用户配置的容错归一化（非法条目忽略并记 issue）
 * 2. `evaluateAlerts`：当前行情下哪些规则处于触发状态，以及触发原因文案
 */

/** 构造一份用于预警判定的行情数据（最新价 1330.75，涨跌幅 -1.86%） */
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
    turnoverRate: 0,
    amplitude: 0,
    volumeRatio: 0,
    peTtm: 0,
    pb: 0,
    marketCap: 0,
    limitUp: 0,
    limitDown: 0,
    time: '16:14:54',
    fetchedAt: 0,
    ...overrides,
  };
}

suite('alerts / normalizeAlerts', () => {
  test('解析合法规则并归一化代码', () => {
    const { alerts, issues } = normalizeAlerts([
      { code: '600519', above: 1600, below: 1400, changePercentAbove: 5, changePercentBelow: -5 },
    ]);
    assert.strictEqual(issues.length, 0);
    assert.strictEqual(alerts.length, 1);
    const rule = alerts[0];
    assert.strictEqual(rule.key, 'sh600519');
    assert.strictEqual(rule.code, '600519');
    assert.strictEqual(rule.above, 1600);
    assert.strictEqual(rule.below, 1400);
    assert.strictEqual(rule.changePercentAbove, 5);
    assert.strictEqual(rule.changePercentBelow, -5);
    // once 默认开启
    assert.strictEqual(rule.once, true);
  });

  test('once 显式置 false 时保留用户意图', () => {
    const { alerts } = normalizeAlerts([{ code: 'AAPL', above: 200, once: false }]);
    assert.strictEqual(alerts[0].once, false);
  });

  test('代码非法 / 无阈值 / 非法阈值的条目被丢弃并记录 issue', () => {
    const { alerts, issues } = normalizeAlerts([
      { code: '不存在的代码', above: 1 },
      { code: 'sh600519' },
      { code: 'sz000001', above: -1, below: 'high' },
      '不是对象',
    ]);
    assert.strictEqual(alerts.length, 0);
    // 三条非法条目 + 一条非对象
    assert.strictEqual(issues.length, 4);
  });

  test('非数组配置被整体忽略', () => {
    const { alerts, issues } = normalizeAlerts({ code: 'sh600519', above: 1 });
    assert.strictEqual(alerts.length, 0);
    assert.strictEqual(issues.length, 1);
  });

  test('重复代码以后一条覆盖前一条并记录提示', () => {
    const { alerts, issues } = normalizeAlerts([
      { code: 'sh600519', above: 1600 },
      { code: '600519', below: 1400 },
    ]);
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].above, undefined);
    assert.strictEqual(alerts[0].below, 1400);
    assert.ok(issues.some((issue) => issue.includes('重复')));
  });

  test('undefined / null 直接返回空列表', () => {
    assert.strictEqual(normalizeAlerts(undefined).alerts.length, 0);
    assert.strictEqual(normalizeAlerts(null).alerts.length, 0);
  });
});

suite('alerts / evaluateAlerts', () => {
  const rule = (overrides: Partial<AlertRule>): AlertRule => ({
    key: 'sh600519',
    code: '600519',
    once: true,
    ...overrides,
  });

  test('价格上破 / 下破均生成可读原因', () => {
    const quotes = new Map([['sh600519', makeQuote({ price: 1700, changePercent: 6 })]]);
    const hits = evaluateAlerts(
      [rule({ above: 1600, below: 1400, changePercentAbove: 5, changePercentBelow: -5 })],
      quotes
    );
    const reasons = hits.get('sh600519');
    assert.ok(reasons);
    assert.strictEqual(reasons.length, 2);
    assert.ok(reasons.some((r) => r.includes('上破 1600.00')));
    assert.ok(reasons.some((r) => r.includes('上破 5.00%')));
  });

  test('涨跌幅下破时仅命中对应条件', () => {
    const quotes = new Map([['sh600519', makeQuote({ price: 1330.75, changePercent: -8 })]]);
    const hits = evaluateAlerts([rule({ changePercentBelow: -5 })], quotes);
    const reasons = hits.get('sh600519');
    assert.ok(reasons);
    assert.strictEqual(reasons.length, 1);
    assert.ok(reasons[0].includes('下破 -5.00%'));
  });

  test('条件未越界时不产生触发', () => {
    // 最新价 1330.75 位于 [1200, 1600] 区间内，两条阈值都不应命中
    const quotes = new Map([['sh600519', makeQuote()]]);
    const hits = evaluateAlerts([rule({ above: 1600, below: 1200 })], quotes);
    assert.strictEqual(hits.size, 0);
  });

  test('行情缺失（未关注或已移除）的规则被跳过', () => {
    const hits = evaluateAlerts([rule({ above: 1 })], new Map());
    assert.strictEqual(hits.size, 0);
  });
});
