import { NextRequest } from 'next/server';
import { loadAfternoonNudge } from '@/lib/digest-data';
import { runTelegramCron } from '@/lib/telegram-cron';

// The afternoon nudge, weekdays 16:00 Bangkok: follow-ups due today still open and buyers
// still waiting on a reply. See lib/telegram-cron.ts for auth and ?dry=1.
export async function GET(request: NextRequest) {
  return runTelegramCron(request, loadAfternoonNudge);
}
