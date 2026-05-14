'use client';

import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { format } from 'date-fns';
import { CalendarClock, Paperclip } from 'lucide-react';
import { StatusChip } from '@/components/tracker-views/tracker-chips';
import { groupTrackerRows, isEntryOverdue } from '@/lib/tracker-view';
import type { FrequencyConfig, KpiCardSpec } from '@/lib/tracker-frequency-config';
import type { TrackerEntriesPayload } from '@/types/domain';

interface TrackerAnnualListProps {
  data: TrackerEntriesPayload;
  config: FrequencyConfig;
  activeCard: KpiCardSpec | undefined;
  now: Date;
  onSelectEntry: (entryId: string) => void;
}

/**
 * Strategic list layout for ANNUAL trackers. One period per year makes a grid
 * pointless — each task item is a single checklist row instead, sharing the
 * same chips, drawer, and KPI strip as the grid layouts.
 */
export function TrackerAnnualList({
  data,
  config,
  activeCard,
  now,
  onSelectEntry,
}: TrackerAnnualListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const all = groupTrackerRows(data.sections, data.task_lists, data.tasks, data.entries);
    const predicate = activeCard?.entryFilter;
    if (!predicate) return all;
    return all.filter((row) => row.entries.some((e) => predicate(e, now)));
  }, [data, activeCard, now]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => config.rowHeight,
    overscan: 8,
  });

  return (
    <div
      ref={scrollRef}
      className="overflow-auto rounded-md border bg-background"
      style={{ maxHeight: 'calc(100vh - 340px)' }}
    >
      {rows.length === 0 && (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No entries match the selected filter.
        </div>
      )}

      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((vr) => {
          const row = rows[vr.index];
          const entry = row.entries[0] ?? null;
          const overdue = entry ? isEntryOverdue(entry, now) : false;
          const isZebra = vr.index % 2 === 1;

          return (
            <div
              key={row.id}
              className={`absolute inset-x-0 border-b ${isZebra ? 'bg-muted/20' : ''} ${
                overdue ? 'bg-red-50 dark:bg-red-950/20' : ''
              }`}
              style={{ top: vr.start, height: vr.size }}
            >
              {entry ? (
                <button
                  type="button"
                  onClick={() => onSelectEntry(entry.id)}
                  className="flex h-full w-full items-center gap-4 px-4 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-snug">
                      {row.taskList.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.section?.name ?? '—'} ·{' '}
                      {row.taskList.assignee?.name ??
                        row.taskList.assignee?.email ??
                        'Unassigned'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    {(entry.attachments_count ?? 0) > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Paperclip className="h-3 w-3" />
                        {entry.attachments_count}
                      </span>
                    )}
                    {row.subtasks.length > 0 && (
                      <span>
                        {entry.subtask_completions.length}/{row.subtasks.length}
                      </span>
                    )}
                    <span className="flex items-center gap-1 tabular-nums">
                      <CalendarClock className="h-3 w-3" />
                      {format(new Date(`${entry.due_date}T00:00:00`), 'MMM d, yyyy')}
                    </span>
                  </div>

                  <StatusChip status={entry.status} />
                </button>
              ) : (
                <div className="flex h-full items-center gap-4 px-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-snug text-muted-foreground">
                      {row.taskList.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.section?.name ?? '—'}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground/40">No entry</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
