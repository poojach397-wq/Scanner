import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface ScanRow {
  id: string;
  trading_symbol: string;
  scanned_at: string;
  close: number;
  vwap: number;
  volume_ratio: number;
  momentum_pct: number;
  rsi: number;
  macd_hist: number;
  signal: "BUY_CALL" | "BUY_PUT" | null;
}

function buildTags(r: ScanRow): string[] {
  const tags: string[] = [];
  if (r.momentum_pct > 0) tags.push("Bullish Trend");
  if (r.momentum_pct < 0) tags.push("Bearish Trend");
  if (r.volume_ratio >= 2) tags.push("Volume Breakout");
  if (r.macd_hist > 0) tags.push("MACD Bullish");
  if (r.macd_hist < 0) tags.push("MACD Bearish");
  if (r.close > r.vwap) tags.push("VWAP Support");
  if (r.rsi >= 70) tags.push("RSI Overbought");
  if (r.rsi <= 30) tags.push("RSI Oversold");
  return tags;
}

// Simple composite score 0-100, similar spirit to the reference "85" badge.
// This is a naive weighted sum - not a real predictive score, just a quick-glance ranking.
function compositeScore(r: ScanRow): number {
  let score = 50;
  if (r.volume_ratio >= 2) score += 15;
  if (Math.abs(r.momentum_pct) >= 0.3) score += 15;
  if ((r.macd_hist > 0 && r.momentum_pct > 0) || (r.macd_hist < 0 && r.momentum_pct < 0)) score += 10;
  if (r.rsi > 30 && r.rsi < 70) score += 10; // not extended
  return Math.min(100, score);
}

export default async function Dashboard() {
  const { data: results } = await supabase
    .from("scan_results")
    .select("*")
    .order("scanned_at", { ascending: false })
    .limit(100);

  // Keep only the latest row per symbol
  const latestBySymbol = new Map<string, ScanRow>();
  (results as ScanRow[] | null)?.forEach((r) => {
    if (!latestBySymbol.has(r.trading_symbol)) latestBySymbol.set(r.trading_symbol, r);
  });
  const cards = Array.from(latestBySymbol.values());

  return (
    <main style={{ padding: "1.5rem", fontFamily: "system-ui", background: "#0b0b0c", minHeight: "100vh", color: "#eee" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>F&O Stocks to Watch</h1>
      <p style={{ color: "#888", marginBottom: "1.5rem" }}>Live scan results, refreshed by cron every few minutes</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "1rem",
        }}
      >
        {cards.map((r) => {
          const tags = buildTags(r);
          const score = compositeScore(r);
          const isUp = r.momentum_pct >= 0;

          return (
            <div
              key={r.id}
              style={{
                background: "#151517",
                border: "1px solid #262626",
                borderRadius: "10px",
                padding: "1rem",
                position: "relative",
              }}
            >
              {r.signal && (
                <span
                  style={{
                    position: "absolute",
                    top: "0.75rem",
                    right: "0.75rem",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "0.15rem 0.5rem",
                    borderRadius: "999px",
                    background: r.signal === "BUY_CALL" ? "#0f3d24" : "#3d0f0f",
                    color: r.signal === "BUY_CALL" ? "#4ade80" : "#f87171",
                  }}
                >
                  {r.signal === "BUY_CALL" ? "BREAKOUT ▲" : "BREAKDOWN ▼"}
                </span>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong style={{ fontSize: "1rem" }}>{r.trading_symbol}</strong>
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "#aaa",
                    background: "#222",
                    padding: "0.1rem 0.4rem",
                    borderRadius: "4px",
                  }}
                >
                  NSE
                </span>
              </div>

              <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: "0.4rem" }}>
                ₹{r.close?.toFixed(2)}
              </div>
              <div style={{ color: isUp ? "#4ade80" : "#f87171", fontSize: "0.85rem", marginBottom: "0.6rem" }}>
                {isUp ? "▲" : "▼"} {r.momentum_pct?.toFixed(2)}%
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "0.5rem",
                  fontSize: "0.75rem",
                  color: "#aaa",
                  borderTop: "1px solid #262626",
                  borderBottom: "1px solid #262626",
                  padding: "0.5rem 0",
                  marginBottom: "0.6rem",
                }}
              >
                <div>
                  <div style={{ color: "#666" }}>VOL</div>
                  <div style={{ color: "#eee" }}>{r.volume_ratio?.toFixed(1)}x</div>
                </div>
                <div>
                  <div style={{ color: "#666" }}>RSI</div>
                  <div style={{ color: r.rsi >= 70 || r.rsi <= 30 ? "#f59e0b" : "#eee" }}>
                    {r.rsi?.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#666" }}>MACD</div>
                  <div style={{ color: r.macd_hist > 0 ? "#4ade80" : "#f87171" }}>
                    {r.macd_hist > 0 ? "Bull" : "Bear"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.6rem" }}>
                {tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: "0.65rem",
                      background: "#1f2937",
                      color: "#93c5fd",
                      padding: "0.15rem 0.45rem",
                      borderRadius: "999px",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>

              <div style={{ fontSize: "0.7rem", color: "#666" }}>
                Score {score} · {new Date(r.scanned_at).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
      </div>

      {cards.length === 0 && (
        <p style={{ color: "#666", marginTop: "2rem" }}>
          No scan results yet - trigger a scan or wait for the next cron run.
        </p>
      )}
    </main>
  );
}
