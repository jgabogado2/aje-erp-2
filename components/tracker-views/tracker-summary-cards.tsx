'use client';

import { AlertTriangle, CheckCircle2, Clock3, ListTodo } from 'lucide-react';
import type { TrackerEntriesSummary } from '@/types/domain';

type FilterKey = string | null;

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  filterKey,
  activeFilter,
  onFilter,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  filterKey: FilterKey;
  activeFilter: FilterKey;
  onFilter: (key: FilterKey) => void;
}) {
  const isActive = filterKey !== null && activeFilter === filterKey;
  return (
    <button
      type="button"
      onClick={() => onFilter(filterKey)}
      className={`flex w-full items-start justify-between rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 ${
        isActive
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'bg-card shadow-sm'
      }`}
    >
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
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

export function TrackerSummaryCards({
  summary,
  activeFilter = null,
  onFilter,
}: {
  summary: TrackerEntriesSummary;
  activeFilter?: FilterKey;
  onFilter?: (key: FilterKey) => void;
}) {
  const handle = (key: FilterKey) => onFilter?.(key);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Completion"
        value={`${summary.completion_rate}%`}
        detail={`${summary.done + summary.done_late} of ${summary.total} complete`}
        icon={CheckCircle2}
        filterKey={null}
        activeFilter={activeFilter}
        onFilter={handle}
      />
      <SummaryCard
        label="Open"
        value={summary.not_done}
        detail={`${summary.ongoing} ongoing`}
        icon={ListTodo}
        filterKey="NOT_DONE"
        activeFilter={activeFilter}
        onFilter={handle}
      />
      <SummaryCard
        label="Late done"
        value={summary.done_late}
        detail="Completed after cutoff"
        icon={Clock3}
        filterKey="DONE_LATE"
        activeFilter={activeFilter}
        onFilter={handle}
      />
      <SummaryCard
        label="Overdue"
        value={summary.overdue}
        detail="Still not complete"
        icon={AlertTriangle}
        filterKey="overdue"
        activeFilter={activeFilter}
        onFilter={handle}
      />
    </div>
  );
}
