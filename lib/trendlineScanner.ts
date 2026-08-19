import { Candle } from "./groww";

// Same config as the Python phase-2 script - tune after backtesting.
export const SWING_WINDOW = 5;
export const MIN_SWING_GAP_DAYS = 10;
export const VOLUME_CONFIRM_RATIO = 1.5;

export interface Trendline {
  idxA: number;
  idxB: number;
  priceA: number;
  priceB: number;
  slope: number;
  lineValue: (x: number) => number;
}

export interface BreakoutResult {
  brokeToday: boolean;
  lastClose: number;
  trendlineValue: number;
  volumeRatio: number | null;
  volumeConfirmed: boolean;
}

export function findSwingHighs(candles: Candle[], window: number = SWING_WINDOW): number[] {
  const highs = candles.map((c) => c.high);
  const swingIdx: number[] = [];
  for (let i = window; i < highs.length - window; i++) {
    const segment = highs.slice(i - window, i + window + 1);
    if (highs[i] === Math.max(...segment)) swingIdx.push(i);
  }
  return swingIdx;
}

// Finds the two most recent DESCENDING swing highs and fits a line through them.
// Returns null if no valid descending pair exists (i.e. no downtrend to break out of).
export function fitDescendingTrendline(candles: Candle[], swingIdx: number[]): Trendline | null {
  for (let i = swingIdx.length - 1; i > 0; i--) {
    const idxB = swingIdx[i]; // more recent
    for (let j = i - 1; j >= 0; j--) {
      const idxA = swingIdx[j]; // earlier
      if (idxB - idxA < MIN_SWING_GAP_DAYS) continue;

      const priceA = candles[idxA].high;
      const priceB = candles[idxB].high;

      if (priceB < priceA) {
        const slope = (priceB - priceA) / (idxB - idxA);
        const intercept = priceA - slope * idxA;
        return {
          idxA,
          idxB,
          priceA,
          priceB,
          slope,
          lineValue: (x: number) => slope * x + intercept,
        };
      }
    }
  }
  return null;
}

export function checkBreakout(candles: Candle[], trendline: Trendline): BreakoutResult {
  const lastIdx = candles.length - 1;
  const lastClose = candles[lastIdx].close;
  const prevClose = candles[lastIdx - 1].close;

  const trendlineToday = trendline.lineValue(lastIdx);
  const trendlineYesterday = trendline.lineValue(lastIdx - 1);

  const brokeToday = lastClose > trendlineToday && prevClose <= trendlineYesterday;

  const start = Math.max(0, lastIdx - 20);
  const window = candles.slice(start, lastIdx);
  const avgVolume20 = window.length ? window.reduce((s, c) => s + c.volume, 0) / window.length : NaN;
  const todayVolume = candles[lastIdx].volume;
  const volumeRatio = avgVolume20 ? todayVolume / avgVolume20 : NaN;
  const volumeConfirmed = !isNaN(volumeRatio) && volumeRatio >= VOLUME_CONFIRM_RATIO;

  return {
    brokeToday,
    lastClose,
    trendlineValue: Math.round(trendlineToday * 100) / 100,
    volumeRatio: !isNaN(volumeRatio) ? Math.round(volumeRatio * 100) / 100 : null,
    volumeConfirmed,
  };
}

// Convenience: runs the full pipeline on a set of daily candles for one symbol.
export function scanForTrendlineBreakout(candles: Candle[]): BreakoutResult | null {
  const minLength = SWING_WINDOW * 2 + MIN_SWING_GAP_DAYS;
  if (candles.length < minLength) return null;

  const swingIdx = findSwingHighs(candles);
  if (swingIdx.length < 2) return null;

  const trendline = fitDescendingTrendline(candles, swingIdx);
  if (!trendline) return null;

  return checkBreakout(candles, trendline);
}
