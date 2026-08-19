import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGrowwAccessToken } from "@/lib/growwAuth";
import { getDailyCandles } from "@/lib/groww";
import { scanForTrendlineBreakout } from "@/lib/trendlineScanner";
import { sendTelegramAlert } from "@/lib/telegram";

// Runs ONCE per day (after market close, or before next open) - configured
// separately in vercel.json from the intraday 3-min scan.

export async function GET(request: Request) {
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
    .limit(100);

  const symbols = universe?.map((u) => u.trading_symbol) ?? [];
  const breakouts: any[] = [];

  for (const symbol of symbols) {
    try {
      const candles = await getDailyCandles(accessToken, symbol, 180);
      const result = scanForTrendlineBreakout(candles);

      if (result?.brokeToday) {
        await supabase.from("trendline_breakouts").insert({
          trading_symbol: symbol,
          close: result.lastClose,
          trendline_value: result.trendlineValue,
          volume_ratio: result.volumeRatio,
          volume_confirmed: result.volumeConfirmed,
        });

        // Dedup: only alert once per symbol per day
        const { data: existing } = await supabase
          .from("trendline_alerts_sent")
          .select("id")
          .eq("trading_symbol", symbol)
          .eq("alert_date", new Date().toISOString().split("T")[0])
          .maybeSingle();

        if (!existing) {
          await sendTelegramAlert(
            `📈 *Trendline Breakout* (Daily)\n` +
              `Symbol: *${symbol}*\n` +
              `Close: ₹${result.lastClose.toFixed(2)}\n` +
              `Trendline: ₹${result.trendlineValue}\n` +
              `Volume: ${result.volumeRatio ?? "-"}x avg` +
              (result.volumeConfirmed ? " ✅ confirmed" : " ⚠️ weak")
          );

          await supabase.from("trendline_alerts_sent").insert({ trading_symbol: symbol });
        }

        breakouts.push({ symbol, ...result });
      }
    } catch (err) {
      console.error(`Error scanning ${symbol} for trendline breakout:`, err);
    }
  }

  return NextResponse.json({ scanned: symbols.length, breakouts: breakouts.length, results: breakouts });
}
