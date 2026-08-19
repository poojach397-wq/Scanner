/**
 * Option Chain Analysis Utilities
 * =================================
 * Pure computation functions - Max Pain, PCR, Delta OI, IV skew/percentile.
 *
 * Adapted from MrChartist/india-s-best-option-hub (MIT licensed), with credit.
 * Original: https://github.com/MrChartist/india-s-best-option-hub/blob/main/src/lib/oiUtils.ts
 *
 * Changes from the original:
 * - Types (OptionData/OptionLegData) inlined here instead of importing from
 *   their mockData.ts, so this file has zero dependency on their codebase.
 * - Everything else is logic-identical - these are pure functions with no
 *   broker-specific assumptions, so they plug directly into option chain
 *   data from Groww's API once you map Groww's response shape to OptionData.
 *
 * THIS IS PHASE 2 - not wired into the scanner yet. Use once you're ready
 * to add strike suggestion on top of the volume/momentum/VWAP signals.
 */

export interface OptionLegData {
  ltp: number;
  oi: number;
  oiChange: number;
  volume: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  bidPrice: number;
  askPrice: number;
}

export interface OptionData {
  strikePrice: number;
  ce: OptionLegData;
  pe: OptionLegData;
}

// ── Max Pain Calculator ──
// The strike price where option writers (sellers) lose the least money -
// often acts as a magnet price near expiry.

export function getMaxPain(chain: OptionData[]): number {
  if (chain.length === 0) return 0;

  let minPain = Infinity;
  let maxPainStrike = chain[0]?.strikePrice || 0;

  for (const option of chain) {
    let totalPain = 0;
    for (const other of chain) {
      if (other.strikePrice < option.strikePrice) {
        totalPain += other.ce.oi * (option.strikePrice - other.strikePrice);
      } else if (other.strikePrice > option.strikePrice) {
        totalPain += other.pe.oi * (other.strikePrice - option.strikePrice);
      }
    }
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = option.strikePrice;
    }
  }

  return maxPainStrike;
}

// ── Delta OI (directional exposure = OI x Delta) ──

export interface DeltaOIData {
  strike: number;
  ceDeltaOI: number;
  peDeltaOI: number;
  netDeltaOI: number;
}

export function getDeltaOI(chain: OptionData[]): DeltaOIData[] {
  return chain
    .filter((o) => o.ce.oi > 30000 || o.pe.oi > 30000)
    .map((o) => {
      const ceDeltaOI = Math.round(o.ce.oi * o.ce.delta);
      const peDeltaOI = Math.round(o.pe.oi * o.pe.delta); // delta is negative for puts
      return {
        strike: o.strikePrice,
        ceDeltaOI: Math.round(ceDeltaOI / 1000),
        peDeltaOI: Math.round(peDeltaOI / 1000),
        netDeltaOI: Math.round((ceDeltaOI + peDeltaOI) / 1000),
      };
    });
}

// ── Strike-wise PCR ──

export interface StrikePCRData {
  strike: number;
  pcr: number;
  ceOI: number;
  peOI: number;
  distance: number;
}

export function getStrikePCR(chain: OptionData[], spotPrice: number): StrikePCRData[] {
  return chain
    .filter((o) => o.ce.oi > 10000 && o.pe.oi > 10000)
    .map((o) => ({
      strike: o.strikePrice,
      pcr: Math.round((o.pe.oi / o.ce.oi) * 100) / 100,
      ceOI: o.ce.oi,
      peOI: o.pe.oi,
      distance: Math.round(((o.strikePrice - spotPrice) / spotPrice) * 10000) / 100,
    }));
}

// ── Overall PCR + simple directional signal ──

export function calculatePCR(chain: OptionData[]): {
  pcrOI: number;
  pcrVolume: number;
  totalCEOI: number;
  totalPEOI: number;
  totalCEVol: number;
  totalPEVol: number;
  signal: string;
} {
  const totalCEOI = chain.reduce((s, o) => s + o.ce.oi, 0);
  const totalPEOI = chain.reduce((s, o) => s + o.pe.oi, 0);
  const totalCEVol = chain.reduce((s, o) => s + o.ce.volume, 0);
  const totalPEVol = chain.reduce((s, o) => s + o.pe.volume, 0);

  const pcrOI = totalCEOI > 0 ? Math.round((totalPEOI / totalCEOI) * 100) / 100 : 0;
  const pcrVolume = totalCEVol > 0 ? Math.round((totalPEVol / totalCEVol) * 100) / 100 : 0;

  const signal =
    pcrOI > 1.3 ? "Strong Bullish" : pcrOI > 1.0 ? "Bullish" : pcrOI > 0.7 ? "Neutral" : pcrOI > 0.5 ? "Bearish" : "Strong Bearish";

  return { pcrOI, pcrVolume, totalCEOI, totalPEOI, totalCEVol, totalPEVol, signal };
}

// ── ATM IV + IV Percentile (proxy from cross-strike distribution) ──

export function getATMIV(chain: OptionData[], spotPrice: number): { atmIV: number; atmStrike: number } {
  if (chain.length === 0) return { atmIV: 0, atmStrike: 0 };
  const sorted = [...chain].sort(
    (a, b) => Math.abs(a.strikePrice - spotPrice) - Math.abs(b.strikePrice - spotPrice)
  );
  const atm = sorted[0];
  const atmIV = (atm.ce.iv + atm.pe.iv) / 2;
  return { atmIV, atmStrike: atm.strikePrice };
}

export function getIVPercentileFromChain(
  chain: OptionData[],
  spotPrice: number
): { percentile: number; rank: number; min: number; max: number; mean: number; atmIV: number } {
  if (chain.length === 0) return { percentile: 0, rank: 0, min: 0, max: 0, mean: 0, atmIV: 0 };

  const { atmIV } = getATMIV(chain, spotPrice);
  const allIVs = chain.flatMap((o) => [o.ce.iv, o.pe.iv]).filter((iv) => iv > 0);

  if (allIVs.length === 0) return { percentile: 0, rank: 0, min: 0, max: 0, mean: 0, atmIV };

  const sorted = [...allIVs].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < atmIV).length;
  const percentile = Math.round((below / sorted.length) * 100);
  const min = Math.min(...allIVs);
  const max = Math.max(...allIVs);
  const mean = allIVs.reduce((s, v) => s + v, 0) / allIVs.length;
  const rank = max > min ? Math.round(((atmIV - min) / (max - min)) * 100) : 50;

  return {
    percentile,
    rank,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    atmIV: Math.round(atmIV * 100) / 100,
  };
}
