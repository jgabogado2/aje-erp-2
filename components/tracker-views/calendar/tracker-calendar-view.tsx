'use client';

import { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrackerStatusSelect } from '@/components/tracker-views/tracker-status-select';
import { AttachmentList } from '@/components/attachments/attachment-list';
import { AttachmentUploader } from '@/components/attachments/attachment-uploader';
import { statusTone } from '@/lib/tracker-view';
import { useTrackerEntries, useUpdateTrackerEntry } from '@/hooks/use-tracker-entries';
import type { Task, TaskEntry, TaskListWithAssignee } from '@/types/domain';

export function TrackerCalendarView({ siteTrackerId }: { siteTrackerId: string }) {
  const query = useTrackerEntries(siteTrackerId);
  const updateEntry = useUpdateTrackerEntry(siteTrackerId);
  const [selected, setSelected] = useState<TaskEntry | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));

  const taskListsById = useMemo(() => {
    const map = new Map<string, TaskListWithAssignee>();
    for (const taskList of query.data?.task_lists ?? []) map.set(taskList.id, taskList);
    return map;
  }, [query.data?.task_lists]);

  const subtasksByTaskList = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const subtask of query.data?.tasks ?? []) {
      if (!map.has(subtask.task_list_id)) map.set(subtask.task_list_id, []);
      map.get(subtask.task_list_id)!.push(subtask);
    }
    return map;
  }, [query.data?.tasks]);

  function toggleSubtask(entry: TaskEntry, subtaskId: string, done: boolean) {
    const next = done
      ? Array.from(new Set([...(entry.subtask_completions ?? []), subtaskId]))
      : (entry.subtask_completions ?? []).filter((id) => id !== subtaskId);
    updateEntry.mutate({ id: entry.id, input: { subtask_completions: next } });
    // Optimistically reflect the toggle in the open dialog so the checkbox
    // ticks immediately instead of waiting for the refetch.
    setSelected((prev) =>
      prev && prev.id === entry.id ? { ...prev, subtask_completions: next } : prev
    );
  }

  const days = useMemo(() => {
    const start = startOfWeek(visibleMonth, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, idx) => addDays(start, idx));
  }, [visibleMonth]);

  const entriesByDueDate = useMemo(() => {
    const map = new Map<string, TaskEntry[]>();
    for (const entry of query.data?.entries ?? []) {
      if (!map.has(entry.due_date)) map.set(entry.due_date, []);
      map.get(entry.due_date)!.push(entry);
    }
    return map;
  }, [query.data?.entries]);

  if (query.isLoading) {
    return <div className="rounded-md border p-8 text-sm text-muted-foreground">Loading calendar...</div>;
  }
  if (query.isError || !query.data) {
    return <div className="rounded-md border p-8 text-sm text-destructive">Failed to load calendar.</div>;
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVisibleMonth((month) => subMonths(month, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-40 text-center text-sm font-semibold">
            {format(visibleMonth, 'MMMM yyyy')}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setVisibleMonth(startOfMonth(new Date()))}
          >
            Today
          </Button>
        </div>

        <div className="grid grid-cols-7 overflow-hidden rounded-md border bg-background">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div
              key={day}
              className="border-b border-r bg-muted p-2 text-center text-xs font-medium"
            >
              {day}
            </div>
          ))}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const entries = entriesByDueDate.get(key) ?? [];
            const inMonth = isSameMonth(day, visibleMonth);
            return (
              <div
                key={key}
                className={`min-h-32 border-b border-r p-2 ${
                  inMonth ? 'bg-background' : 'bg-muted/25 text-muted-foreground'
                }`}
              >
                <div
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium ${
                    isToday(day) ? 'bg-primary text-primary-foreground' : ''
                  }`}
                >
                  {format(day, 'd')}
                </div>
                <div className="mt-2 grid gap-1">
                  {entries.slice(0, 4).map((entry) => {
                    const taskList = taskListsById.get(entry.task_list_id);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={`truncate rounded border px-2 py-1 text-left text-xs ${statusTone(entry.status)}`}
                        onClick={() => setSelected(entry)}
                      >
                        {taskList?.name ?? entry.period_label}
                      </button>
                    );
                  })}
                  {entries.length > 4 && (
                    <div className="text-xs text-muted-foreground">
                      +{entries.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected
                ? taskListsById.get(selected.task_list_id)?.name ?? 'Task entry'
                : 'Task entry'}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{selected.period_label}</Badge>
                <Badge variant="outline">Due {selected.due_date}</Badge>
              </div>
              <TrackerStatusSelect
                value={selected.status}
                onChange={(status) =>
                  updateEntry.mutate({ id: selected.id, input: { status } })
                }
                disabled={updateEntry.isPending}
              />
              {(() => {
                const subtasks = subtasksByTaskList.get(selected.task_list_id) ?? [];
                if (subtasks.length === 0) return null;
                const completions = new Set(selected.subtask_completions ?? []);
                return (
                  <div className="grid gap-1.5 rounded-md border p-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      Subtasks
                    </div>
                    {subtasks.map((subtask) => {
                      const done = completions.has(subtask.id);
                      return (
                        <label
                          key={subtask.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={done}
                            disabled={updateEntry.isPending}
                            onChange={(e) =>
                              toggleSubtask(selected, subtask.id, e.target.checked)
                            }
                          />
                          <span className={done ? 'text-muted-foreground line-through' : ''}>
                            {subtask.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Attachments — per-period evidence. Always visible so users
                  have a clear place to drop receipts/PDFs. */}
              <div className="grid gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">
                    Attachments
                  </div>
                  <AttachmentUploader taskEntryId={selected.id} />
                </div>
                <AttachmentList taskEntryId={selected.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
