// Sends alert messages to your Telegram via a bot.
// Setup: message @BotFather on Telegram -> /newbot -> get TELEGRAM_BOT_TOKEN.
// Then message your new bot once, and use https://api.telegram.org/bot<TOKEN>/getUpdates
// to find your chat_id.

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

export async function sendTelegramAlert(message: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    }),
  });

  if (!res.ok) {
    console.error("Telegram send failed:", await res.text());
  }
}
