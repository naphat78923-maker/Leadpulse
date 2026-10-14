// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/telegram', () => ({ getTelegramBot: vi.fn(), getTelegramWebhook: vi.fn(), setTelegramWebhook: vi.fn() }));
const { ensureTelegramWebhook, webhookSecret } = await import('./telegram-webhook');

const env = { CRON_SECRET: 'cron-fixture' } as unknown as NodeJS.ProcessEnv;
const ORIGIN = 'https://leadpulse.example';
const ops = (id: number, url = '') => ({
  bot: vi.fn(async () => ({ id, username: 'leadpulse_alerts_bot' })),
  info: vi.fn(async () => ({ url })),
  set: vi.fn(async () => undefined),
});

describe('webhookSecret', () => {
  it('derives a stable secret from CRON_SECRET that Telegram accepts', () => {
    const secret = webhookSecret(env)!;
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(webhookSecret(env)).toBe(secret);
    expect(secret).not.toContain('cron-fixture');
  });

  it('uses TELEGRAM_WEBHOOK_SECRET when set, and nothing without either', () => {
    expect(webhookSecret({ ...env, TELEGRAM_WEBHOOK_SECRET: 'explicit' })).toBe('explicit');
    expect(webhookSecret({} as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe('ensureTelegramWebhook', () => {
  it('registers this deployment when the bot has no webhook', async () => {
    const o = ops(8000000001);
    expect(await ensureTelegramWebhook(ORIGIN, o, env)).toEqual({ status: 'registered', url: `${ORIGIN}/api/telegram/webhook`, bot: '@leadpulse_alerts_bot' });
    expect(o.set).toHaveBeenCalledWith(`${ORIGIN}/api/telegram/webhook`, webhookSecret(env));
  });

  it('never touches a Hermes bot', async () => {
    const o = ops(8856313956);
    const state = await ensureTelegramWebhook(ORIGIN, o, env);
    expect(state.status).toBe('refused');
    expect(o.info).not.toHaveBeenCalled();
    expect(o.set).not.toHaveBeenCalled();
  });

  it('leaves a correct webhook alone and never replaces another service’s', async () => {
    const same = ops(8000000001, `${ORIGIN}/api/telegram/webhook`);
    expect((await ensureTelegramWebhook(ORIGIN, same, env)).status).toBe('ok');
    expect(same.set).not.toHaveBeenCalled();
    const other = ops(8000000001, 'https://someone-else.example/hook');
    expect((await ensureTelegramWebhook(ORIGIN, other, env)).status).toBe('refused');
    expect(other.set).not.toHaveBeenCalled();
  });

  it('moves its own route from an older deployment address', async () => {
    const moved = ops(8000000001, 'https://old-deploy.vercel.app/api/telegram/webhook');
    expect((await ensureTelegramWebhook(ORIGIN, moved, env)).status).toBe('registered');
  });

  it('skips plain http (local development) and a missing secret', async () => {
    expect((await ensureTelegramWebhook('http://localhost:3000', ops(1), env)).status).toBe('skipped');
    expect((await ensureTelegramWebhook(ORIGIN, ops(1), {} as NodeJS.ProcessEnv)).status).toBe('skipped');
  });
});
