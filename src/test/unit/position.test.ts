import * as assert from 'assert';
import { computePortfolioSummary, computePosition, hasPosition, normalizePositions, PositionSetting } from '../../position';
import { formatSignedAmount, positionRows } from '../../ui/format';
import { Quote } from '../../types';

/** 构造一份用于收益计算的行情数据：最新价 1330.75，昨收 1355.9 */
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

/** 浮点金额 / 比率断言：允许 1e-4 的误差（价格乘法会产生二进制浮点尾差） */
function assertClose(actual: number | undefined, expected: number, message?: string): void {
  assert.ok(
    actual !== undefined && Math.abs(actual - expected) < 1e-4,
    `${message ?? ''} 期望 ${expected}，实际 ${actual}`
  );
}

suite('position / normalizePositions', () => {
  test('解析合法配置并归一化代码（A股 / 港股 / 美股）', () => {
    const { positions, issues } = normalizePositions([
      { code: '600519', alias: '茅台', costPrice: 1200, shares: 100 },
      { code: 'hk00700', alias: '腾讯', shares: 200 },
      { code: 'AAPL', costPrice: 180.5, shares: 30 },
    ]);

    assert.strictEqual(issues.length, 0);
    assert.strictEqual(positions.size, 3);

    const maotai = positions.get('sh600519');
    assert.ok(maotai, '600519 应归一化为 sh600519');
    assert.deepStrictEqual(
      { key: maotai.key, code: maotai.code, market: maotai.market },
      { key: 'sh600519', code: '600519', market: 'sh' }
    );
    assert.strictEqual(maotai.alias, '茅台');
    assert.strictEqual(maotai.costPrice, 1200);
    assert.strictEqual(maotai.shares, 100);
    assert.strictEqual(positions.get('hk00700')?.market, 'hk');
    assert.strictEqual(positions.get('usAAPL')?.market, 'us');
  });

  test('丢弃非法条目并记录原因，不影响其余配置', () => {
    const { positions, issues } = normalizePositions([
      null,
      { code: 'not-a-code' },
      { code: 'sh600519', shares: -5 }, // 负数持仓不合法，仅保留别名等基础信息
      { code: 'sz000001', shares: 1000 },
    ]);

    assert.strictEqual(positions.size, 2);
    assert.strictEqual(issues.length, 2);
    assert.ok(issues[0].includes('不是对象'));
    assert.ok(issues[1].includes('无法识别'));
    // 非法的 shares 被忽略，但股票本身保留
    assert.strictEqual(positions.get('sh600519')?.shares, undefined);
    assert.strictEqual(positions.get('sz000001')?.shares, 1000);
  });

  test('非数组或空配置返回空表且不抛异常', () => {
    assert.strictEqual(normalizePositions(undefined).positions.size, 0);
    assert.strictEqual(normalizePositions(null).positions.size, 0);
    assert.strictEqual(normalizePositions([]).positions.size, 0);
    const wrongType = normalizePositions({ code: 'sh600519' });
    assert.strictEqual(wrongType.positions.size, 0);
    assert.strictEqual(wrongType.issues.length, 1);
  });

  test('重复代码以最后一条为准并记录提示', () => {
    const { positions, issues } = normalizePositions([
      { code: 'sh600519', shares: 100 },
      { code: '600519', shares: 300 },
    ]);
    assert.strictEqual(positions.size, 1);
    assert.strictEqual(positions.get('sh600519')?.shares, 300);
    assert.strictEqual(issues.length, 1);
    assert.ok(issues[0].includes('重复'));
  });
});

