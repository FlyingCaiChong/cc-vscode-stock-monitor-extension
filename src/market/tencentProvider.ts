import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import * as iconv from 'iconv-lite';
import { Quote, QuoteError, QuoteErrorCode, StockCode } from '../types';
import { logger } from '../logger';
import { parseQuoteResponse } from './quoteParser';

/**
 * 腾讯财经行情接口客户端（负责网络请求与编码转换）。
 *
 * 接口：GET https://qt.gtimg.cn/q=sh600519,hk00700,usAAPL
 * 文本解析逻辑见 `quoteParser.ts`，本文件仅保留 IO 相关代码。
 */

// 保持对外导出兼容：解析函数统一由 quoteParser 提供
export { normalizeQuoteTime, parseQuoteLine, parseQuoteResponse } from './quoteParser';

/** 单次请求批量查询的最大代码数，避免 URL 过长被服务端拒绝 */
const MAX_CODES_PER_REQUEST = 50;

/** 请求头，模拟浏览器访问，避免被风控拦截 */
const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: '*/*',
  Referer: 'https://gu.qq.com/',
};

/** 发起一次 HTTP(S) GET，返回解压后的 GBK 字符串 */
function httpGetText(url: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      reject(new QuoteError(QuoteErrorCode.INVALID_CODE, `行情接口地址无效：${url}`));
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
        // 处理重定向，最多跟随 3 层
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, target).toString();
          httpGetText(next, timeout).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new QuoteError(QuoteErrorCode.NETWORK, `行情接口返回异常状态码 ${status}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            // 腾讯接口固定使用 GBK 编码，需转码为 UTF-8 才能正确显示中文名称
            resolve(iconv.decode(Buffer.concat(chunks), 'gbk'));
          } catch (err) {
            reject(new QuoteError(QuoteErrorCode.PARSE, '行情数据解码失败', err));
          }
        });
        res.on('error', (err) => reject(new QuoteError(QuoteErrorCode.NETWORK, '读取行情响应失败', err)));
      }
    );

    // 超时必须主动销毁 socket，否则连接会一直挂起
    req.setTimeout(timeout, () => {
      req.destroy(new QuoteError(QuoteErrorCode.TIMEOUT, `行情请求超时（${timeout}ms）`));
    });
    req.on('error', (err) => {
      if (err instanceof QuoteError) {
        reject(err);
        return;
      }
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
        reject(new QuoteError(QuoteErrorCode.TIMEOUT, `行情请求超时（${timeout}ms）`, err));
      } else {
        reject(new QuoteError(QuoteErrorCode.NETWORK, `网络请求失败：${err.message}`, err));
      }
    });
  });
}

/**
 * 批量拉取行情。
 * 会按 MAX_CODES_PER_REQUEST 自动分片，任一代码查不到不会影响其他代码。
 */
export async function fetchQuotes(
  codes: StockCode[],
  endpoint: string,
  timeout: number
): Promise<Map<string, Quote>> {
  const merged = new Map<string, Quote>();
  if (codes.length === 0) {
    return merged;
  }

  for (let i = 0; i < codes.length; i += MAX_CODES_PER_REQUEST) {
    const slice = codes.slice(i, i + MAX_CODES_PER_REQUEST);
    const url = `${endpoint}/q=${slice.map((c) => c.key).join(',')}`;
    logger.info(`请求行情：${url}`);

    const text = await httpGetText(url, timeout);
    const parsed = parseQuoteResponse(text, slice);
    for (const [key, quote] of parsed) {
      merged.set(key, quote);
    }

    const missing = slice.filter((c) => !parsed.has(c.key));
    if (missing.length > 0) {
      logger.warn(`以下代码未返回行情数据：${missing.map((c) => c.key).join(', ')}`);
    }
  }

  if (merged.size === 0) {
    throw new QuoteError(QuoteErrorCode.EMPTY, '行情接口未返回任何有效数据，请检查股票代码是否正确');
  }
  return merged;
}
