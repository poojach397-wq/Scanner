// Thin wrapper around Groww's REST API.
// Docs: https://groww.in/trade-api/docs
// NOTE: verify exact field names once you have real API access - Groww's
// response shape may differ slightly; adjust the parsing below if so.

const GROWW_BASE_URL = "https://api.groww.in/v1";

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getTodayCandles(
  apiToken: string,
  tradingSymbol: string,
  exchange: string = "NSE",
  segment: string = "CASH",
  candleInterval: string = "1minute"
): Promise<Candle[]> {
  const today = new Date().toISOString().split("T")[0];
  const startTime = `${today} 09:15:00`;
  const endTime = `${today} 15:30:00`;
  return fetchCandles(apiToken, tradingSymbol, exchange, segment, startTime, endTime, candleInterval);
}

// Fetches daily candles over a lookback window - used by the phase-2 trendline scanner.
// NOTE: "day" as the candle_interval value is inferred from docs examples showing
// interval names like "5minute" - not explicitly confirmed for daily bars. Verify
// this against your account's actual API response before relying on it; if it errors,
// check Groww's candle_interval enum in the dashboard/docs for the correct daily value.
export async function getDailyCandles(
  apiToken: string,
  tradingSymbol: string,
  lookbackDays: number = 180,
  exchange: string = "NSE",
  segment: string = "CASH"
): Promise<Candle[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);

  const startTime = `${start.toISOString().split("T")[0]} 09:15:00`;
  const endTime = `${end.toISOString().split("T")[0]} 15:30:00`;

  return fetchCandles(apiToken, tradingSymbol, exchange, segment, startTime, endTime, "day");
}

async function fetchCandles(
  apiToken: string,
  tradingSymbol: string,
  exchange: string,
  segment: string,
  startTime: string,
  endTime: string,
  candleInterval: string
): Promise<Candle[]> {
  // groww_symbol format for stocks/indices is "EXCHANGE-SYMBOL", e.g. "NSE-RELIANCE"
  const growwSymbol = `${exchange}-${tradingSymbol}`;

  const url = new URL(`${GROWW_BASE_URL}/historical/candles`);
  url.searchParams.set("exchange", exchange);
  url.searchParams.set("segment", segment);
  url.searchParams.set("groww_symbol", growwSymbol);
  url.searchParams.set("start_time", startTime);
  url.searchParams.set("end_time", endTime);
  url.searchParams.set("candle_interval", candleInterval);

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiToken}`,
      "X-API-VERSION": "1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Groww API error for ${tradingSymbol}: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  // Response shape per docs: { status, payload: { candles: [...], ... } }
  const rawCandles = data.payload?.candles ?? data.candles ?? data;

  return rawCandles.map((c: any[]) => ({
    timestamp: c[0],
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: c[5],
    // c[6] is open interest, only populated for FNO - not used here
  }));
}
