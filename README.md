# F&O Scanner - v1

Intraday F&O scanner: volume + momentum + VWAP signals, cron-based scanning
during market hours, Telegram alerts. Deployed on Vercel, data in Supabase.
Groww credentials entered directly in the app's `/settings` page - no Python,
no manual daily token copy-paste. The app generates a fresh Groww access
token itself via the TOTP flow on every cron run.

**Status: scaffold only.** Groww response shapes assumed from public docs -
worth confirming once real data starts flowing, via the "Test Groww
Connection" button on `/settings`.

## What's NOT built yet (by design, per current scope)
- Options strike suggestion (needs Groww's option chain endpoint - phase 2, code scaffolded in lib/optionChainAnalysis.ts but not wired in)
- Twitter/sentiment scanning (phase 2)
- Chart display in the dashboard (add TradingView widget once basics work)
- Auto order placement (intentionally excluded - suggest-only, per your call)

## What's included, phase-by-phase
- **Settings page** (`/settings`): enter your Groww TOTP API Key, TOTP Secret,
  and capital amount. Saved to Supabase. Includes a "Test Connection" button.
- **Intraday scanner** (`/api/cron/scan`, every 3 min during market hours): volume spike +
  momentum + VWAP + RSI/MACD confirmation. Card-grid dashboard on `/`.
- **Daily trendline breakout scanner** (`/api/cron/trendline-scan`, once daily after close):
  fits a descending trendline through recent swing highs on the daily chart, flags a
  breakout when price closes above it (the BDL-style setup). Completely separate cron,
  separate Supabase tables (`trendline_breakouts`, `trendline_alerts_sent`), separate
  Telegram alert. Logic lives in `lib/trendlineScanner.ts`.

## Setup steps

1. **Supabase**
   - Create a project at supabase.com
   - Go to SQL Editor, paste and run `supabase/schema.sql`
   - Copy your Project URL and `service_role` key (Settings -> API)
   - Manually insert your 5 test symbols into `fno_universe` table, e.g.:
     ```sql
     insert into fno_universe (trading_symbol) values
       ('RELIANCE'), ('HDFCBANK'), ('TCS'), ('INFY'), ('SBIN');
     ```
   - **Credentials (Groww key + capital) are NOT entered via SQL** - see step 4.

2. **Telegram bot**
   - Message `@BotFather` on Telegram -> `/newbot` -> follow prompts -> copy the token
   - Message your new bot once (anything, e.g. "hi")
   - Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser,
     find `"chat":{"id":...}` in the response - that's your `TELEGRAM_CHAT_ID`

3. **Environment variables**
   - Copy `.env.example` to `.env.local` and fill in Supabase + Telegram + CRON_SECRET
   - Groww credentials do NOT go in env vars - entered via the app itself (step 4)

4. **Deploy to Vercel**
   - Push this folder to a GitHub repo
   - Import the repo in Vercel (vercel.com -> New Project)
   - Add the env vars from step 3 in Vercel's project settings
   - Deploy

5. **Enter your Groww credentials in the app**
   - Visit `https://your-app.vercel.app/settings`
   - On Groww's API key dashboard (groww.in/trade-api/api-keys), use the key with
     the TOTP tag - copy its TOTP API Key and TOTP Secret (shown only once when
     you first generate the key - if you've lost the secret, generate a new key)
   - Paste both into the settings form, enter your capital, save
   - Click "Test Groww Connection" to confirm the TOTP flow can generate a fresh
     access token - this is what the cron will do automatically going forward,
     no daily manual login needed

6. **Test the scan**
   - Manually hit `https://your-app.vercel.app/api/cron/scan` with the
     `Authorization: Bearer <CRON_SECRET>` header to trigger one scan by hand
     and confirm it works before relying on the cron schedule
   - Visit `/` to see the card-grid dashboard populate

## Notes on scope
- Cron currently capped to your 5 test symbols via `fno_universe` table -
  add more rows (up to 100) once this is validated
- Cron schedule in `vercel.json` runs every 3 min, roughly 9:15-15:30 IST
  (converted to UTC) - adjust if needed
- All logic in `lib/signals.ts` mirrors the Python backtest script exactly,
  so whatever thresholds you land on there should be copied here too
