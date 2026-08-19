import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGrowwAccessToken } from "@/lib/growwAuth";
import { getTodayCandles } from "@/lib/groww";
import { computeSignals } from "@/lib/signals";
import { sendTelegramAlert } from "@/lib/telegram";

// This route is called by Vercel Cron every N minutes during market hours.
// Configure the schedule in vercel.json.

export async function GET(request: Request) {
  // Protect this endpoint - Vercel Cron sends a secret header you set yourself
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: creds } = await supabase
    .from("broker_credentials")
    .select("totp_api_key, totp_secret")
    .maybeSingle();

  if (!creds?.totp_api_key) {
    return NextResponse.json({ error: "No Groww credentials configured - visit /settings" }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getGrowwAccessToken(creds.totp_api_key, creds.totp_secret);
  } catch (err: any) {
    console.error("Failed to get Groww access token:", err);
    return NextResponse.json({ error: "Groww auth failed: " + err.message }, { status: 502 });
  }

  const { data: universe } = await supabase
    .from("fno_universe")
    .select("trading_symbol")
    .eq("active", true)
    .limit(100); // hard cap per your constraint

  const symbols = universe?.map((u) => u.trading_symbol) ?? [];
  const results: any[] = [];

  for (const symbol of symbols) {
    try {
      const candles = await getTodayCandles(accessToken, symbol);
      if (candles.length === 0) continue;

      const signals = computeSignals(candles);
      const latest = signals[signals.length - 1];

      await supabase.from("scan_results").insert({
        trading_symbol: symbol,
        close: latest.close,
        vwap: latest.vwap,
        volume_ratio: latest.volumeRatio,
        momentum_pct: latest.momentumPct,
        rsi: latest.rsi,
        macd_hist: latest.macdHist,
        signal: latest.signal,
      });

      if (latest.signal) {
        // Check if already alerted today for this symbol+signal (dedup)
        const { data: existing } = await supabase
          .from("alerts_sent")
          .select("id")
          .eq("trading_symbol", symbol)
          .eq("signal", latest.signal)
          .eq("alert_date", new Date().toISOString().split("T")[0])
          .maybeSingle();

        if (!existing) {
          await sendTelegramAlert(
            `🚨 *${latest.signal.replace("_", " ")}*\n` +
              `Symbol: *${symbol}*\n` +
              `Price: ₹${latest.close.toFixed(2)}\n` +
              `VWAP: ₹${latest.vwap.toFixed(2)}\n` +
              `Volume: ${latest.volumeRatio.toFixed(1)}x avg\n` +
              `Momentum: ${latest.momentumPct.toFixed(2)}%\n` +
              `RSI: ${latest.rsi.toFixed(1)}\n` +
              `MACD Hist: ${latest.macdHist.toFixed(3)}`
          );

          await supabase.from("alerts_sent").insert({
            trading_symbol: symbol,
            signal: latest.signal,
          });
        }
      }

      results.push({ symbol, signal: latest.signal });
    } catch (err) {
      console.error(`Error scanning ${symbol}:`, err);
    }
  }

  return NextResponse.json({ scanned: results.length, results });
}
