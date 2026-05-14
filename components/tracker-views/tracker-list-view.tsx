'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackerEntrySheet } from '@/components/tracker-views/tracker-entry-sheet';
import { TrackerSummaryCards } from '@/components/tracker-views/tracker-summary-cards';
import {
  TrackerViewToolbar,
  type TrackerViewFilters,
} from '@/components/tracker-views/tracker-view-toolbar';
import { ApiError } from '@/lib/api-client';
import {
  buildPeriodColumns,
  formatPeriodHeader,
  groupTrackerRows,
  isEntryOverdue,
  statusTone,
  birStatusTone,
} from '@/lib/tracker-view';
import { useTrackerEntries, useUpdateTrackerEntry } from '@/hooks/use-tracker-entries';
import type { BirStatus, TaskStatus } from '@/lib/tracker.types';

type EntryFilter = 'NOT_DONE' | 'DONE_LATE' | 'overdue' | null;

const ROW_HEIGHT = 72;
const COL_WIDTH_FIRST = 256;
const COL_WIDTH = 136;

const STATUS_SHORT: Record<TaskStatus, string> = {
  DONE: 'Done',
  DONE_LATE: 'Late',
  ONGOING: 'Ongoing',
  NOT_DONE: 'Open',
};

const BIR_SHORT: Record<BirStatus, string> = {
  NO_SUBMISSION: 'No sub.',
  SUBMITTED_TO_FRG: 'To FRG',
  APPROVED_FOR_FILING: 'Approved',
  FILED_FOR_PAYMENT: 'For pmt.',
  FILED_AND_PAID: 'Filed+Paid',
  FILED_NO_PAYMENT: 'No pmt.',
};

function StatusChip({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${statusTone(status)}`}
    >
      {STATUS_SHORT[status]}
    </span>
  );
}

function BirChip({ status }: { status: BirStatus | null }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${birStatusTone(status)}`}
    >
      {BIR_SHORT[status ?? 'NO_SUBMISSION']}
    </span>
  );
}

