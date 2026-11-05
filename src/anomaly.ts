import { Quote } from './types';

/**
 * 异动提醒：基于「短时相对变化」的瞬时事件提醒。
 *
 * 与「价格预警」（alerts.ts）的区别：
 * - 价格预警关注**绝对阈值**（如最新价上破 1600），是一种**持续状态**，
 *   只要条件成立状态栏就会一直高亮；
 * - 异动提醒关注**短时相对变化**（如 60 秒内急速拉升 1.5%、量比骤增），
 *   属于**瞬时事件**，提醒一次后进入冷却，不会长期占据状态栏。
 *
 * 本文件为纯函数实现，不依赖 `vscode` 与网络，可被 mocha 单元测试直接引用。
 */

/** 异动类型 */
export type AnomalyKind = 'surge' | 'plunge' | 'volumeSpike';

/** 异动提醒配置（已归一化） */
export interface AnomalySettings {
  /** 是否启用异动提醒 */
  enabled: boolean;
  /** 价格观察窗口（秒）：比较「窗口内最早采样价」与「当前价」的涨跌幅 */
  windowSeconds: number;
  /** 窗口内涨跌幅超过该百分数值即视为急拉 / 跳水，如 1.5 表示 1.5% */
  priceChangePercent: number;
  /** 量比达到该值即视为放量异动（仅 A 股提供量比），取 0 表示关闭 */
  volumeRatioThreshold: number;
  /** 同一只股票同类异动的提醒冷却时间（秒），避免短时间内反复打扰 */
  cooldownSeconds: number;
}

/** 行情采样点，用于回溯窗口内的价格变化 */
export interface AnomalySample {
  /** 采样时间戳（毫秒），取自 `Quote.fetchedAt` */
  at: number;
  /** 该时刻的最新价 */
  price: number;
}

/**
 * 异动检测器的运行时状态。
 *
 * 由调用方（控制器）持有并在每轮刷新时传入，检测过程中会被就地更新，
 * 因此既不适合放在配置里，也不适合放在行情缓存里。
 */
export interface AnomalyState {
  /** key -> 采样序列（按时间升序） */
  history: Map<string, AnomalySample[]>;
  /** `${key}|${kind}` -> 冷却截止时间戳（毫秒） */
  cooldowns: Map<string, number>;
}

/** 一次异动事件 */
export interface AnomalyEvent {
  /** 归一化股票代码，如 sh600519 */
  key: string;
  /** 异动类型 */
  kind: AnomalyKind;
  /** 人类可读的说明，如「近 60 秒急速拉升 1.52%」 */
  message: string;
}

/** 创建空的检测器状态 */
export function createAnomalyState(): AnomalyState {
  return { history: new Map(), cooldowns: new Map() };
}

/** 清空检测器状态（关注列表被清空时调用，避免残留历史影响后续判断） */
export function resetAnomalyState(state: AnomalyState): void {
  state.history.clear();
  state.cooldowns.clear();
}

/** 冷却记录键：同一只股票的不同异动类型互不影响 */
function cooldownKey(key: string, kind: AnomalyKind): string {
  return `${key}|${kind}`;
}

/** 百分数与价格统一保留两位小数 */
function fmt(value: number): string {
  return value.toFixed(2);
}

/**
 * 记录一次采样。
 *
 * 网络失败时行情服务会复用上一次缓存，其 `fetchedAt` 与上一轮相同，
 * 此时覆盖而不再追加，避免产生重复采样点干扰窗口判断。
 */
function recordSample(list: AnomalySample[], at: number, price: number): void {
  const last = list[list.length - 1];
  if (last && at === last.at) {
    last.price = price;
    return;
  }
  if (last && at < last.at) {
    return; // 时间倒流（理论上不会发生），忽略本次采样
  }
  list.push({ at, price });
}

/**
 * 清理已不在关注列表中的股票历史，并裁剪超出窗口的采样点与失效的冷却记录，
 * 避免插件长时间运行时内存无限增长。
 */
