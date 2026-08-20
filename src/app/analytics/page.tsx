'use client';

import { useMemo } from 'react';
import { useCrm } from '@/components/CrmProvider';
import { Deal, DealStage, STAGE_LABELS, STAGE_ORDER } from '@/types/crm';
import { BarChart3, TrendingUp, Target, Clock, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import MascotSprite from '@/components/MascotSprite';

// Probability each stage contributes to a weighted forecast.
const STAGE_PROB: Record<DealStage, number> = {
  research: 0.1,
  contacted: 0.25,
  proposal: 0.5,
  negotiation: 0.75,
  closed_won: 1,
  closed_lost: 0,
};

const ACTIVE_STAGES: DealStage[] = ['research', 'contacted', 'proposal', 'negotiation'];

const fmtBaht = (n: number) =>
  '฿' + Math.round(n).toLocaleString('en-US');

export default function AnalyticsPage() {
  const { deals: dbDeals, companies: dbCompanies, loading } = useCrm();
  const deals = dbDeals as Deal[];
  const companies = dbCompanies;

  const metrics = useMemo(() => {
    const active = deals.filter(d => ACTIVE_STAGES.includes(d.stage));
    const won = deals.filter(d => d.stage === 'closed_won');
    const lost = deals.filter(d => d.stage === 'closed_lost');

    const sumVal = (arr: Deal[]) =>
      arr.reduce((s, d) => s + (d.value || 0), 0);

    const activeValue = sumVal(active);
    const weighted =
      sumVal(active.map(d => ({ ...d, value: (d.value || 0) * STAGE_PROB[d.stage] })) as Deal[]) +
      sumVal(won);

    const winRate = won.length + lost.length > 0
      ? (won.length / (won.length + lost.length)) * 100
      : 0;

    const now = Date.now();
    const avgAge = active.length > 0
      ? active.reduce((s, d) => s + (now - new Date(d.created_at).getTime()), 0) / active.length / 86400000
      : 0;

    // Funnel: active journey + won, with step conversion.
    const funnelStages: DealStage[] = [...ACTIVE_STAGES, 'closed_won'];
    const funnel = funnelStages.map(stage => ({
      stage,
      count: deals.filter(d => d.stage === stage).length,
    }));
    const funnelTop = funnel[0]?.count || 0;

    // Source performance — join deal → company.lead_source.
    const sourceById = new Map(companies.map(c => [c.id, c.lead_source || 'Unknown']));
    const bySource = new Map<string, { total: number; won: number }>();
    deals.forEach(d => {
      if (d.stage === 'closed_lost') return; // losses don't count toward a source's track record
      const src = d.company_id ? (sourceById.get(d.company_id) ?? 'No company') : 'No company';
      const cur = bySource.get(src) || { total: 0, won: 0 };
      cur.total += 1;
      if (d.stage === 'closed_won') cur.won += 1;
      bySource.set(src, cur);
    });
    const sourceRows = [...bySource.entries()]
      .map(([source, v]) => ({ source, ...v, rate: v.total > 0 ? (v.won / v.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);

    // Product mix — value + count across open + won.
    const byProduct = new Map<string, { value: number; count: number }>();
    [...active, ...won].forEach(d => {
      const cur = byProduct.get(d.product) || { value: 0, count: 0 };
      cur.value += d.value || 0;
      cur.count += 1;
      byProduct.set(d.product, cur);
    });
    const productRows = [...byProduct.entries()]
      .map(([product, v]) => ({ product, ...v }))
      .sort((a, b) => b.value - a.value);

    // Creation trend — last 8 weeks.
    const weeks: { label: string; count: number }[] = [];
    const wkStart = new Date();
    wkStart.setHours(0, 0, 0, 0);
    wkStart.setDate(wkStart.getDate() - wkStart.getDay() - 7 * 7); // 8 weeks ago, week starting Sunday
    for (let i = 0; i < 8; i++) {
      const start = new Date(wkStart);
      start.setDate(wkStart.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const count = deals.filter(d => {
        const t = new Date(d.created_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).length;
      weeks.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, count });
    }

    const maxFunnel = Math.max(1, ...funnel.map(f => f.count));
    const maxSource = Math.max(1, ...sourceRows.map(s => s.total));
    const maxProduct = Math.max(1, ...productRows.map(p => p.value));
    const maxWeek = Math.max(1, ...weeks.map(w => w.count));

    return {
      activeCount: active.length,
      wonCount: won.length,
      lostCount: lost.length,
      activeValue,
      weighted,
      winRate,
      avgAge,
      funnel,
      funnelTop,
      sourceRows,
      productRows,
      weeks,
      maxFunnel,
      maxSource,
      maxProduct,
      maxWeek,
    };
  }, [deals, companies]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-clay-ink animate-spin mx-auto mb-3" />
          <p className="text-sm text-clay-muted">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 h-full overflow-y-auto">
      <div className="mb-5 md:mb-6 flex items-center gap-3">
        <MascotSprite src="/assets/mascots/mascot-followup.png" size={44} alt="Analytics reviewer mascot" />
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-clay-lavender" /> Analytics
          </h1>
          <p className="text-sm text-clay-muted mt-0.5">Pipeline health &amp; where deals come from</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi
        icon={<Target className="w-4 h-4" />}
        label="Active Pipeline"
        value={fmtBaht(metrics.activeValue)}
          sub={`${metrics.activeCount} open deals`}
          tone="lavender"
        />
        <Kpi
          icon={<TrendingUp className="w-4 h-4" />}
          label="Weighted Forecast"
          value={fmtBaht(metrics.weighted)}
          sub="prob. × value"
          tone="mint"
        />
        <Kpi
          icon={<BarChart3 className="w-4 h-4" />}
          label="Win Rate"
          value={`${metrics.winRate.toFixed(0)}%`}
          sub={`${metrics.wonCount}W / ${metrics.lostCount}L`}
          tone="ochre"
        />
        <Kpi
          icon={<Clock className="w-4 h-4" />}
          label="Avg Deal Age"
          value={`${metrics.avgAge.toFixed(0)}d`}
          sub="open deals"
          tone="peach"
        />
      </div>

      {/* Funnel */}
      <Section title="Pipeline Funnel" subtitle={`${metrics.funnelTop} entered · ${metrics.lostCount} lost`}>
        <div className="space-y-2.5">
          {metrics.funnel.map((f, i) => {
            const conv = i === 0 ? 100 : metrics.funnel[i - 1].count > 0
              ? (f.count / metrics.funnel[i - 1].count) * 100 : 0;
            return (
              <div key={f.stage}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-clay-ink">{STAGE_LABELS[f.stage]}</span>
                  <span className="text-clay-muted">{f.count}</span>
                </div>
                <div className="h-2.5 rounded-full bg-clay-surface overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full', f.stage === 'closed_won' ? 'bg-clay-mint' : 'bg-clay-lavender')}
                    style={{ width: `${(f.count / metrics.maxFunnel) * 100}%` }}
                  />
                </div>
                {i > 0 && (
                  <p className="text-[10px] text-clay-muted-soft mt-0.5">
                    {conv.toFixed(0)}% from previous
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Source performance */}
      <Section title="Source Performance" subtitle="Win rate by lead source">
        {metrics.sourceRows.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-3">
            {metrics.sourceRows.map(s => (
              <div key={s.source}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-clay-ink truncate pr-2">{s.source}</span>
                  <span className="text-clay-muted shrink-0">{s.won}/{s.total} · {s.rate.toFixed(0)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-clay-surface overflow-hidden">
                  <div
                    className="h-full rounded-full bg-clay-ochre"
                    style={{ width: `${(s.total / metrics.maxSource) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Product mix */}
      <Section title="Product Mix" subtitle="Value across open + won deals">
        {metrics.productRows.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {metrics.productRows.map(p => (
              <div key={p.product} className="bg-clay-surface rounded-lg p-3 border border-clay-hairline">
                <p className="text-xs font-medium text-clay-ink truncate">{p.product}</p>
                <p className="text-lg font-semibold text-clay-teal mt-1">{fmtBaht(p.value)}</p>
                <div className="h-1.5 rounded-full bg-clay-card mt-2 overflow-hidden">
                  <div className="h-full rounded-full bg-clay-mint" style={{ width: `${(p.value / metrics.maxProduct) * 100}%` }} />
                </div>
                <p className="text-[10px] text-clay-muted-soft mt-1">{p.count} deal{p.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Creation trend */}
      <Section title="Deals Created" subtitle="Last 8 weeks">
        <div className="flex items-end gap-1.5 h-28">
          {metrics.weeks.map(w => (
            <div key={w.label} className="flex-1 flex flex-col items-center justify-end h-full">
              <span className="text-[10px] text-clay-muted mb-1">{w.count}</span>
              <div
                className="w-full rounded-t bg-clay-lavender/70"
                style={{ height: `${(w.count / metrics.maxWeek) * 100}%`, minHeight: w.count > 0 ? 4 : 2 }}
              />
              <span className="text-[9px] text-clay-muted-soft mt-1 rotate-0">{w.label}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: 'lavender' | 'mint' | 'ochre' | 'peach';
}) {
  const tones: Record<string, string> = {
    lavender: 'text-clay-lavender',
    mint: 'text-clay-mint',
    ochre: 'text-clay-ochre',
    peach: 'text-clay-peach',
  };
  return (
    <div className="bg-clay-card border border-clay-hairline rounded-xl p-4 clay-card">
      <div className={clsx('flex items-center gap-1.5 mb-2', tones[tone])}>{icon}<span className="text-xs font-medium">{label}</span></div>
      <p className="text-xl font-bold text-clay-ink tracking-tight">{value}</p>
      <p className="text-[11px] text-clay-muted-soft mt-0.5">{sub}</p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-clay-card border border-clay-hairline rounded-xl p-4 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-clay-ink">{title}</h2>
        {subtitle && <span className="text-[11px] text-clay-muted-soft">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-clay-muted-soft text-center py-4">No data yet.</p>;
}
