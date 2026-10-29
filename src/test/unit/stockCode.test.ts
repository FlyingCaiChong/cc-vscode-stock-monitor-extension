import * as assert from 'assert';
import { MARKET_LABEL, parseStockCode, stockLabel } from '../../market/stockCode';

/**
 * `parseStockCode` 单元测试：覆盖 A股 / 港股 / 美股 的各类写法与非法输入。
 * 该模块为纯函数，可脱离 vscode 环境直接运行。
 */
suite('parseStockCode', () => {
  test('A 股：纯 6 位数字按首位推断交易所', () => {
    assert.deepStrictEqual(parseStockCode('600519'), {
      ok: true,
      value: { key: 'sh600519', code: '600519', market: 'sh' },
    });
    // 0 开头按深市处理（000001 无前缀时视为平安银行）
    assert.deepStrictEqual(parseStockCode('000001'), {
      ok: true,
      value: { key: 'sz000001', code: '000001', market: 'sz' },
    });
    // 8 开头按北交所处理
    assert.deepStrictEqual(parseStockCode('830799'), {
      ok: true,
      value: { key: 'bj830799', code: '830799', market: 'bj' },
    });
  });

  test('A 股：紧凑前缀 sh/sz/bj 与后缀式 .SH/.SS/.SZ', () => {
    const expected = { key: 'sh600519', code: '600519', market: 'sh' as const };
    assert.deepStrictEqual(parseStockCode('sh600519'), { ok: true, value: expected });
    assert.deepStrictEqual(parseStockCode('SH600519'), { ok: true, value: expected });
    assert.deepStrictEqual(parseStockCode('600519.SH'), { ok: true, value: expected });
    // Yahoo 风格的 .SS 后缀同样映射到沪市
    assert.deepStrictEqual(parseStockCode('600519.SS'), { ok: true, value: expected });
    assert.deepStrictEqual(parseStockCode('sh.600519'), { ok: true, value: expected });
  });

  test('港股：1~5 位数字自动补零到 5 位', () => {
    const expected = { key: 'hk00700', code: '00700', market: 'hk' as const };
    assert.deepStrictEqual(parseStockCode('700'), { ok: true, value: expected });
    assert.deepStrictEqual(parseStockCode('00700'), { ok: true, value: expected });
    assert.deepStrictEqual(parseStockCode('hk00700'), { ok: true, value: expected });
    assert.deepStrictEqual(parseStockCode('0700.HK'), { ok: true, value: expected });
  });

  test('美股：字母代码统一转大写', () => {
    assert.deepStrictEqual(parseStockCode('AAPL'), {
      ok: true,
      value: { key: 'usAAPL', code: 'AAPL', market: 'us' },
    });
    assert.deepStrictEqual(parseStockCode('aapl'), {
      ok: true,
      value: { key: 'usAAPL', code: 'AAPL', market: 'us' },
    });
    // 带点号的代码（如伯克希尔 B 股）应保留
    assert.deepStrictEqual(parseStockCode('BRK.B'), {
      ok: true,
      value: { key: 'usBRK.B', code: 'BRK.B', market: 'us' },
    });
    // 显式市场前缀的多种写法
    assert.deepStrictEqual(parseStockCode('us.AAPL'), {
      ok: true,
      value: { key: 'usAAPL', code: 'AAPL', market: 'us' },
    });
    assert.deepStrictEqual(parseStockCode('AAPL.OQ'), {
      ok: true,
      value: { key: 'usAAPL', code: 'AAPL', market: 'us' },
    });
    assert.deepStrictEqual(parseStockCode('NASDAQ:AAPL'), {
      ok: true,
      value: { key: 'usAAPL', code: 'AAPL', market: 'us' },
    });
  });

  test('显式前缀 sh000001 可区分上证指数与深市个股', () => {
    assert.deepStrictEqual(parseStockCode('sh000001'), {
      ok: true,
      value: { key: 'sh000001', code: '000001', market: 'sh' },
    });
  });

  test('非法输入返回友好中文原因', () => {
    const empty = parseStockCode('   ');
    assert.strictEqual(empty.ok, false);
    assert.strictEqual(empty.ok === false && empty.reason, '股票代码不能为空');

    const tooLong = parseStockCode('1234567');
    assert.strictEqual(tooLong.ok, false);

    // 6 位数字不能标为港股
    const hkMismatch = parseStockCode('600519.HK');
    assert.strictEqual(hkMismatch.ok, false);

    // 1~5 位数字不能标为 A 股
    const shMismatch = parseStockCode('sh700');
    assert.strictEqual(shMismatch.ok, false);

    // 超过 5 个字母无法识别为美股代码
    assert.strictEqual(parseStockCode('ABCDEF').ok, false);

    // 无分隔符的字母前缀写法存在歧义（USB 是真实美股代码），不予以识别
    assert.strictEqual(parseStockCode('usAAPL').ok, false);
  });

  test('stockLabel 与 MARKET_LABEL 基础行为', () => {
    const parsed = parseStockCode('600519');
    assert.strictEqual(parsed.ok && stockLabel(parsed.value), '600519');
    assert.strictEqual(MARKET_LABEL.hk, '港股');
    assert.strictEqual(MARKET_LABEL.us, '美股');
  });
});
