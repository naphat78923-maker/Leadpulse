'use client';

// ─── Lab: LeadPulse's small animations, playable ───
// Not in the nav. Each animation in the app, with a control to replay it, so motion can
// be reviewed without waiting for the real state (a reply being graded, a save landing).

import { useState } from 'react';
import LayaSpark, { type SparkState } from '@/components/LayaSpark';
import ActionButton from '@/components/ActionButton';
import AnimatedCount from '@/components/AnimatedCount';

const SPARK_STATES: SparkState[] = ['idle', 'working', 'ok', 'alert'];

function Demo({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-clay-hairline bg-white p-4 dark:bg-clay-card">
      <h2 className="text-sm font-semibold text-clay-ink">{title}</h2>
      <p className="mb-3 text-xs text-clay-muted">{note}</p>
      <div className="flex flex-wrap items-center gap-3 text-sm text-clay-body">{children}</div>
    </section>
  );
}

const chip = 'h-8 rounded-lg border border-clay-hairline px-3 text-xs text-clay-ink hover:border-clay-ink/30 aria-pressed:bg-clay-lavender/20';

export default function MotionLab() {
  const [spark, setSpark] = useState<SparkState>('idle');
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(12);
  const [replay, setReplay] = useState(0);

  const runButton = () => {
    setBusy(true);
    setTimeout(() => setBusy(false), 1200);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4" data-testid="motion-lab">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-wide text-clay-muted">Lab</p>
        <h1 className="text-xl font-semibold text-clay-ink">Motion</h1>
        <p className="text-sm text-clay-muted">Every small animation in LeadPulse. With reduced motion on, none of them move.</p>
      </header>

      <Demo title="Laya's spark" note="Breathes while work is waiting. Go from working to ok to see it morph into a tick and back.">
        <span className="inline-flex items-center gap-2 text-base">
          <LayaSpark state={spark} className="!h-6 !w-6" /> Laya
        </span>
        {SPARK_STATES.map(state => (
          <button key={state} type="button" aria-pressed={spark === state} className={chip} onClick={() => setSpark(state)}>{state}</button>
        ))}
      </Demo>

      <Demo title="A button that shows its work" note="Label, then a wave of dots while saving, then a tick that draws itself.">
        <ActionButton busy={busy} onClick={runButton}>Save reply</ActionButton>
        <ActionButton variant="quiet" busy={busy} onClick={runButton}>Disagree: keep B</ActionButton>
      </Demo>

      <Demo title="A count that pops when it changes" note="Filter counts and the Do next total.">
        <span className="text-base">Overdue <AnimatedCount value={count} className="font-semibold text-clay-error" /></span>
        <button type="button" className={chip} onClick={() => setCount(n => n + 1)}>+1</button>
        <button type="button" className={chip} onClick={() => setCount(n => Math.max(0, n - 1))}>−1</button>
      </Demo>

      <Demo title="Waiting on you" note="The dot of the buyer's newest reply pings while the next move is yours.">
        <span className="lp-ping relative flex h-6 w-6 items-center justify-center rounded-full bg-clay-teal/15 text-clay-teal">↙</span>
        <span>They replied · DM</span>
      </Demo>

      <Demo title="Rows and arrows" note="List rows rise in one after another; a trend arrow nudges once in its direction.">
        <button type="button" className={chip} onClick={() => setReplay(n => n + 1)}>Replay</button>
        <ol key={replay} className="w-full divide-y divide-clay-hairline">
          {['After You Dessert Cafe', 'MOO YOO Baker’s Gallery', 'Thai bakery'].map((name, index) => (
            <li key={name} className="lp-rise flex justify-between py-2" style={{ animationDelay: `${index * 35}ms` }}>
              <span>{name}</span>
              <span className={index === 1 ? 'text-clay-error' : 'text-clay-success'}>
                <span className={index === 1 ? 'lp-nudge-down' : 'lp-nudge-up'}>{index === 1 ? '↓' : '↑'}</span> {index === 1 ? 'cooler' : 'warmer'}
              </span>
            </li>
          ))}
        </ol>
      </Demo>
    </div>
  );
}
