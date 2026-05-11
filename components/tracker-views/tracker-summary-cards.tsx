'use client';

import { AlertTriangle, CheckCircle2, Clock3, ListTodo } from 'lucide-react';
import { PageCard } from '@/components/layout';
import type { TrackerEntriesSummary } from '@/types/domain';

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <PageCard className="flex items-start justify-between p-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </div>
    </PageCard>
  );
}

export function TrackerSummaryCards({ summary }: { summary: TrackerEntriesSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Completion"
        value={`${summary.completion_rate}%`}
        detail={`${summary.done + summary.done_late} of ${summary.total} complete`}
        icon={CheckCircle2}
      />
      <SummaryCard
        label="Open"
        value={summary.not_done}
        detail={`${summary.ongoing} ongoing`}
        icon={ListTodo}
      />
      <SummaryCard
        label="Late done"
        value={summary.done_late}
        detail="Completed after cutoff"
        icon={Clock3}
      />
      <SummaryCard
        label="Overdue"
        value={summary.overdue}
        detail="Still not complete"
        icon={AlertTriangle}
      />
    </div>
  );
}