suite('position / computePosition', () => {
  test('当日收益 =（最新价 - 昨收）× 数量，总收益 =（最新价 - 成本价）× 数量', () => {
    const setting: PositionSetting = {
      key: 'sh600519',
      code: '600519',
      market: 'sh',
      alias: '茅台',
      costPrice: 1200,
      shares: 100,
    };
    const metrics = computePosition(makeQuote(), setting);

    assert.strictEqual(metrics.alias, '茅台');
    assert.strictEqual(metrics.shares, 100);
    // (1330.75 - 1355.9) * 100 = -2515
    assertClose(metrics.dailyProfit, -2515, '当日收益');
    assert.strictEqual(metrics.dailyProfitPercent, -1.86);
    // (1330.75 - 1200) * 100 = 13075
    assertClose(metrics.totalProfit, 13075, '持仓总收益');
    // (1330.75 - 1200) / 1200 * 100 ≈ 10.8958
    assertClose(metrics.totalProfitPercent, 10.8958, '持仓收益率');
    assertClose(metrics.marketValue, 133075, '持仓市值');
    assert.strictEqual(hasPosition(metrics), true);
  });

  test('未配置成本价时只计算当日收益', () => {
    const metrics = computePosition(makeQuote(), {
      key: 'sh600519',
      code: '600519',
      market: 'sh',
      shares: 100,
    });
    assertClose(metrics.dailyProfit, -2515, '当日收益');
    assert.strictEqual(metrics.totalProfit, undefined);
    assert.strictEqual(metrics.totalProfitPercent, undefined);
  });

  test('未配置持仓数量时收益类字段均为 undefined，仅保留别名与成本价', () => {
    const metrics = computePosition(makeQuote(), {
      key: 'sh600519',
      code: '600519',
      market: 'sh',
      alias: '茅台',
      costPrice: 1200,
    });
    assert.deepStrictEqual(metrics, { alias: '茅台', costPrice: 1200 });
    assert.strictEqual(hasPosition(metrics), false);
    assert.strictEqual(hasPosition(undefined), false);
  });

  test('持仓数量为 0 / 非法时不计算收益', () => {
    for (const shares of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const metrics = computePosition(makeQuote(), {
        key: 'sh600519',
        code: '600519',
        market: 'sh',
        shares,
      });
      assert.strictEqual(metrics.shares, undefined, `shares=${shares} 不应参与计算`);
      assert.strictEqual(metrics.dailyProfit, undefined);
    }
  });
});

suite('position / computePortfolioSummary', () => {
  test('汇总全部已配置持仓且已有行情的当日参考盈亏', () => {
    const quotes = new Map([
      [
        'sh600519',
        makeQuote(),
      ],
      [
        'sz300866',
        makeQuote({
          key: 'sz300866',
          code: '300866',
          market: 'sz',
          name: '安克创新',
          price: 111.99,
          prevClose: 110.6,
          change: 1.39,
          changePercent: 1.26,
        }),
      ],
    ]);
    const { positions } = normalizePositions([
      { code: 'sh600519', costPrice: 1200, shares: 100 },
      { code: 'sz300866', costPrice: 100, shares: 200 },
      { code: 'AAPL', costPrice: 180, shares: 10 },
    ]);

    const summary = computePortfolioSummary(quotes, positions);
    assert.ok(summary, '存在可计算持仓时应返回汇总结果');
    assert.strictEqual(summary?.count, 2);
    assertClose(summary?.marketValue, 133075 + 111.99 * 200, '汇总持仓市值');
    assertClose(summary?.dailyProfit, -2515 + (111.99 - 110.6) * 200, '汇总当日参考盈亏');
    assertClose(summary?.totalProfit, 13075 + (111.99 - 100) * 200, '汇总持仓总收益');
  });

  test('无可计算持仓时返回 undefined', () => {
    const quotes = new Map([['sh600519', makeQuote()]]);
    const { positions } = normalizePositions([{ code: 'sh600519', alias: '茅台' }]);
    assert.strictEqual(computePortfolioSummary(quotes, positions), undefined);
  });
});

suite('position / 收益格式化', () => {
  test('formatSignedAmount 带千分位与正负号', () => {
    assert.strictEqual(formatSignedAmount(13075, 2), '+13,075.00');
    assert.strictEqual(formatSignedAmount(-2515, 2), '-2,515.00');
    assert.strictEqual(formatSignedAmount(0, 2), '0.00');
    assert.strictEqual(formatSignedAmount(1234567.891, 2), '+1,234,567.89');
    assert.strictEqual(formatSignedAmount(Number.NaN, 2), '--');
  });

  test('positionRows 输出持仓明细，未配置持仓时为空数组', () => {
    assert.deepStrictEqual(positionRows(undefined, 2), []);

    const metrics = computePosition(makeQuote(), {
      key: 'sh600519',
      code: '600519',
      market: 'sh',
      alias: '茅台',
      costPrice: 1200,
      shares: 100,
    });
    const rows = positionRows(metrics, 2);
    assert.deepStrictEqual(rows[0], ['别名', '茅台']);
    assert.deepStrictEqual(rows[1], ['成本价', '1200.00']);
    assert.deepStrictEqual(rows[2], ['持仓数量', '100股']);
    assert.deepStrictEqual(rows[3], ['持仓市值', '133,075.00 元']);
    assert.deepStrictEqual(rows[4], ['当日收益', '-2,515.00 元']);
    assert.deepStrictEqual(rows[5], ['当日收益率', '-1.86%']);
    assert.deepStrictEqual(rows[6], ['持仓总收益', '+13,075.00 元']);
    assert.deepStrictEqual(rows[7], ['持仓收益率', '+10.90%']);
  });

  test('仅配置别名时不产生收益行', () => {
    const rows = positionRows({ alias: '茅台' }, 2);
    assert.deepStrictEqual(rows, [['别名', '茅台']]);
  });
});
