'use client';

import { useMemo, useState } from 'react';
import { addDays, format, startOfMonth, startOfWeek } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { TrackerStatusSelect } from '@/components/tracker-views/tracker-status-select';
import { statusTone } from '@/lib/tracker-view';
import { useTrackerEntries, useUpdateTrackerEntry } from '@/hooks/use-tracker-entries';
import type { TaskEntry, TaskWithAssignee } from '@/types/domain';

export function TrackerCalendarView({ siteTrackerId }: { siteTrackerId: string }) {
  const query = useTrackerEntries(siteTrackerId);
  const updateEntry = useUpdateTrackerEntry(siteTrackerId);
  const [selected, setSelected] = useState<TaskEntry | null>(null);

  const tasksById = useMemo(() => {
    const map = new Map<string, TaskWithAssignee>();
    for (const task of query.data?.tasks ?? []) map.set(task.id, task);
    return map;
  }, [query.data?.tasks]);

  const days = useMemo(() => {
    const firstDue = query.data?.entries[0]?.due_date;
    const anchor = firstDue ? new Date(`${firstDue}T00:00:00`) : new Date();
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, idx) => addDays(start, idx));
  }, [query.data?.entries]);

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
      <div className="grid grid-cols-7 overflow-hidden rounded-md border bg-background">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="border-b border-r bg-muted p-2 text-center text-xs font-medium">
            {day}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const entries = entriesByDueDate.get(key) ?? [];
          return (
            <div key={key} className="min-h-32 border-b border-r p-2">
              <div className="text-xs font-medium">{format(day, 'MMM d')}</div>
              <div className="mt-2 grid gap-1">
                {entries.slice(0, 4).map((entry) => {
                  const task = tasksById.get(entry.task_id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`truncate rounded border px-2 py-1 text-left text-xs ${statusTone(entry.status)}`}
                      onClick={() => setSelected(entry)}
                    >
                      {task?.name ?? entry.period_label}
                    </button>
                  );
                })}
                {entries.length > 4 && (
                  <div className="text-xs text-muted-foreground">+{entries.length - 4} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected ? tasksById.get(selected.task_id)?.name ?? 'Task entry' : 'Task entry'}
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
