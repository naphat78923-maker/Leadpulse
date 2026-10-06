// One-way Telegram delivery for the morning digest. Server only: the bot token never
// reaches the browser. Both values come from the host's environment.

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Sends one HTML-formatted message to the configured chat. Throws when Telegram refuses it. */
export async function sendTelegramMessage(html: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram is not configured');
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
  });
  if (!response.ok) {
    // Telegram's own description only; never echo the request URL, which holds the token.
    const detail = await response.json().then(body => body?.description as string | undefined).catch(() => undefined);
    throw new Error(`Telegram rejected the message (${response.status})${detail ? `: ${detail}` : ''}`);
  }
}