function prune(
  state: AnomalyState,
  quotes: ReadonlyMap<string, Quote>,
  settings: AnomalySettings,
  now: number,
): void {
  // 多保留一个窗口长度，保证窗口起点附近始终有可用的基准点
  const keepFrom = now - settings.windowSeconds * 2000;
  for (const [key, samples] of [...state.history]) {
    if (!quotes.has(key)) {
      state.history.delete(key);
      continue;
    }
    state.history.set(
      key,
      samples.filter((sample) => sample.at >= keepFrom),
    );
  }
  for (const [key, until] of [...state.cooldowns]) {
    // 冷却键格式为 `${code}|${kind}`，取股票部分判断是否仍在关注列表中
    if (until <= now || !quotes.has(key.split('|')[0])) {
      state.cooldowns.delete(key);
    }
  }
}

/**
 * 比较窗口内最早采样价与当前价，判断是否属于急拉 / 跳水。
 *
 * 历史跨度不足一个完整窗口时返回 `undefined`：这样刚启动监控、
 * 采样点还很稀疏时不会把「首次拿到的一小段涨幅」误判为异动。
 */
function priceAnomaly(
  samples: readonly AnomalySample[],
  quote: Quote,
  settings: AnomalySettings,
): { kind: AnomalyKind; percent: number } | undefined {
  if (settings.priceChangePercent <= 0) {
    return undefined;
  }
  const oldest = samples[0];
  const cutoff = quote.fetchedAt - settings.windowSeconds * 1000;
  if (!oldest || oldest.at > cutoff) {
    return undefined;
  }
  // 取窗口内最早的一个采样点作为基准，保证统计区间不超过一个完整窗口
  const base = samples.find((sample) => sample.at >= cutoff) ?? oldest;
  if (base.price <= 0) {
    return undefined;
  }
  const percent = ((quote.price - base.price) / base.price) * 100;
  if (percent >= settings.priceChangePercent) {
    return { kind: 'surge', percent };
  }
  if (percent <= -settings.priceChangePercent) {
    return { kind: 'plunge', percent };
  }
  return undefined;
}

/**
 * 检测行情异动。
 *
 * 每轮行情刷新后调用一次：
 * 1. 记录本轮采样，并清理过期历史与冷却记录；
 * 2. 对每只股票比较窗口内涨跌幅，命中急拉 / 跳水产出事件；
 * 3. A 股量比达到阈值时额外产出放量异动事件；
 * 4. 处于冷却期内的同类异动会被抑制，避免短时间内反复打扰。
 *
 * @param quotes 当前行情快照（键为 StockCode.key）
 * @param settings 已归一化的异动提醒配置
 * @param state 检测器状态，会在本次调用中被更新
 * @param now 当前时间戳（毫秒），由调用方传入便于测试
 */
export function detectAnomalies(
  quotes: ReadonlyMap<string, Quote>,
  settings: AnomalySettings,
  state: AnomalyState,
  now: number,
): AnomalyEvent[] {
  prune(state, quotes, settings, now);
  if (!settings.enabled) {
    return [];
  }

  const events: AnomalyEvent[] = [];
  for (const [key, quote] of quotes) {
    // 无有效价格 / 时间的数据无法参与判断（如接口返回空数据）
    if (!(quote.price > 0) || quote.fetchedAt <= 0) {
      continue;
    }

    let samples = state.history.get(key);
    if (!samples) {
      samples = [];
      state.history.set(key, samples);
    }
    recordSample(samples, quote.fetchedAt, quote.price);

    // 候选事件：价格异动与放量异动可能同时命中
    const candidates: AnomalyEvent[] = [];
    const price = priceAnomaly(samples, quote, settings);
    if (price) {
      const percent = fmt(Math.abs(price.percent));
      candidates.push({
        key,
        kind: price.kind,
        message:
          price.kind === 'surge'
            ? `近 ${settings.windowSeconds} 秒急速拉升 ${percent}%（现价 ${fmt(quote.price)}）`
            : `近 ${settings.windowSeconds} 秒急速跳水 ${percent}%（现价 ${fmt(quote.price)}）`,
      });
    }
    if (settings.volumeRatioThreshold > 0 && quote.volumeRatio >= settings.volumeRatioThreshold) {
      candidates.push({
        key,
        kind: 'volumeSpike',
        message: `量比 ${fmt(quote.volumeRatio)}，成交明显放大`,
      });
    }

    for (const candidate of candidates) {
      const until = state.cooldowns.get(cooldownKey(key, candidate.kind)) ?? 0;
      if (now < until) {
        continue; // 冷却期内，本次不重复提醒
      }
      state.cooldowns.set(cooldownKey(key, candidate.kind), now + settings.cooldownSeconds * 1000);
      events.push(candidate);
    }
  }
  return events;
}
