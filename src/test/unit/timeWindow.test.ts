import * as assert from 'assert';
import {
  DEFAULT_REFRESH_TIME_RANGES,
  isWithinTimeRanges,
  normalizeTime,
  normalizeTimeRanges,
  parseTimeToMinutes,
} from '../../timeWindow';

/** 构造指定「时:分」的本地时间，方便断言边界 */
function at(hours: number, minutes: number): Date {
  return new Date(2026, 0, 5, hours, minutes, 0, 0);
}

suite('timeWindow / parseTimeToMinutes', () => {
  test('解析合法时间并允许未补零写法', () => {
    assert.strictEqual(parseTimeToMinutes('00:00'), 0);
    assert.strictEqual(parseTimeToMinutes('09:00'), 540);
    assert.strictEqual(parseTimeToMinutes('9:5'), 545);
    assert.strictEqual(parseTimeToMinutes('23:59'), 1439);
  });

  test('非法时间返回 undefined', () => {
    for (const value of ['', '24:00', '10:60', '10', 'ab:cd', '10:5:1']) {
      assert.strictEqual(parseTimeToMinutes(value), undefined, `${value} 应为非法`);
    }
  });
});

suite('timeWindow / normalizeTime', () => {
  test('补零为 HH:mm', () => {
    assert.strictEqual(normalizeTime('9:5'), '09:05');
    assert.strictEqual(normalizeTime(' 15:05 '), '15:05');
  });

  test('非字符串或非法值返回 undefined', () => {
    assert.strictEqual(normalizeTime(undefined), undefined);
    assert.strictEqual(normalizeTime(900), undefined);
    assert.strictEqual(normalizeTime('25:00'), undefined);
  });
});

suite('timeWindow / normalizeTimeRanges', () => {
  test('解析合法数组并补零', () => {
    assert.deepStrictEqual(
      normalizeTimeRanges([
        { start: '9:00', end: '11:35' },
        { start: '12:55', end: '15:05' },
      ]),
      [
        { start: '09:00', end: '11:35' },
        { start: '12:55', end: '15:05' },
      ],
    );
  });

  test('忽略缺少字段或格式非法的条目', () => {
    assert.deepStrictEqual(
      normalizeTimeRanges([
        null,
        { start: '09:00' },
        { start: 'aa', end: '10:00' },
        { start: '09:00', end: '25:00' },
        { start: '10:00', end: '11:00' },
      ]),
      [{ start: '10:00', end: '11:00' }],
    );
  });

  test('非数组输入返回空数组', () => {
    assert.deepStrictEqual(normalizeTimeRanges(undefined), []);
    assert.deepStrictEqual(normalizeTimeRanges({ start: '09:00', end: '11:00' }), []);
  });
});

suite('timeWindow / isWithinTimeRanges', () => {
  const ranges = DEFAULT_REFRESH_TIME_RANGES;

  test('默认时段内的时间返回 true', () => {
    assert.strictEqual(isWithinTimeRanges(ranges, at(9, 0)), true);
    assert.strictEqual(isWithinTimeRanges(ranges, at(10, 30)), true);
    assert.strictEqual(isWithinTimeRanges(ranges, at(14, 0)), true);
  });

  test('起止时间为闭区间', () => {
    assert.strictEqual(isWithinTimeRanges(ranges, at(11, 35)), true);
    assert.strictEqual(isWithinTimeRanges(ranges, at(12, 55)), true);
    assert.strictEqual(isWithinTimeRanges(ranges, at(15, 5)), true);
  });

  test('午休与收盘后的时间返回 false', () => {
    assert.strictEqual(isWithinTimeRanges(ranges, at(8, 59)), false);
    assert.strictEqual(isWithinTimeRanges(ranges, at(11, 36)), false);
    assert.strictEqual(isWithinTimeRanges(ranges, at(12, 54)), false);
    assert.strictEqual(isWithinTimeRanges(ranges, at(15, 6)), false);
    assert.strictEqual(isWithinTimeRanges(ranges, at(20, 0)), false);
  });

  test('时间段为空时视为不限制，恒为 true', () => {
    assert.strictEqual(isWithinTimeRanges([], at(3, 0)), true);
    assert.strictEqual(isWithinTimeRanges([], at(20, 0)), true);
  });

  test('支持跨零点时间段', () => {
    const overnight = [{ start: '22:00', end: '02:00' }];
    assert.strictEqual(isWithinTimeRanges(overnight, at(23, 30)), true);
    assert.strictEqual(isWithinTimeRanges(overnight, at(1, 0)), true);
    assert.strictEqual(isWithinTimeRanges(overnight, at(2, 0)), true);
    assert.strictEqual(isWithinTimeRanges(overnight, at(12, 0)), false);
  });

  test('非法条目被跳过后不影响其余时段判断', () => {
    const mixed = [{ start: 'bad', end: 'bad' }, { start: '09:00', end: '10:00' }];
    assert.strictEqual(isWithinTimeRanges(mixed, at(9, 30)), true);
    assert.strictEqual(isWithinTimeRanges(mixed, at(11, 0)), false);
  });
});
