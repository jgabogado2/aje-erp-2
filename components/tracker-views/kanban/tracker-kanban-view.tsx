'use client';

import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api-client';
import { statusTone } from '@/lib/tracker-view';
import { TASK_STATUSES, type TaskStatus } from '@/lib/tracker.types';
import { useTrackerEntries, useUpdateTrackerEntry } from '@/hooks/use-tracker-entries';
import type { TaskEntry, TaskWithAssignee } from '@/types/domain';
import { STATUS_LABEL } from '@/components/tracker-views/tracker-status-select';

export function TrackerKanbanView({ siteTrackerId }: { siteTrackerId: string }) {
  const query = useTrackerEntries(siteTrackerId);
  const updateEntry = useUpdateTrackerEntry(siteTrackerId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const tasksById = useMemo(() => {
    const map = new Map<string, TaskWithAssignee>();
    for (const task of query.data?.tasks ?? []) map.set(task.id, task);
    return map;
  }, [query.data?.tasks]);

  const entriesByStatus = useMemo(() => {
    const map = new Map<TaskStatus, TaskEntry[]>();
    for (const status of TASK_STATUSES) map.set(status, []);
    for (const entry of query.data?.entries ?? []) {
      map.get(entry.status)?.push(entry);
    }
    return map;
  }, [query.data?.entries]);

  async function handleDragEnd(event: DragEndEvent) {
    const entryId = event.active.id.toString().replace('entry:', '');
    const status = event.over?.id.toString().replace('status:', '') as TaskStatus | undefined;
    if (!entryId || !status || !TASK_STATUSES.includes(status)) return;

    try {
      await updateEntry.mutateAsync({ id: entryId, input: { status } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to move card');
    }
  }

  if (query.isLoading) {
    return <div className="rounded-md border p-8 text-sm text-muted-foreground">Loading board...</div>;
  }
  if (query.isError || !query.data) {
    return <div className="rounded-md border p-8 text-sm text-destructive">Failed to load board.</div>;
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid gap-3 lg:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            entries={entriesByStatus.get(status) ?? []}
            tasksById={tasksById}
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  entries,
  tasksById,
}: {
  status: TaskStatus;
  entries: TaskEntry[];
  tasksById: Map<string, TaskWithAssignee>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `status:${status}` });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-96 rounded-md border bg-muted/20 p-3 ${isOver ? 'ring-2 ring-primary' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{STATUS_LABEL[status]}</h3>
        <Badge variant="secondary">{entries.length}</Badge>
      </div>
      <div className="grid gap-2">
        {entries.map((entry) => (
          <KanbanCard key={entry.id} entry={entry} task={tasksById.get(entry.task_id)} />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({
  entry,
  task,
}: {
  entry: TaskEntry;
  task?: TaskWithAssignee;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `entry:${entry.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        opacity: isDragging ? 0.6 : 1,
      }}
      className="cursor-grab rounded-md border bg-background p-3 shadow-sm active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <div className="font-medium">{task?.name ?? 'Task'}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {entry.period_label} / due {entry.due_date}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge className={statusTone(entry.status)}>{STATUS_LABEL[entry.status]}</Badge>
        {task?.assignee && (
          <Badge variant="outline">{task.assignee.name ?? task.assignee.email}</Badge>
        )}
      </div>
    </div>
  );
}
