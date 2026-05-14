'use client';

import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AttachmentList } from '@/components/attachments/attachment-list';
import { AttachmentUploader } from '@/components/attachments/attachment-uploader';
import {
  BirStatusSelect,
  TrackerStatusSelect,
} from '@/components/tracker-views/tracker-status-select';
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
} from '@/lib/tracker-view';
import { useTrackerEntries, useUpdateTrackerEntry } from '@/hooks/use-tracker-entries';
import type { BirStatus, TaskStatus } from '@/lib/tracker.types';

const ROW_HEIGHT = 88;
const COL_WIDTH_FIRST = 260;
const COL_WIDTH = 150;

export function TrackerListView({ siteTrackerId }: { siteTrackerId: string }) {
  const [filters, setFilters] = useState<TrackerViewFilters>({});
  const query = useTrackerEntries(siteTrackerId, filters);
  const updateEntry = useUpdateTrackerEntry(siteTrackerId, filters);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [attachmentEntryId, setAttachmentEntryId] = useState<string | null>(null);

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

  const rowVirtualizer = useVirtualizer({
    count: view?.rows.length ?? 0,
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

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 flex-1 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
        <div className="rounded-md border">
          <div className="grid" style={{ gridTemplateColumns: "260px repeat(6, 150px)" }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="m-2 h-8 rounded" />
            ))}
            {Array.from({ length: 10 }).map((_, row) =>
              Array.from({ length: 7 }).map((_, col) => (
                <Skeleton key={`${row}:${col}`} className="m-2 h-20 rounded" />
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !query.data || !view) {
    return <div className="rounded-md border p-8 text-sm text-destructive">Failed to load tracker entries.</div>;
  }

  const frequency = query.data.site_tracker.tracker_category.frequency;
  const isBir = frequency === 'BIR';
  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();
  const totalWidth = COL_WIDTH_FIRST + colVirtualizer.getTotalSize();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div className="space-y-4">
      <TrackerSummaryCards summary={query.data.summary} />
      <TrackerViewToolbar
        siteTrackerId={siteTrackerId}
        filters={filters}
        taskLists={query.data.task_lists}
        onChange={setFilters}
        onRefresh={() => query.refetch()}
      />

      {/* Virtualized grid scroll container */}
      <div
        ref={scrollRef}
        className="overflow-auto rounded-md border bg-background"
        style={{ maxHeight: "calc(100vh - 320px)" }}
      >
        {/* Header row — sticky top, not virtualized so all period headers stay in sync */}
        <div
          className="sticky top-0 z-30 flex"
          style={{ width: totalWidth, minWidth: totalWidth }}
        >
          <div
            className="sticky left-0 z-40 shrink-0 border-b border-r bg-muted p-3 text-xs font-semibold"
            style={{ width: COL_WIDTH_FIRST }}
          >
            Task
          </div>
          {/* Horizontal virtualizer spacer + visible columns */}
          <div className="relative shrink-0" style={{ width: colVirtualizer.getTotalSize() }}>
            {virtualCols.map((vc) => {
              const column = view.columns[vc.index];
              return (
                <div
                  key={column.key}
                  className="absolute top-0 border-b border-r bg-muted p-2 text-center"
                  style={{ left: vc.start, width: vc.size }}
                >
                  <div className="text-xs font-semibold">
                    {formatPeriodHeader(column, frequency)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Due {column.dueDate}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows area */}
        <div style={{ height: totalHeight, width: totalWidth, position: 'relative' }}>
          {virtualRows.map((vr) => {
            const row = view.rows[vr.index];
            return (
              <div
                key={row.id}
                className="absolute flex"
                style={{ top: vr.start, height: vr.size, width: totalWidth }}
              >
                {/* Sticky first column */}
                <div
                  className="sticky left-0 z-10 shrink-0 border-b border-r bg-background p-3"
                  style={{ width: COL_WIDTH_FIRST }}
                >
                  <div className="truncate text-sm font-medium">{row.taskList.name}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {row.section?.name ?? 'No section'}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {row.taskList.assignee?.name ?? row.taskList.assignee?.email ?? 'Unassigned'}
                  </div>
                  {row.subtasks.length > 0 && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {row.subtasks.length} subtasks
                    </div>
                  )}
                </div>

                {/* Horizontally virtualized cells */}
                <div className="relative shrink-0" style={{ width: colVirtualizer.getTotalSize() }}>
                  {virtualCols.map((vc) => {
                    const column = view.columns[vc.index];
                    const entry = row.entriesByColumn.get(column.key);
                    return (
                      <div
                        key={`${row.id}:${column.key}`}
                        className="absolute inset-y-0 border-b border-r p-2"
                        style={{ left: vc.start, width: vc.size }}
                      >
                        {entry ? (
                          <div className="grid gap-1">
                            {(entry.attachments_count ?? 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => setAttachmentEntryId(entry.id)}
                                className="flex items-center gap-1 self-start rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                                aria-label={`${entry.attachments_count} attachment(s)`}
                              >
                                <Paperclip className="h-3 w-3" />
                                {entry.attachments_count}
                              </button>
                            )}
                            {isBir && (
                              <BirStatusSelect
                                value={entry.bir_status}
                                onChange={(bir_status) => patchEntry(entry.id, { bir_status })}
                                disabled={updateEntry.isPending}
                              />
                            )}
                            <TrackerStatusSelect
                              value={entry.status}
                              onChange={(status) => patchEntry(entry.id, { status })}
                              disabled={updateEntry.isPending}
                            />
                            <Input
                              type="date"
                              defaultValue={entry.submission_date ?? ''}
                              onBlur={(event) =>
                                patchEntry(entry.id, {
                                  submission_date: event.currentTarget.value || null,
                                })
                              }
                              className="h-8 text-xs"
                            />
                            <Input
                              defaultValue={entry.note ?? ''}
                              placeholder="Note"
                              onBlur={(event) =>
                                patchEntry(entry.id, { note: event.currentTarget.value || null })
                              }
                              className="h-8 text-xs"
                            />
                            {row.subtasks.length > 0 && (
                              <div className="grid gap-1 rounded border p-2">
                                {row.subtasks.map((subtask) => {
                                  const completed = entry.subtask_completions.includes(subtask.id);
                                  return (
                                    <label
                                      key={subtask.id}
                                      className="flex items-center gap-2 text-xs text-muted-foreground"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={completed}
                                        onChange={(event) => {
                                          const next = event.currentTarget.checked
                                            ? [...entry.subtask_completions, subtask.id]
                                            : entry.subtask_completions.filter((id) => id !== subtask.id);
                                          patchEntry(entry.id, { subtask_completions: next });
                                        }}
                                        disabled={updateEntry.isPending}
                                      />
                                      <span className="truncate">{subtask.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                            -
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

      <Dialog
        open={!!attachmentEntryId}
        onOpenChange={(open) => !open && setAttachmentEntryId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attachments</DialogTitle>
          </DialogHeader>
          {attachmentEntryId && (
            <div className="grid gap-3">
              <AttachmentUploader taskEntryId={attachmentEntryId} />
              <AttachmentList taskEntryId={attachmentEntryId} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
