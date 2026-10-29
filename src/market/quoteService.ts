import { QuoteError, QuoteErrorCode, Quote, StockCode } from '../types';
import { fetchQuotes } from './tencentProvider';
import { StockMonitorConfig } from '../config';

/** 一次刷新的结果 */
export interface RefreshResult {
  /** 可用行情快照（键为 StockCode.key），失败时返回上一次成功的数据 */
  quotes: Map<string, Quote>;
  /** 本次刷新发生的错误，未出错时为 undefined */
  error?: QuoteError;
}

/**
 * 行情服务：负责调用行情接口并在内存中缓存最近一次成功的数据。
 *
 * 缓存的意义：网络抖动或接口临时不可用时，状态栏可以继续展示上一次的行情，
 * 而不是突然变成空白，用户体验更平滑。
 */
export class QuoteService {
  private readonly cache = new Map<string, Quote>();

  /**
   * 直接请求行情接口，**不写入缓存**。
   * 用于「添加股票前探测代码是否真实存在」这类一次性查询，避免污染现有缓存。
   */
  async fetchOnce(codes: StockCode[], config: StockMonitorConfig): Promise<Map<string, Quote>> {
    return fetchQuotes(codes, config.apiEndpoint, config.requestTimeout);
  }

  /** 按代码取缓存快照（仅返回请求列表内的代码） */
  snapshot(codes: StockCode[]): Map<string, Quote> {
    const result = new Map<string, Quote>();
    for (const code of codes) {
      const quote = this.cache.get(code.key);
      if (quote) {
        result.set(code.key, quote);
      }
    }
    return result;
  }

  /**
   * 拉取最新行情。
   * @param codes 需要查询的股票
   * @param config 当前配置（提供接口地址与超时）
   */
  async refresh(codes: StockCode[], config: StockMonitorConfig): Promise<RefreshResult> {
    if (codes.length === 0) {
      this.cache.clear();
      return { quotes: new Map() };
    }

    try {
      const fresh = await this.fetchOnce(codes, config);
      for (const [key, quote] of fresh) {
        this.cache.set(key, quote);
      }
      // 清理已从关注列表移除的缓存，避免无界增长
      const validKeys = new Set(codes.map((c) => c.key));
      for (const key of [...this.cache.keys()]) {
        if (!validKeys.has(key)) {
          this.cache.delete(key);
        }
      }
      return { quotes: this.snapshot(codes) };
    } catch (err) {
      const error =
        err instanceof QuoteError
          ? err
          : new QuoteError(QuoteErrorCode.UNKNOWN, err instanceof Error ? err.message : '请求行情失败', err);
      // 降级返回缓存，保证界面仍有数据可展示
      return { quotes: this.snapshot(codes), error };
    }
  }

  /** 清空缓存（关注列表被清空时调用） */
  clear(): void {
    this.cache.clear();
  }
}
