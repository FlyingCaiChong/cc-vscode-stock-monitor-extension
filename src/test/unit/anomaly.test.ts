import * as assert from 'assert';
import {
  AnomalySettings,
  AnomalyState,
  createAnomalyState,
  detectAnomalies,
  resetAnomalyState,
} from '../../anomaly';
import { Quote } from '../../types';

/** 基准时间戳，测试中所有时间都相对它偏移，保证结果稳定可复现 */
const T0 = 1_700_000_000_000;

/** 构造一份用于异动检测的行情数据 */
function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    key: 'sh600519',
    code: '600519',
    market: 'sh',
    name: '贵州茅台',
    price: 100,
    prevClose: 100,
    open: 100,
    high: 100,
    low: 100,
    change: 0,
    changePercent: 0,
    volume: 0,
    turnover: 0,
    turnoverRate: 0,
    amplitude: 0,
    volumeRatio: 0,
    peTtm: 0,
    pb: 0,
    marketCap: 0,
    limitUp: 0,
    limitDown: 0,
    time: '10:00:00',
    fetchedAt: T0,
    ...overrides,
  };
}

/** 把行情数组转成 detector 需要的 Map 结构 */
function quoteMap(...quotes: Quote[]): Map<string, Quote> {
  return new Map(quotes.map((quote) => [quote.key, quote]));
}

/** 构造异动配置，默认关闭量比检测（避免干扰价格类断言） */
function makeSettings(overrides: Partial<AnomalySettings> = {}): AnomalySettings {
  return {
    enabled: true,
    windowSeconds: 60,
    priceChangePercent: 1.5,
    volumeRatioThreshold: 0,
    cooldownSeconds: 300,
    ...overrides,
  };
}

/** 跑一轮检测，返回事件列表 */
function run(
  state: AnomalyState,
  settings: AnomalySettings,
  quote: Quote,
  now: number,
): ReturnType<typeof detectAnomalies> {
  return detectAnomalies(quoteMap(quote), settings, state, now);
}

suite('anomaly / detectAnomalies 价格异动', () => {
  test('历史跨度不足一个窗口时不触发，避免启动即误报', () => {
    const state = createAnomalyState();
    const settings = makeSettings();
    run(state, settings, makeQuote({ fetchedAt: T0 }), T0);
    // 30 秒内已涨 3%，但采样跨度只有 30 秒（小于窗口 60 秒），不应视为异动
    const events = run(
      state,
      settings,
      makeQuote({ price: 103, fetchedAt: T0 + 30_000 }),
      T0 + 30_000,
    );
    assert.deepStrictEqual(events, []);
  });

  test('窗口内涨幅超过阈值触发急速拉升', () => {
    const state = createAnomalyState();
    const settings = makeSettings();
    run(state, settings, makeQuote({ price: 100, fetchedAt: T0 }), T0);
    const events = run(
      state,
      settings,
      makeQuote({ price: 102, fetchedAt: T0 + 60_000 }),
      T0 + 60_000,
    );
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].key, 'sh600519');
    assert.strictEqual(events[0].kind, 'surge');
    assert.match(events[0].message, /急速拉升 2\.00%/);
  });

  test('窗口内跌幅超过阈值触发急速跳水', () => {
    const state = createAnomalyState();
    const settings = makeSettings();
    run(state, settings, makeQuote({ price: 100, fetchedAt: T0 }), T0);
    const events = run(
      state,
      settings,
      makeQuote({ price: 98, fetchedAt: T0 + 60_000 }),
      T0 + 60_000,
    );
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].kind, 'plunge');
    assert.match(events[0].message, /急速跳水 2\.00%/);
  });

  test('窗口内波动未达阈值时不触发', () => {
    const state = createAnomalyState();
    const settings = makeSettings();
    run(state, settings, makeQuote({ price: 100, fetchedAt: T0 }), T0);
    // 1% < 阈值 1.5%
    const events = run(
      state,
      settings,
      makeQuote({ price: 101, fetchedAt: T0 + 60_000 }),
      T0 + 60_000,
    );
    assert.deepStrictEqual(events, []);
  });

  test('同一份行情重复刷新（缓存降级）不会累积重复采样点', () => {
    const state = createAnomalyState();
    const settings = makeSettings();
    run(state, settings, makeQuote({ price: 100, fetchedAt: T0 }), T0);
    // fetchedAt 相同表示行情未更新（网络失败时复用上一次缓存）
    const events = run(
      state,
      settings,
      makeQuote({ price: 105, fetchedAt: T0 }),
      T0 + 1_000,
    );
    assert.strictEqual(state.history.get('sh600519')?.length, 1);
    assert.deepStrictEqual(events, []);
  });
});

