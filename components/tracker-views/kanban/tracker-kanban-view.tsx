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
import type { TaskEntry, TaskListWithAssignee } from '@/types/domain';
import { STATUS_LABEL } from '@/components/tracker-views/tracker-status-select';

export function TrackerKanbanView({ siteTrackerId }: { siteTrackerId: string }) {
  const query = useTrackerEntries(siteTrackerId);
  const updateEntry = useUpdateTrackerEntry(siteTrackerId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const taskListsById = useMemo(() => {
    const map = new Map<string, TaskListWithAssignee>();
    for (const taskList of query.data?.task_lists ?? []) map.set(taskList.id, taskList);
    return map;
  }, [query.data?.task_lists]);

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
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[920px] grid-cols-4 gap-3">
          {TASK_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              entries={entriesByStatus.get(status) ?? []}
              taskListsById={taskListsById}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  entries,
  taskListsById,
}: {
  status: TaskStatus;
  entries: TaskEntry[];
  taskListsById: Map<string, TaskListWithAssignee>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `status:${status}` });

  return (
    <div
      ref={setNodeRef}
      className={`flex h-[min(720px,calc(100vh-16rem))] min-h-96 flex-col rounded-md border bg-muted/20 p-3 ${
        isOver ? 'ring-2 ring-primary' : ''
      }`}
    >
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h3 className="text-sm font-semibold">{STATUS_LABEL[status]}</h3>
        <Badge variant="secondary">{entries.length}</Badge>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1">
        {entries.map((entry) => (
          <KanbanCard
            key={entry.id}
            entry={entry}
            taskList={taskListsById.get(entry.task_list_id)}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({
  entry,
  taskList,
}: {
  entry: TaskEntry;
  taskList?: TaskListWithAssignee;
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
      <div className="font-medium">{taskList?.name ?? 'Task item'}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {entry.period_label} / due {entry.due_date}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge className={statusTone(entry.status)}>{STATUS_LABEL[entry.status]}</Badge>
        {taskList?.assignee && (
          <Badge variant="outline">{taskList.assignee.name ?? taskList.assignee.email}</Badge>
        )}
      </div>
    </div>
  );
}
