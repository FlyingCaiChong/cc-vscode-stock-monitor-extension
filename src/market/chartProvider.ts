import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
  ChartPeriod,
  parseIntradayChartResponse,
  parseKlineChartResponse,
  StockChartData,
} from '../chart';
import { StockMonitorConfig } from '../config';
import { logger } from '../logger';
import { QuoteError, QuoteErrorCode, StockCode } from '../types';

/** 图表接口请求头 */
const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  Referer: 'https://gu.qq.com/',
};

/** K 线请求周期映射 */
const KLINE_PERIOD_PARAM: Record<Exclude<ChartPeriod, 'intraday'>, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
};

/** 单次请求 JSON 文本 */
function httpGetJson(url: string, timeout: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      reject(new QuoteError(QuoteErrorCode.INVALID_CODE, `图表接口地址无效：${url}`));
      return;
    }

    const transport = target.protocol === 'http:' ? http : https;
    const req = transport.get(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        headers: REQUEST_HEADERS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, target).toString();
          httpGetJson(next, timeout).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new QuoteError(QuoteErrorCode.NETWORK, `图表接口返回异常状态码 ${status}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve(JSON.parse(text));
          } catch (err) {
            reject(new QuoteError(QuoteErrorCode.PARSE, '图表数据解析失败', err));
          }
        });
        res.on('error', (err) => reject(new QuoteError(QuoteErrorCode.NETWORK, '读取图表响应失败', err)));
      }
    );

    req.setTimeout(timeout, () => {
      req.destroy(new QuoteError(QuoteErrorCode.TIMEOUT, `图表请求超时（${timeout}ms）`));
    });
    req.on('error', (err) => {
      if (err instanceof QuoteError) {
        reject(err);
        return;
      }
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
        reject(new QuoteError(QuoteErrorCode.TIMEOUT, `图表请求超时（${timeout}ms）`, err));
      } else {
        reject(new QuoteError(QuoteErrorCode.NETWORK, `图表网络请求失败：${err.message}`, err));
      }
    });
  });
}

/** 拉取指定周期图表数据 */
export async function fetchChartData(
  stock: StockCode,
  period: ChartPeriod,
  config: StockMonitorConfig,
): Promise<StockChartData> {
  const endpoint = config.chartApiEndpoint.replace(/\/+$/, '');
  try {
    if (period === 'intraday') {
      const url = `${endpoint}/appstock/app/minute/query?code=${stock.key}`;
      logger.info(`请求分时图：${url}`);
      const raw = await httpGetJson(url, config.requestTimeout);
      return parseIntradayChartResponse(raw, stock);
    }

    const klineType = KLINE_PERIOD_PARAM[period];
    const url = `${endpoint}/appstock/app/fqkline/get?param=${stock.key},${klineType},,,120,qfq`;
    logger.info(`请求${period}图：${url}`);
    const raw = await httpGetJson(url, config.requestTimeout);
    return parseKlineChartResponse(raw, stock, period);
  } catch (err) {
    if (err instanceof QuoteError) {
      throw err;
    }
    throw new QuoteError(
      QuoteErrorCode.UNKNOWN,
      `获取${stock.key}图表数据失败：${err instanceof Error ? err.message : '未知错误'}`,
      err,
    );
  }
}
