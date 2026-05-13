'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
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

export function TrackerListView({ siteTrackerId }: { siteTrackerId: string }) {
  const [filters, setFilters] = useState<TrackerViewFilters>({});
  const query = useTrackerEntries(siteTrackerId, filters);
  const updateEntry = useUpdateTrackerEntry(siteTrackerId, filters);

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
    return <div className="rounded-md border p-8 text-sm text-muted-foreground">Loading entries...</div>;
  }

  if (query.isError || !query.data || !view) {
    return <div className="rounded-md border p-8 text-sm text-destructive">Failed to load tracker entries.</div>;
  }

  const frequency = query.data.site_tracker.tracker_category.frequency;
  const isBir = frequency === 'BIR';

  return (
    <div className="space-y-4">
      <TrackerSummaryCards summary={query.data.summary} />
      <TrackerViewToolbar
        filters={filters}
        taskLists={query.data.task_lists}
        tasks={query.data.tasks}
        onChange={setFilters}
        onRefresh={() => query.refetch()}
      />

      <div className="overflow-auto rounded-md border bg-background">
        <div
          className="min-w-max"
          style={{
            display: 'grid',
            gridTemplateColumns: `260px repeat(${view.columns.length}, 150px)`,
          }}
        >
          <div className="sticky left-0 top-0 z-30 border-b border-r bg-muted p-3 text-xs font-semibold">
            Task
          </div>
          {view.columns.map((column) => (
            <div
              key={column.key}
              className="sticky top-0 z-20 border-b border-r bg-muted p-2 text-center"
            >
              <div className="text-xs font-semibold">
                {formatPeriodHeader(column, frequency)}
              </div>
              <div className="text-[10px] text-muted-foreground">Due {column.dueDate}</div>
            </div>
          ))}

          {view.rows.map((row) => (
            <div key={row.id} className="contents">
              <div className="sticky left-0 z-10 border-b border-r bg-background p-3">
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
              {view.columns.map((column) => {
                const entry = row.entriesByColumn.get(column.key);
                return (
                  <div key={`${row.id}:${column.key}`} className="border-b border-r p-2">
                    {entry ? (
                      <div className="grid gap-1">
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
                      <div className="flex h-full min-h-20 items-center justify-center text-xs text-muted-foreground">
                        -
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
