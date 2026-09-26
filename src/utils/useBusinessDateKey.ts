'use client';

import { useEffect, useState } from 'react';
import {
  businessDateKey,
  millisecondsUntilNextBusinessMidnight,
} from './business-time';

interface DateSnapshot {
  businessDay: string;
  revision: number;
}

function millisecondsUntilNextUtcMidnight(now: Date): number {
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, nextMidnight - now.getTime());
}

/** Keep queue dates current across Bangkok and UTC rollovers while the page stays open. */
export function useBusinessDateKey(): string {
  const [snapshot, setSnapshot] = useState<DateSnapshot>(() => ({
    businessDay: businessDateKey(),
    revision: 0,
  }));

  useEffect(() => {
    let timer: number | undefined;

    const refreshAndSchedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      const now = new Date();
      setSnapshot((previous) => ({
        businessDay: businessDateKey(now),
        revision: previous.revision + 1,
      }));

      const delay = Math.min(
        millisecondsUntilNextBusinessMidnight(now),
        millisecondsUntilNextUtcMidnight(now),
      );
      timer = window.setTimeout(refreshAndSchedule, delay + 25);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshAndSchedule();
    };

    refreshAndSchedule();
    window.addEventListener('focus', refreshAndSchedule);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('focus', refreshAndSchedule);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  return snapshot.businessDay;
}
