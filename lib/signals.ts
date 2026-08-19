import { Candle } from "./groww";

// Same thresholds as the Python backtest script - tune these after backtesting.
export const VOLUME_SPIKE_RATIO = 2.0;
export const MOMENTUM_LOOKBACK = 5;
export const MOMENTUM_THRESHOLD_PCT = 0.3;

export const RSI_PERIOD = 14;
export const MACD_FAST = 12;
export const MACD_SLOW = 26;
export const MACD_SIGNAL = 9;
export const REQUIRE_MACD_CONFIRMATION = true;

export interface SignalResult {
  timestamp: string;
  close: number;
  vwap: number;
  volumeRatio: number;
  momentumPct: number;
  rsi: number;
  macdHist: number;
  signal: "BUY_CALL" | "BUY_PUT" | null;
}

function computeEMA(values: number[], span: number): number[] {
  const alpha = 2 / (span + 1);
  const ema: number[] = [];
  values.forEach((v, i) => {
    ema.push(i === 0 ? v : v * alpha + ema[i - 1] * (1 - alpha));
  });
  return ema;
}

function computeRSI(closes: number[], period: number = RSI_PERIOD): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) {
        const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        rsi[i] = 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }
  return rsi;
}

function computeMACD(closes: number[]) {
  const emaFast = computeEMA(closes, MACD_FAST);
  const emaSlow = computeEMA(closes, MACD_SLOW);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = computeEMA(macdLine, MACD_SIGNAL);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

function computeVWAP(candles: Candle[]): number[] {
  let cumVol = 0;
  let cumVolPrice = 0;
  return candles.map((c) => {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumVol += c.volume;
    cumVolPrice += typicalPrice * c.volume;
    return cumVol === 0 ? c.close : cumVolPrice / cumVol;
  });
}

function rollingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < 4) return null; // need at least 5 bars (matches min_periods=5 in Python)
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export function computeSignals(candles: Candle[]): SignalResult[] {
  const vwapSeries = computeVWAP(candles);
  const volumes = candles.map((c) => c.volume);
  const avgVolumes = rollingAverage(volumes, 20);
  const closes = candles.map((c) => c.close);
  const rsiSeries = computeRSI(closes);
  const { histogram } = computeMACD(closes);

  return candles.map((c, i) => {
    const vwap = vwapSeries[i];
    const avgVolume = avgVolumes[i];
    const volumeRatio = avgVolume ? c.volume / avgVolume : NaN;
    const rsi = rsiSeries[i];
    const macdHist = histogram[i];

    let momentumPct = NaN;
    if (i >= MOMENTUM_LOOKBACK) {
      const prevClose = candles[i - MOMENTUM_LOOKBACK].close;
      momentumPct = ((c.close - prevClose) / prevClose) * 100;
    }

    let signal: SignalResult["signal"] = null;
    if (!isNaN(volumeRatio) && !isNaN(momentumPct) && !isNaN(macdHist)) {
      const volSpike = volumeRatio >= VOLUME_SPIKE_RATIO;
      const strongUp = momentumPct >= MOMENTUM_THRESHOLD_PCT;
      const strongDown = momentumPct <= -MOMENTUM_THRESHOLD_PCT;
      const aboveVwap = c.close > vwap;
      const belowVwap = c.close < vwap;
      const macdBullish = macdHist > 0;
      const macdBearish = macdHist < 0;

      let callOk = volSpike && strongUp && aboveVwap;
      let putOk = volSpike && strongDown && belowVwap;

      if (REQUIRE_MACD_CONFIRMATION) {
        callOk = callOk && macdBullish;
        putOk = putOk && macdBearish;
      }

      if (callOk) signal = "BUY_CALL";
      else if (putOk) signal = "BUY_PUT";
    }

    return {
      timestamp: c.timestamp,
      close: c.close,
      vwap,
      volumeRatio,
      momentumPct,
      rsi,
      macdHist,
      signal,
    };
  });
}
