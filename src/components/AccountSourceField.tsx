'use client';

import { useState } from 'react';
import type { Company } from '@/types/crm';
import { ACQUISITION_SOURCE_OPTIONS, normalizeAcquisition } from '@/utils/acquisition-source';

type SourcePatch = ReturnType<typeof normalizeAcquisition>;

/**
 * The account's acquisition source, editable in place from a deal. It saves to the
 * company — every deal with that account shares one source.
 */
export default function AccountSourceField({ company, onSave }: {
  company: Pick<Company, 'id' | 'name' | 'acquisition_source' | 'acquisition_campaign'>;
  onSave: (patch: SourcePatch) => Promise<void> | void;
}) {
  const [source, setSource] = useState<string>(company.acquisition_source ?? '');
  const [campaign, setCampaign] = useState<string>(company.acquisition_campaign ?? '');

  const save = (next: { source: string; campaign: string }) => {
    const patch = normalizeAcquisition({ acquisition_source: next.source, acquisition_campaign: next.campaign });
    if (patch.acquisition_source === (company.acquisition_source ?? null) && patch.acquisition_campaign === (company.acquisition_campaign ?? null)) return;
    void onSave(patch);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-clay-muted">Source</span>
      <select
        aria-label="Account source"
        value={source}
        onChange={event => {
          setSource(event.target.value);
          save({ source: event.target.value, campaign });
        }}
        className="h-8 rounded-lg border border-clay-hairline bg-white px-2 text-base text-clay-ink dark:bg-clay-card md:text-sm"
      >
        <option value="">Not set</option>
        {ACQUISITION_SOURCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {source && (
        <input
          aria-label="Campaign or ad"
          placeholder="Campaign or ad"
          value={campaign}
          onChange={event => setCampaign(event.target.value)}
          onBlur={() => save({ source, campaign })}
          className="h-8 min-w-0 flex-1 rounded-lg border border-clay-hairline bg-white px-2 text-base text-clay-ink dark:bg-clay-card md:text-sm"
        />
      )}
    </div>
  );
}
