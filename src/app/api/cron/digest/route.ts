import { NextRequest } from 'next/server';
import { loadDailyDigest } from '@/lib/digest-data';
import { runTelegramCron } from '@/lib/telegram-cron';

// The morning digest, weekdays 08:00 Bangkok. See lib/telegram-cron.ts for auth and ?dry=1.
export async function GET(request: NextRequest) {
  return runTelegramCron(request, loadDailyDigest);
}
