import * as assert from 'assert';
import {
  CHART_PERIOD_LABEL,
  parseIntradayChartResponse,
  parseKlineChartResponse,
} from '../../chart';
import { StockCode } from '../../types';

const SH600519: StockCode = { key: 'sh600519', code: '600519', market: 'sh' };
const HK00700: StockCode = { key: 'hk00700', code: '00700', market: 'hk' };

suite('chart / 常量', () => {
  test('图表周期文案映射正确', () => {
    assert.strictEqual(CHART_PERIOD_LABEL.intraday, '分时图');
    assert.strictEqual(CHART_PERIOD_LABEL.daily, '日K图');
    assert.strictEqual(CHART_PERIOD_LABEL.weekly, '周K图');
    assert.strictEqual(CHART_PERIOD_LABEL.monthly, '月K图');
  });
});

suite('chart / parseIntradayChartResponse', () => {
  test('A 股分时图：成交量从手换算为股，并计算均价', () => {
    const raw = {
      data: {
        sh600519: {
          data: {
            data: [
              '0930 1470.00 1215 178605000.00',
              '0931 1476.91 3668 538377437.66',
            ],
          },
          qt: {
            sh600519: ['1', '贵州茅台', '600519', '1476.91', '1480.00', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '20261104160018'],
          },
        },
      },
    };

    const data = parseIntradayChartResponse(raw, SH600519);
    assert.strictEqual(data.period, 'intraday');
    assert.strictEqual(data.name, '贵州茅台');
    assert.strictEqual(data.previousClose, 1480);
    assert.strictEqual(data.points.length, 2);
    const first = data.points[0] as (typeof data.points)[number] & { averagePrice: number; volume: number; time: string };
    assert.strictEqual(first.time, '09:30');
    assert.strictEqual(first.volume, 121500);
    assert.strictEqual(first.averagePrice, 178605000 / 121500);
  });

  test('港股分时图：成交量保持原值，不再乘 100', () => {
    const raw = {
      data: {
        hk00700: {
          data: {
            data: ['0930 397.800 620893 247412601.900'],
          },
          qt: {
            hk00700: ['100', '腾讯控股', '00700', '400.600', '397.200', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '2026/11/04 16:00:00'],
          },
        },
      },
    };

    const data = parseIntradayChartResponse(raw, HK00700);
    assert.strictEqual(data.points.length, 1);
    assert.strictEqual(data.points[0].volume, 620893);
  });
});

suite('chart / parseKlineChartResponse', () => {
  test('A 股日K：优先解析 qfqday 数组并换算成交量', () => {
    const raw = {
      data: {
        sh600519: {
          qfqday: [['2026-11-04', '1470.00', '1446.44', '1480.60', '1439.00', '65434']],
          qt: {
            sh600519: ['1', '贵州茅台', '600519', '1446.44', '1480.00', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '20261104160018'],
          },
        },
      },
    };

    const data = parseKlineChartResponse(raw, SH600519, 'daily');
    assert.strictEqual(data.period, 'daily');
    assert.strictEqual(data.points.length, 1);
    const first = data.points[0] as (typeof data.points)[number] & { open: number; close: number; volume: number };
    assert.strictEqual(first.open, 1470);
    assert.strictEqual(first.close, 1446.44);
    assert.strictEqual(first.volume, 6543400);
  });

  test('港股周K：可回退解析 week 数组', () => {
    const raw = {
      data: {
        hk00700: {
          week: [['2026-11-04', '397.800', '400.600', '402.200', '391.600', '15958505.0']],
          qt: {
            hk00700: ['100', '腾讯控股', '00700', '400.600', '397.200', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '2026/11/04 16:00:00'],
          },
        },
      },
    };

    const data = parseKlineChartResponse(raw, HK00700, 'weekly');
    assert.strictEqual(data.period, 'weekly');
    assert.strictEqual(data.points.length, 1);
    assert.strictEqual(data.points[0].volume, 15958505);
  });
});
