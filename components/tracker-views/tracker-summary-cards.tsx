'use client';

import type { KpiCardSpec, KpiContext } from '@/lib/tracker-frequency-config';

type FilterKey = string | null;

function SummaryCard({
  spec,
  ctx,
  activeFilter,
  onFilter,
}: {
  spec: KpiCardSpec;
  ctx: KpiContext;
  activeFilter: FilterKey;
  onFilter: (key: FilterKey) => void;
}) {
  const { value, detail } = spec.compute(ctx);
  const isActive = spec.key !== 'all' && activeFilter === spec.key;
  const Icon = spec.icon;

  return (
    <button
      type="button"
      onClick={() => onFilter(spec.key === 'all' ? null : spec.key)}
      className={`flex w-full items-start justify-between rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 ${
        isActive ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card shadow-sm'
      }`}
    >
      <div>
        <p className="text-xs font-medium text-muted-foreground">{spec.label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <div
        className={`rounded-md p-2 ${
          isActive ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
    </button>
  );
}

/**
 * KPI strip — renders the per-frequency card set from FrequencyConfig. Each
 * card doubles as a row filter; the `'all'` card clears the active filter.
 */
export function TrackerSummaryCards({
  cards,
  ctx,
  activeFilter = null,
  onFilter,
}: {
  cards: KpiCardSpec[];
  ctx: KpiContext;
  activeFilter?: FilterKey;
  onFilter?: (key: FilterKey) => void;
}) {
  const handle = (key: FilterKey) => onFilter?.(key);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((spec) => (
        <SummaryCard
          key={spec.key}
          spec={spec}
          ctx={ctx}
          activeFilter={activeFilter}
          onFilter={handle}
        />
      ))}
    </div>
  );
}
