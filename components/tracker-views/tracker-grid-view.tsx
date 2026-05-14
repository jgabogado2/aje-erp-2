'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeft, ChevronRight, Paperclip } from 'lucide-react';
import { StatusChip, BirChip } from '@/components/tracker-views/tracker-chips';
import {
  buildColumnGroups,
  buildPeriodColumns,
  formatPeriodHeader,
  groupTrackerRows,
  isEntryOverdue,
} from '@/lib/tracker-view';
import type { FrequencyConfig, KpiCardSpec } from '@/lib/tracker-frequency-config';
import type { TrackerEntriesPayload } from '@/types/domain';

const COL_WIDTH_FIRST = 256;
const COL_WIDTH = 136;
const GROUP_BAND_HEIGHT = 28;

interface TrackerGridViewProps {
  data: TrackerEntriesPayload;
  config: FrequencyConfig;
  activeCard: KpiCardSpec | undefined;
  now: Date;
  onSelectEntry: (entryId: string) => void;
}

export function TrackerGridView({
  data,
  config,
  activeCard,
  now,
  onSelectEntry,
}: TrackerGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentGroupIdx, setCurrentGroupIdx] = useState(0);

  const frequency = data.site_tracker.tracker_category.frequency;
  const isBir = config.statusVocabulary === 'bir';

  const view = useMemo(() => {
    const columns = buildPeriodColumns(frequency, data.entries);
    const rows = groupTrackerRows(data.sections, data.task_lists, data.tasks, data.entries);
    return { columns, rows };
  }, [data, frequency]);

  const columnGroups = useMemo(
    () => buildColumnGroups(view.columns, config.columnGrouping),
    [view.columns, config.columnGrouping]
  );

  const filteredRows = useMemo(() => {
    const predicate = activeCard?.entryFilter;
    const rows = predicate
      ? view.rows.filter((row) =>
          [...row.entriesByColumn.values()].some((e) => predicate(e, now))
        )
      : view.rows;

    // BIR: float rows carrying an overdue (escalated) filing to the top.
    if (!config.escalation) return rows;
    return [...rows].sort((a, b) => {
      const aEsc = [...a.entriesByColumn.values()].some((e) => isEntryOverdue(e, now));
      const bEsc = [...b.entriesByColumn.values()].some((e) => isEntryOverdue(e, now));
      return Number(bEsc) - Number(aEsc);
    });
  }, [view.rows, activeCard, config.escalation, now]);

  // Reset scroll to top when the active filter changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeCard]);

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => config.rowHeight,
    overscan: 5,
  });

  const colVirtualizer = useVirtualizer({
    count: view.columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COL_WIDTH,
    horizontal: true,
    overscan: 3,
  });

  function goToGroup(idx: number) {
    const clamped = Math.max(0, Math.min(columnGroups.length - 1, idx));
    setCurrentGroupIdx(clamped);
    colVirtualizer.scrollToIndex(columnGroups[clamped].startIndex, { align: 'start' });
  }

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();
  const colsWidth = colVirtualizer.getTotalSize();
  const totalWidth = COL_WIDTH_FIRST + colsWidth;
  const totalHeight = rowVirtualizer.getTotalSize();
  const showGroupBand = columnGroups.length > 0;

  return (
    <div className="space-y-4">
      {/* Jump-to-period navigation */}
      {config.jumpNav && columnGroups.length > 1 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5">
          <button
            type="button"
            onClick={() => goToGroup(currentGroupIdx - 1)}
            disabled={currentGroupIdx === 0}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
            aria-label="Previous period"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium tabular-nums">
            {columnGroups[currentGroupIdx]?.label}
          </span>
          <button
            type="button"
            onClick={() => goToGroup(currentGroupIdx + 1)}
            disabled={currentGroupIdx >= columnGroups.length - 1}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
            aria-label="Next period"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="overflow-auto rounded-md border bg-background"
        style={{ maxHeight: 'calc(100vh - 340px)' }}
      >
        {/* Sticky header stack: grouping band + column headers */}
        <div
          className="sticky top-0 z-30 flex flex-col"
          style={{ width: totalWidth, minWidth: totalWidth }}
        >
          {/* Grouping band */}
          {showGroupBand && (
            <div className="flex" style={{ height: GROUP_BAND_HEIGHT }}>
              <div
                className="sticky left-0 z-40 shrink-0 border-b border-r bg-muted"
                style={{ width: COL_WIDTH_FIRST }}
              />
              <div className="relative shrink-0" style={{ width: colsWidth }}>
                {columnGroups.map((group) => (
                  <div
                    key={`${group.label}:${group.startIndex}`}
                    className="absolute top-0 flex h-full items-center border-b border-r bg-muted px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    style={{
                      left: group.startIndex * COL_WIDTH,
                      width: group.count * COL_WIDTH,
                    }}
                  >
                    {group.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Column headers */}
          <div className="flex">
            <div
              className="sticky left-0 z-40 shrink-0 border-b border-r bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ width: COL_WIDTH_FIRST }}
            >
              Task
            </div>
            <div className="relative shrink-0" style={{ width: colsWidth }}>
              {virtualCols.map((vc) => {
                const column = view.columns[vc.index];
                return (
                  <div
                    key={column.key}
                    className="absolute top-0 flex h-full flex-col items-center justify-center border-b border-r bg-muted px-1 py-2 text-center"
                    style={{ left: vc.start, width: vc.size }}
                  >
                    <span className="text-xs font-semibold">
                      {formatPeriodHeader(column, frequency)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{column.dueDate}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Empty state */}
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
                <div className="relative shrink-0" style={{ width: colsWidth }}>
                  {virtualCols.map((vc) => {
                    const column = view.columns[vc.index];
                    const entry = row.entriesByColumn.get(column.key);
                    const overdue = entry ? isEntryOverdue(entry, now) : false;
                    const escalated = overdue && config.escalation;

                    const cellBg = overdue
                      ? 'bg-red-50 dark:bg-red-950/20'
                      : isZebra
                        ? 'bg-muted/20'
                        : '';
                    const escalationBorder = escalated
                      ? 'border-l-2 border-l-red-500'
                      : '';

                    return (
                      <div
                        key={`${row.id}:${column.key}`}
                        className={`absolute inset-y-0 border-b border-r ${cellBg} ${escalationBorder}`}
                        style={{ left: vc.start, width: vc.size }}
                      >
                        {entry ? (
                          <button
                            type="button"
                            onClick={() => onSelectEntry(entry.id)}
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
    </div>
  );
}
