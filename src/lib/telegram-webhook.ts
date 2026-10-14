// LeadPulse registers its own Telegram webhook, so no token or secret passes through a person.
// The webhook secret is derived from CRON_SECRET (or TELEGRAM_WEBHOOK_SECRET when set), and the
// scheduled runs call ensureTelegramWebhook() before sending proposals with buttons.

import { createHmac } from 'node:crypto';
import { getTelegramBot, getTelegramWebhook, setTelegramWebhook, type WebhookInfo } from '@/lib/telegram';

export const WEBHOOK_PATH = '/api/telegram/webhook';

/**
 * Bots that Hermes polls (bot ids from the update-receipt files under ~/.hermes, 2026-10-14).
 * A webhook on one of them would stop Hermes receiving messages, so LeadPulse never sets one.
 * Bot ids are public (getMe); tokens never appear here.
 */
export const HERMES_BOT_IDS = new Set([8712271672, 8770101806, 8775353223, 8856313956, 8878723757, 8977923028]);

/** The secret Telegram sends back in X-Telegram-Bot-Api-Secret-Token; null when none can be made. */
export function webhookSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (explicit) return explicit;
  const cron = env.CRON_SECRET?.trim();
  if (!cron) return null;
  return createHmac('sha256', cron).update('leadpulse-telegram-webhook-v1').digest('hex');
}

export interface TelegramWebhookOps {
  bot: () => Promise<{ id: number; username?: string }>;
  info: () => Promise<WebhookInfo>;
  set: (url: string, secret: string) => Promise<void>;
}

const liveOps: TelegramWebhookOps = { bot: getTelegramBot, info: getTelegramWebhook, set: setTelegramWebhook };

export type WebhookState =
  | { status: 'ok' | 'registered'; url: string; bot: string }
  | { status: 'refused' | 'skipped'; reason: string };

/**
 * Point the bot's button presses at this deployment. Refuses a Hermes bot and never replaces a
 * webhook that belongs to something else; replaces only LeadPulse's own route on another origin.
 */
export async function ensureTelegramWebhook(origin: string, ops: TelegramWebhookOps = liveOps,
  env: NodeJS.ProcessEnv = process.env): Promise<WebhookState> {
  const secret = webhookSecret(env);
  if (!secret) return { status: 'skipped', reason: 'no CRON_SECRET to derive a webhook secret from' };
  if (!origin.startsWith('https://')) return { status: 'skipped', reason: 'Telegram only calls https addresses' };
  const me = await ops.bot();
  const bot = me.username ? `@${me.username}` : String(me.id);
  if (HERMES_BOT_IDS.has(me.id)) {
    return { status: 'refused', reason: `TELEGRAM_BOT_TOKEN is a Hermes bot (${bot}); a webhook would stop Hermes. Use the LeadPulse bot.` };
  }
  const url = `${origin.replace(/\/$/, '')}${WEBHOOK_PATH}`;
  const current = await ops.info();
  if (current.url === url) return { status: 'ok', url, bot };
  if (current.url && !current.url.endsWith(WEBHOOK_PATH)) {
    return { status: 'refused', reason: `${bot} already sends updates to another service` };
  }
  await ops.set(url, secret);
  return { status: 'registered', url, bot };
}