suite('anomaly / detectAnomalies 冷却', () => {
  test('冷却期内不重复提醒，冷却结束后可再次提醒', () => {
    const state = createAnomalyState();
    const settings = makeSettings({ cooldownSeconds: 300 });

    assert.deepStrictEqual(run(state, settings, makeQuote({ price: 100, fetchedAt: T0 }), T0), []);

    // 第 2 轮：窗口内上涨 2% → 触发，并开始 300 秒冷却
    const first = run(
      state,
      settings,
      makeQuote({ price: 102, fetchedAt: T0 + 60_000 }),
      T0 + 60_000,
    );
    assert.strictEqual(first.length, 1);
    assert.strictEqual(first[0].kind, 'surge');

    // 中间几轮持续上涨（每轮约 1.9%），但仍在冷却期内 → 不提醒
    const midPrices: Array<[number, number]> = [
      [120_000, 104],
      [180_000, 106],
      [240_000, 108],
      [300_000, 110],
    ];
    for (const [offset, price] of midPrices) {
      const events = run(
        state,
        settings,
        makeQuote({ price, fetchedAt: T0 + offset }),
        T0 + offset,
      );
      assert.deepStrictEqual(events, [], `${offset} 毫秒时仍应处于冷却期`);
    }

    // 冷却结束（T0+360s，即触发后 300 秒）且条件依旧成立 → 重新提醒
    const again = run(
      state,
      settings,
      makeQuote({ price: 112, fetchedAt: T0 + 360_000 }),
      T0 + 360_000,
    );
    assert.strictEqual(again.length, 1);
    assert.strictEqual(again[0].kind, 'surge');
  });

  test('冷却时间为 0 时每轮都会提醒', () => {
    const state = createAnomalyState();
    const settings = makeSettings({ cooldownSeconds: 0 });
    run(state, settings, makeQuote({ price: 100, fetchedAt: T0 }), T0);
    const first = run(
      state,
      settings,
      makeQuote({ price: 102, fetchedAt: T0 + 60_000 }),
      T0 + 60_000,
    );
    const second = run(
      state,
      settings,
      makeQuote({ price: 104, fetchedAt: T0 + 120_000 }),
      T0 + 120_000,
    );
    assert.strictEqual(first.length, 1);
    assert.strictEqual(second.length, 1);
  });
});

suite('anomaly / detectAnomalies 放量异动', () => {
  test('A 股量比达到阈值时触发放量异动', () => {
    const state = createAnomalyState();
    const settings = makeSettings({ priceChangePercent: 0, volumeRatioThreshold: 3 });
    const events = run(state, settings, makeQuote({ volumeRatio: 4.2 }), T0);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].kind, 'volumeSpike');
    assert.match(events[0].message, /量比 4\.20/);
  });

  test('量比低于阈值或阈值为 0 时不触发', () => {
    const belowState = createAnomalyState();
    const below = run(
      belowState,
      makeSettings({ volumeRatioThreshold: 3 }),
      makeQuote({ volumeRatio: 2 }),
      T0,
    );
    assert.deepStrictEqual(below, []);

    const disabledState = createAnomalyState();
    const disabled = run(
      disabledState,
      makeSettings({ volumeRatioThreshold: 0 }),
      makeQuote({ volumeRatio: 9 }),
      T0,
    );
    assert.deepStrictEqual(disabled, []);
  });

  test('价格异动与放量异动可同时命中', () => {
    const state = createAnomalyState();
    const settings = makeSettings({ volumeRatioThreshold: 3 });
    run(state, settings, makeQuote({ price: 100, volumeRatio: 1, fetchedAt: T0 }), T0);
    const events = run(
      state,
      settings,
      makeQuote({ price: 102, volumeRatio: 5, fetchedAt: T0 + 60_000 }),
      T0 + 60_000,
    );
    const kinds = events.map((event) => event.kind).sort();
    assert.deepStrictEqual(kinds, ['surge', 'volumeSpike']);
  });
});

suite('anomaly / 其它', () => {
  test('关闭 enableAnomalyAlert 后不再产出事件', () => {
    const state = createAnomalyState();
    const settings = makeSettings({ enabled: false, volumeRatioThreshold: 3 });
    const events = run(state, settings, makeQuote({ volumeRatio: 5 }), T0);
    assert.deepStrictEqual(events, []);
  });

  test('无有效价格或时间的行情会被跳过', () => {
    const state = createAnomalyState();
    const settings = makeSettings({ volumeRatioThreshold: 3 });
    const events = detectAnomalies(
      quoteMap(makeQuote({ price: 0, fetchedAt: T0 }), makeQuote({ key: 'hk00700', code: '00700', market: 'hk', fetchedAt: 0 })),
      settings,
      state,
      T0,
    );
    assert.deepStrictEqual(events, []);
  });

  test('resetAnomalyState 清空采样历史与冷却记录', () => {
    const state = createAnomalyState();
    const settings = makeSettings();
    run(state, settings, makeQuote({ fetchedAt: T0 }), T0);
    run(state, settings, makeQuote({ price: 102, fetchedAt: T0 + 60_000 }), T0 + 60_000);
    assert.ok(state.history.size > 0);
    resetAnomalyState(state);
    assert.strictEqual(state.history.size, 0);
    assert.strictEqual(state.cooldowns.size, 0);
  });

  test('股票被移出关注列表后清理其历史记录', () => {
    const state = createAnomalyState();
    const settings = makeSettings();
    run(state, settings, makeQuote({ fetchedAt: T0 }), T0);
    // 关注列表为空 → 传入空行情，历史应被清理
    detectAnomalies(new Map(), settings, state, T0 + 1_000);
    assert.strictEqual(state.history.size, 0);
  });
});
