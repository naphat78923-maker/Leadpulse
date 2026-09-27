'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Which record's detail panel is open, seeded from `?<param>=<id>` so links like
 * `/deals?deal=<id>` land with that record open. Once the user picks or closes a
 * record, their choice wins over the URL.
 *
 * Uses useSearchParams, so the calling page must render under a <Suspense> boundary.
 */
export function useQuerySelection(param: string): [string | null, (id: string | null) => void] {
  const requested = useSearchParams().get(param);
  const [chosen, setChosen] = useState<{ id: string | null } | null>(null);
  return [chosen ? chosen.id : requested, (id) => setChosen({ id })];
}