export function TrackerListView({ siteTrackerId }: { siteTrackerId: string }) {
  const [filters, setFilters] = useState<TrackerViewFilters>({});
  const [activeFilter, setActiveFilter] = useState<EntryFilter>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [currentMonthIdx, setCurrentMonthIdx] = useState(0);

  const query = useTrackerEntries(siteTrackerId, filters);
  const updateEntry = useUpdateTrackerEntry(siteTrackerId, filters);
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);

  const view = useMemo(() => {
    if (!query.data) return null;
    const columns = buildPeriodColumns(
      query.data.site_tracker.tracker_category.frequency,
      query.data.entries
    );
    const rows = groupTrackerRows(
      query.data.sections,
      query.data.task_lists,
      query.data.tasks,
      query.data.entries
    );
    return { columns, rows };
  }, [query.data]);

  const frequency = query.data?.site_tracker.tracker_category.frequency;
  const isBir = frequency === 'BIR';

  const monthGroups = useMemo(() => {
    if (frequency !== 'DAILY' || !view) return [];
    const groups: Array<{ label: string; startIndex: number }> = [];
    let lastMonth = '';
    view.columns.forEach((col, i) => {
      const month = format(parseISO(`${col.date}T00:00:00Z`), 'MMM yyyy');
      if (month !== lastMonth) {
        groups.push({ label: month, startIndex: i });
        lastMonth = month;
      }
    });
    return groups;
  }, [view, frequency]);

  const filteredRows = useMemo(() => {
    if (!view) return [];
    if (!activeFilter) return view.rows;
    return view.rows.filter((row) => {
      const entries = [...row.entriesByColumn.values()];
      if (activeFilter === 'overdue') return entries.some((e) => isEntryOverdue(e, now));
      return entries.some((e) => e.status === activeFilter);
    });
  }, [view, activeFilter, now]);

  // Reset scroll to top when filter changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeFilter]);

  // Reactive entry from live query data so the sheet reflects server updates
  const selectedEntry = useMemo(
    () =>
      selectedEntryId && query.data
        ? (query.data.entries.find((e) => e.id === selectedEntryId) ?? null)
        : null,
    [selectedEntryId, query.data]
  );
  const selectedTaskList = useMemo(
    () =>
      selectedEntry && query.data
        ? (query.data.task_lists.find((tl) => tl.id === selectedEntry.task_list_id) ?? null)
        : null,
    [selectedEntry, query.data]
  );
  const selectedSubtasks = useMemo(
    () =>
      selectedEntry && query.data
        ? query.data.tasks.filter((t) => t.task_list_id === selectedEntry.task_list_id)
        : [],
    [selectedEntry, query.data]
  );

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const colVirtualizer = useVirtualizer({
    count: view?.columns.length ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COL_WIDTH,
    horizontal: true,
    overscan: 3,
  });

  async function patchEntry(
    id: string,
    input: {
      status?: TaskStatus;
      bir_status?: BirStatus | null;
      submission_date?: string | null;
      note?: string | null;
      subtask_completions?: string[];
    }
  ) {
    try {
      await updateEntry.mutateAsync({ id, input });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update entry');
    }
  }

  function goToMonth(idx: number) {
    const clamped = Math.max(0, Math.min(monthGroups.length - 1, idx));
    setCurrentMonthIdx(clamped);
    colVirtualizer.scrollToIndex(monthGroups[clamped].startIndex, { align: 'start' });
  }

  function handleFilterChange(key: string | null) {
    setActiveFilter((prev) => (prev === key ? null : (key as EntryFilter)));
  }

  // --- Loading skeleton ---
  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
        <div className="overflow-hidden rounded-md border">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex border-b last:border-0">
              <Skeleton className="m-2 h-14 w-64 shrink-0 rounded" />
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="m-2 h-14 w-32 shrink-0 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (query.isError || !query.data || !view) {
    return (
      <div className="rounded-md border p-8 text-sm text-destructive">
        Failed to load tracker entries.
      </div>
    );
  }

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();
  const totalWidth = COL_WIDTH_FIRST + colVirtualizer.getTotalSize();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div className="space-y-4">
      <TrackerSummaryCards
        summary={query.data.summary}
        activeFilter={activeFilter}
        onFilter={handleFilterChange}
      />

      <TrackerViewToolbar
        siteTrackerId={siteTrackerId}
        filters={filters}
        taskLists={query.data.task_lists}
        onChange={setFilters}
        onRefresh={() => query.refetch()}
      />

      {/* Month navigation — DAILY trackers only */}
      {monthGroups.length > 1 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5">
          <button
            type="button"
            onClick={() => goToMonth(currentMonthIdx - 1)}
            disabled={currentMonthIdx === 0}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium tabular-nums">
            {monthGroups[currentMonthIdx]?.label}
          </span>
          <button
            type="button"
            onClick={() => goToMonth(currentMonthIdx + 1)}
            disabled={currentMonthIdx >= monthGroups.length - 1}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Virtualized grid */}
      <div
        ref={scrollRef}
        className="overflow-auto rounded-md border bg-background"
        style={{ maxHeight: 'calc(100vh - 340px)' }}
      >
        {/* Sticky column header row */}
        <div
          className="sticky top-0 z-30 flex"
          style={{ width: totalWidth, minWidth: totalWidth }}
        >
          <div
            className="sticky left-0 z-40 shrink-0 border-b border-r bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ width: COL_WIDTH_FIRST }}
          >
            Task
          </div>
          <div className="relative shrink-0" style={{ width: colVirtualizer.getTotalSize() }}>
            {virtualCols.map((vc) => {
              const column = view.columns[vc.index];
              return (
                <div
                  key={column.key}
                  className="absolute top-0 flex h-full flex-col items-center justify-center border-b border-r bg-muted px-1 py-2 text-center"
                  style={{ left: vc.start, width: vc.size }}
                >
                  <span className="text-xs font-semibold">
                    {formatPeriodHeader(column, frequency!)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {column.dueDate}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Empty state for filtered rows */}
        {filteredRows.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No entries match the selected filter.
          </div>
        )}

        {/* Rows */}
        <div style={{ height: totalHeight, width: totalWidth, position: 'relative' }}>
          {virtualRows.map((vr) => {
            const row = filteredRows[vr.index];
            const isZebra = vr.index % 2 === 1;

            return (
              <div
                key={row.id}
                className={`absolute flex ${isZebra ? 'bg-muted/20' : ''}`}
                style={{ top: vr.start, height: vr.size, width: totalWidth }}
              >
                {/* Sticky first column */}
                <div
                  className={`sticky left-0 z-10 shrink-0 border-b border-r px-3 py-2 ${
                    isZebra ? 'bg-muted/20' : 'bg-background'
                  }`}
                  style={{ width: COL_WIDTH_FIRST }}
                >
                  <p className="truncate text-sm font-medium leading-snug">{row.taskList.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.section?.name ?? '—'}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.taskList.assignee?.name ?? row.taskList.assignee?.email ?? 'Unassigned'}
                  </p>
                </div>

                {/* Horizontally virtualized cells */}
                <div
                  className="relative shrink-0"
                  style={{ width: colVirtualizer.getTotalSize() }}
                >
                  {virtualCols.map((vc) => {
                    const column = view.columns[vc.index];
                    const entry = row.entriesByColumn.get(column.key);
                    const overdue = entry ? isEntryOverdue(entry, now) : false;

                    const cellBg = overdue
                      ? 'bg-red-50 dark:bg-red-950/20'
                      : isZebra
                      ? 'bg-muted/20'
                      : '';

                    return (
                      <div
                        key={`${row.id}:${column.key}`}
                        className={`absolute inset-y-0 border-b border-r ${cellBg}`}
                        style={{ left: vc.start, width: vc.size }}
                      >
                        {entry ? (
                          <button
                            type="button"
                            onClick={() => setSelectedEntryId(entry.id)}
                            className="flex h-full w-full flex-col items-start justify-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <div className="flex flex-wrap gap-1">
                              {isBir && <BirChip status={entry.bir_status} />}
                              <StatusChip status={entry.status} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              {(entry.attachments_count ?? 0) > 0 && (
                                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                  <Paperclip className="h-2.5 w-2.5" />
                                  {entry.attachments_count}
                                </span>
                              )}
                              {row.subtasks.length > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  {entry.subtask_completions.length}/{row.subtasks.length}
                                </span>
                              )}
                            </div>
                          </button>
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground/40">
                            —
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Entry detail sheet — opens on cell click */}
      <TrackerEntrySheet
        entry={selectedEntry}
        taskList={selectedTaskList}
        subtasks={selectedSubtasks}
        isBir={isBir}
        isPending={updateEntry.isPending}
        onClose={() => setSelectedEntryId(null)}
        onPatch={patchEntry}
      />
    </div>
  );
}
