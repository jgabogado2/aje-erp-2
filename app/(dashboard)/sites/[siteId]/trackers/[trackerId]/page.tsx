'use client';

import type { CSSProperties, ReactNode } from 'react';
import { use, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Trash2,
  ListChecks,
  UserCircle2,
  CalendarClock,
  GripVertical,
} from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import {
  PageContainer,
  PageSection,
  PageCard,
  PageEmptyState,
} from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useHierarchy,
  useDeleteSection,
  useDeleteTaskList,
  useDeleteTask,
  useReorderSections,
  useReorderTaskLists,
  useReorderTasks,
  useUpdateTaskList,
  useUpdateTask,
} from '@/hooks/use-hierarchy';
import { ApiError } from '@/lib/api-client';
import { SectionFormDialog } from '@/components/sites/section-form-dialog';
import { TaskListFormDialog } from '@/components/sites/task-list-form-dialog';
import { TaskFormDialog } from '@/components/sites/task-form-dialog';
import { TrackerListView } from '@/components/tracker-views/tracker-list-view';
import { TrackerKanbanView } from '@/components/tracker-views/kanban/tracker-kanban-view';
import { TrackerCalendarView } from '@/components/tracker-views/calendar/tracker-calendar-view';
import type {
  TrackerSection,
  TaskList,
  TaskWithAssignee,
} from '@/types/domain';
import type { Frequency } from '@/lib/tracker.types';

type PageProps = { params: Promise<{ siteId: string; trackerId: string }> };

const FREQ_LABEL: Record<Frequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annual',
  BIR: 'BIR',
  CUSTOM: 'Custom',
};

const UNGROUPED = 'ungrouped';

type DragData =
  | { type: 'section'; sectionId: string }
  | { type: 'task-list'; taskListId: string }
  | { type: 'task-list-container'; sectionId: string | null }
  | { type: 'task'; taskId: string }
  | { type: 'task-container'; taskListId: string };

type TrackerView = 'list' | 'kanban' | 'calendar' | 'manage';

export default function SiteTrackerDetailPage({ params }: PageProps) {
  const { siteId, trackerId } = use(params);
  const router = useRouter();
  const { data: session, status } = useSession();
  const hierarchyQuery = useHierarchy(trackerId);

  const [editingSection, setEditingSection] = useState<TrackerSection | null>(null);
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);

  const [editingTaskList, setEditingTaskList] = useState<TaskList | null>(null);
  const [taskListDialogOpen, setTaskListDialogOpen] = useState(false);
  const [taskListDefaultSection, setTaskListDefaultSection] = useState<string | null>(null);

  const [editingTask, setEditingTask] = useState<TaskWithAssignee | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogTaskListId, setTaskDialogTaskListId] = useState<string | null>(null);

  const [deleteSection, setDeleteSection] = useState<TrackerSection | null>(null);
  const [deleteTaskList, setDeleteTaskList] = useState<TaskList | null>(null);
  const [deleteTask, setDeleteTask] = useState<TaskWithAssignee | null>(null);
  const [activeView, setActiveView] = useState<TrackerView>('list');

  const deleteSectionMut = useDeleteSection(trackerId);
  const deleteTaskListMut = useDeleteTaskList(trackerId);
  const deleteTaskMut = useDeleteTask(trackerId);
  const reorderSectionsMut = useReorderSections(trackerId);
  const reorderTaskListsMut = useReorderTaskLists(trackerId);
  const reorderTasksMut = useReorderTasks(trackerId);
  const updateTaskListMut = useUpdateTaskList(trackerId);
  const updateTaskMut = useUpdateTask(trackerId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Tree fold from the flat hierarchy. Memoize so the children don't think
  // their parent array identity changed on every render.
  const tree = useMemo(() => {
    const h = hierarchyQuery.data;
    if (!h) return null;

    const tasksByList = new Map<string, TaskWithAssignee[]>();
    const taskById = new Map<string, TaskWithAssignee>();
    for (const t of h.tasks) {
      taskById.set(t.id, t);
      if (!tasksByList.has(t.task_list_id)) tasksByList.set(t.task_list_id, []);
      tasksByList.get(t.task_list_id)!.push(t);
    }

    const taskListsBySection = new Map<string, TaskList[]>();
    const taskListById = new Map<string, TaskList>();
    const ungroupedTaskLists: TaskList[] = [];
    for (const tl of h.task_lists) {
      taskListById.set(tl.id, tl);
      if (tl.tracker_section_id) {
        if (!taskListsBySection.has(tl.tracker_section_id)) {
          taskListsBySection.set(tl.tracker_section_id, []);
        }
        taskListsBySection.get(tl.tracker_section_id)!.push(tl);
      } else {
        ungroupedTaskLists.push(tl);
      }
    }

    return {
      sections: h.sections,
      ungroupedTaskLists,
      taskListsBySection,
      tasksByList,
      taskListById,
      taskById,
    };
  }, [hierarchyQuery.data]);

  if (status === 'loading') return null;
  if (!session) {
    router.replace('/signin');
    return null;
  }

  if (hierarchyQuery.isError) {
    return (
      <PageContainer
        title="Tracker"
        breadcrumbs={[{ label: 'Sites', href: '/admin/sites' }]}
      >
        <PageCard>
          <div className="p-8 text-center text-sm text-destructive">
            {hierarchyQuery.error instanceof ApiError &&
            hierarchyQuery.error.status === 403
              ? 'You do not have access to this tracker.'
              : 'Failed to load tracker.'}
          </div>
        </PageCard>
      </PageContainer>
    );
  }

  const h = hierarchyQuery.data;
  if (hierarchyQuery.isLoading || !h || !tree) {
    return (
      <PageContainer title="Loading…" breadcrumbs={[{ label: 'Sites', href: '/admin/sites' }]}>
        <PageCard>
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        </PageCard>
      </PageContainer>
    );
  }

  const canWrite =
    session.userRole?.role === 'SUPER_ADMIN' ||
    // The hierarchy endpoint doesn't return the caller's site role today.
    // For Phase 2b we trust system role; finer-grained UI gating can come
    // when we add a "/me/site-access/:siteId" endpoint or embed it on the
    // hierarchy response. SITE_MANAGER users hitting this page are gated
    // by RBAC at write time anyway — UI just gets a forbidden toast.
    session.userRole?.role === 'SITE_MANAGER';

  const tracker = h.site_tracker;
  const category = tracker.tracker_category;
  const site = tracker.site;

  const taskListContainerId = (sectionId: string | null) =>
    sectionId ?? UNGROUPED;

  const flattenTaskListGroups = (groups: Map<string, TaskList[]>) => [
    ...tree.sections.flatMap((section) => groups.get(taskListContainerId(section.id)) ?? []),
    ...(groups.get(UNGROUPED) ?? []),
  ];

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canWrite) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as DragData | undefined;
    const overData = over.data.current as DragData | undefined;
    if (!activeData || !overData) return;

    try {
      if (activeData.type === 'section' && overData.type === 'section') {
        const next = [...tree.sections];
        const from = next.findIndex((section) => section.id === activeData.sectionId);
        const to = next.findIndex((section) => section.id === overData.sectionId);
        if (from < 0 || to < 0) return;
        const [moving] = next.splice(from, 1);
        next.splice(to, 0, moving);
        await reorderSectionsMut.mutateAsync({ ordered_ids: next.map((section) => section.id) });
        return;
      }

      if (activeData.type === 'task-list') {
        const activeList = tree.taskListById.get(activeData.taskListId);
        if (!activeList) return;
        const targetSectionId =
          overData.type === 'task-list'
            ? tree.taskListById.get(overData.taskListId)?.tracker_section_id ?? null
            : overData.type === 'task-list-container'
              ? overData.sectionId
              : null;
        if (targetSectionId === undefined) return;

        const sourceKey = taskListContainerId(activeList.tracker_section_id);
        const targetKey = taskListContainerId(targetSectionId);
        const groups = new Map<string, TaskList[]>();
        for (const section of tree.sections) {
          groups.set(taskListContainerId(section.id), [
            ...(tree.taskListsBySection.get(section.id) ?? []),
          ]);
        }
        groups.set(UNGROUPED, [...tree.ungroupedTaskLists]);

        groups.set(
          sourceKey,
          (groups.get(sourceKey) ?? []).filter((taskList) => taskList.id !== activeList.id)
        );
        const targetBucket = [...(groups.get(targetKey) ?? [])];
        const insertAt =
          overData.type === 'task-list'
            ? Math.max(
                0,
                targetBucket.findIndex((taskList) => taskList.id === overData.taskListId)
              )
            : targetBucket.length;
        targetBucket.splice(insertAt, 0, {
          ...activeList,
          tracker_section_id: targetSectionId,
        });
        groups.set(targetKey, targetBucket);

        if (activeList.tracker_section_id !== targetSectionId) {
          await updateTaskListMut.mutateAsync({
            id: activeList.id,
            input: { tracker_section_id: targetSectionId },
          });
        }
        await reorderTaskListsMut.mutateAsync({
          ordered_ids: flattenTaskListGroups(groups).map((taskList) => taskList.id),
        });
        return;
      }

      if (activeData.type === 'task') {
        const activeTask = tree.taskById.get(activeData.taskId);
        if (!activeTask) return;
        const targetTaskListId =
          overData.type === 'task'
            ? tree.taskById.get(overData.taskId)?.task_list_id
            : overData.type === 'task-container'
              ? overData.taskListId
              : undefined;
        if (!targetTaskListId) return;

        const sourceBucket = (tree.tasksByList.get(activeTask.task_list_id) ?? []).filter(
          (task) => task.id !== activeTask.id
        );
        const targetBucket =
          activeTask.task_list_id === targetTaskListId
            ? sourceBucket
            : [...(tree.tasksByList.get(targetTaskListId) ?? [])];
        const insertAt =
          overData.type === 'task'
            ? Math.max(0, targetBucket.findIndex((task) => task.id === overData.taskId))
            : targetBucket.length;
        targetBucket.splice(insertAt, 0, { ...activeTask, task_list_id: targetTaskListId });

        if (activeTask.task_list_id !== targetTaskListId) {
          await updateTaskMut.mutateAsync({
            id: activeTask.id,
            input: { task_list_id: targetTaskListId },
          });
          await Promise.all([
            sourceBucket.length
              ? reorderTasksMut.mutateAsync({
                  taskListId: activeTask.task_list_id,
                  input: { ordered_ids: sourceBucket.map((task) => task.id) },
                })
              : Promise.resolve(),
            reorderTasksMut.mutateAsync({
              taskListId: targetTaskListId,
              input: { ordered_ids: targetBucket.map((task) => task.id) },
            }),
          ]);
        } else {
          await reorderTasksMut.mutateAsync({
            taskListId: targetTaskListId,
            input: { ordered_ids: targetBucket.map((task) => task.id) },
          });
        }
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Move failed');
    }
  };

  return (
    <PageContainer
      breadcrumbs={[
        { label: 'Sites', href: '/admin/sites' },
        { label: site.name, href: `/sites/${siteId}` },
        { label: category.name },
      ]}
      title={category.name}
      description={`${site.name} · ${FREQ_LABEL[category.frequency]} · ${tracker.year}`}
      actions={
        canWrite && activeView === 'manage' && (
          <Button
            onClick={() => {
              setEditingSection(null);
              setSectionDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add section
          </Button>
        )
      }
    >
      <div className="mb-6 flex flex-wrap gap-2 rounded-md border bg-background p-2">
        {([
          ['list', 'List'],
          ['kanban', 'Kanban'],
          ['calendar', 'Calendar'],
          ...(canWrite ? ([['manage', 'Manage']] as const) : []),
        ] as Array<[TrackerView, string]>).map(([view, label]) => (
          <Button
            key={view}
            type="button"
            variant={activeView === view ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveView(view)}
          >
            {label}
          </Button>
        ))}
      </div>

      {activeView === 'list' ? (
        <TrackerListView siteTrackerId={trackerId} />
      ) : activeView === 'kanban' ? (
        <TrackerKanbanView siteTrackerId={trackerId} />
      ) : activeView === 'calendar' ? (
        <TrackerCalendarView siteTrackerId={trackerId} />
      ) : tree.sections.length === 0 && tree.ungroupedTaskLists.length === 0 ? (
        <PageCard>
          <PageEmptyState
            icon={<ListChecks className="h-8 w-8" />}
            title="No sections yet"
            description="Add a section to start organizing task lists and tasks."
            action={
              canWrite ? (
                <Button
                  onClick={() => {
                    setEditingSection(null);
                    setSectionDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add section
                </Button>
              ) : null
            }
          />
        </PageCard>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToWindowEdges]}
        >
          <div className="space-y-6">
            <SortableContext
              items={tree.sections.map((section) => `section:${section.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {tree.sections.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  canWrite={canWrite}
                  taskLists={tree.taskListsBySection.get(section.id) ?? []}
                  tasksByList={tree.tasksByList}
                  onEditSection={() => {
                    setEditingSection(section);
                    setSectionDialogOpen(true);
                  }}
                  onDeleteSection={() => setDeleteSection(section)}
                  onAddTaskList={() => {
                    setEditingTaskList(null);
                    setTaskListDefaultSection(section.id);
                    setTaskListDialogOpen(true);
                  }}
                  onEditTaskList={(tl) => {
                    setEditingTaskList(tl);
                    setTaskListDefaultSection(tl.tracker_section_id);
                    setTaskListDialogOpen(true);
                  }}
                  onDeleteTaskList={(tl) => setDeleteTaskList(tl)}
                  onAddTask={(taskListId) => {
                    setEditingTask(null);
                    setTaskDialogTaskListId(taskListId);
                    setTaskDialogOpen(true);
                  }}
                  onEditTask={(t, taskListId) => {
                    setEditingTask(t);
                    setTaskDialogTaskListId(taskListId);
                    setTaskDialogOpen(true);
                  }}
                  onOpenTask={(t) =>
                    router.push(`/sites/${siteId}/trackers/${trackerId}/tasks/${t.id}`)
                  }
                  onDeleteTask={(t) => setDeleteTask(t)}
                  frequency={category.frequency}
                />
              ))}
            </SortableContext>

            <PageSection title="Ungrouped task lists">
              <TaskListDropArea sectionId={null}>
                <SortableContext
                  items={tree.ungroupedTaskLists.map((tl) => `task-list:${tl.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {tree.ungroupedTaskLists.length === 0 ? (
                      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                        No ungrouped task lists.
                      </p>
                    ) : (
                      tree.ungroupedTaskLists.map((tl) => (
                        <TaskListCard
                          key={tl.id}
                          taskList={tl}
                          canWrite={canWrite}
                          tasks={tree.tasksByList.get(tl.id) ?? []}
                          frequency={category.frequency}
                          onEditTaskList={() => {
                            setEditingTaskList(tl);
                            setTaskListDefaultSection(null);
                            setTaskListDialogOpen(true);
                          }}
                          onDeleteTaskList={() => setDeleteTaskList(tl)}
                          onAddTask={() => {
                            setEditingTask(null);
                            setTaskDialogTaskListId(tl.id);
                            setTaskDialogOpen(true);
                          }}
                          onEditTask={(t) => {
                            setEditingTask(t);
                            setTaskDialogTaskListId(tl.id);
                            setTaskDialogOpen(true);
                          }}
                          onOpenTask={(t) =>
                            router.push(
                              `/sites/${siteId}/trackers/${trackerId}/tasks/${t.id}`
                            )
                          }
                          onDeleteTask={(t) => setDeleteTask(t)}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </TaskListDropArea>
            </PageSection>
          </div>
        </DndContext>
      )}

      {/* Dialogs */}
      <SectionFormDialog
        open={sectionDialogOpen}
        onOpenChange={setSectionDialogOpen}
        siteTrackerId={trackerId}
        section={editingSection}
      />
      <TaskListFormDialog
        open={taskListDialogOpen}
        onOpenChange={setTaskListDialogOpen}
        siteTrackerId={trackerId}
        sections={tree.sections}
        defaultSectionId={taskListDefaultSection}
        taskList={editingTaskList}
      />
      {taskDialogTaskListId && (
        <TaskFormDialog
          open={taskDialogOpen}
          onOpenChange={setTaskDialogOpen}
          siteId={siteId}
          siteTrackerId={trackerId}
          taskListId={taskDialogTaskListId}
          defaultFrequency={category.frequency}
          task={editingTask}
        />
      )}

      {/* Delete confirmations */}
      <AlertDialog
        open={!!deleteSection}
        onOpenChange={(open) => !open && setDeleteSection(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete section?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteSection?.name}&quot; will be removed. Task lists in this
              section will become ungrouped (not deleted).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSectionMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteSection) return;
                try {
                  await deleteSectionMut.mutateAsync(deleteSection.id);
                  toast.success('Section deleted');
                  setDeleteSection(null);
                } catch (err) {
                  toast.error(
                    err instanceof ApiError ? err.message : 'Failed to delete'
                  );
                }
              }}
            >
              {deleteSectionMut.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTaskList}
        onOpenChange={(open) => !open && setDeleteTaskList(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task list?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTaskList?.name}&quot; and <strong>all its tasks</strong>{' '}
              will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTaskListMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTaskList) return;
                try {
                  await deleteTaskListMut.mutateAsync(deleteTaskList.id);
                  toast.success('Task list deleted');
                  setDeleteTaskList(null);
                } catch (err) {
                  toast.error(
                    err instanceof ApiError ? err.message : 'Failed to delete'
                  );
                }
              }}
            >
              {deleteTaskListMut.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTask}
        onOpenChange={(open) => !open && setDeleteTask(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTask?.name}&quot; will be removed. Any task entries
              generated for it in Phase 2c will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTaskMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTask) return;
                try {
                  await deleteTaskMut.mutateAsync(deleteTask.id);
                  toast.success('Task deleted');
                  setDeleteTask(null);
                } catch (err) {
                  toast.error(
                    err instanceof ApiError ? err.message : 'Failed to delete'
                  );
                }
              }}
            >
              {deleteTaskMut.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

// ============================================================================
// Section card
// ============================================================================

interface SectionCardProps {
  section: TrackerSection;
  canWrite: boolean;
  taskLists: TaskList[];
  tasksByList: Map<string, TaskWithAssignee[]>;
  frequency: Frequency;
  onEditSection: () => void;
  onDeleteSection: () => void;
  onAddTaskList: () => void;
  onEditTaskList: (tl: TaskList) => void;
  onDeleteTaskList: (tl: TaskList) => void;
  onAddTask: (taskListId: string) => void;
  onEditTask: (t: TaskWithAssignee, taskListId: string) => void;
  onOpenTask: (t: TaskWithAssignee) => void;
  onDeleteTask: (t: TaskWithAssignee) => void;
}

function SectionCard({
  section,
  canWrite,
  taskLists,
  tasksByList,
  frequency,
  onEditSection,
  onDeleteSection,
  onAddTaskList,
  onEditTaskList,
  onDeleteTaskList,
  onAddTask,
  onEditTask,
  onOpenTask,
  onDeleteTask,
}: SectionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `section:${section.id}`,
      data: { type: 'section', sectionId: section.id },
    });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <PageCard className="space-y-4">
      <div className="flex items-center gap-2 border-b pb-3">
        <button
          type="button"
          disabled={!canWrite}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 active:cursor-grabbing"
          aria-label="Drag section"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <h3 className="flex-1 text-lg font-semibold">{section.name}</h3>
        {canWrite && (
          <>
            <Button variant="ghost" size="sm" onClick={onAddTaskList}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Task list
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onEditSection}
              aria-label="Edit section"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteSection}
              aria-label="Delete section"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <TaskListDropArea sectionId={section.id}>
        <SortableContext
          items={taskLists.map((tl) => `task-list:${tl.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {taskLists.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                No task lists in this section yet.
              </p>
            ) : (
              taskLists.map((tl) => (
            <TaskListCard
              key={tl.id}
              taskList={tl}
              canWrite={canWrite}
              tasks={tasksByList.get(tl.id) ?? []}
              frequency={frequency}
              onEditTaskList={() => onEditTaskList(tl)}
              onDeleteTaskList={() => onDeleteTaskList(tl)}
              onAddTask={() => onAddTask(tl.id)}
              onEditTask={(t) => onEditTask(t, tl.id)}
              onOpenTask={onOpenTask}
              onDeleteTask={onDeleteTask}
            />
              ))
            )}
          </div>
        </SortableContext>
      </TaskListDropArea>
      </PageCard>
    </div>
  );
}

// ============================================================================
// Task list card
// ============================================================================

interface TaskListCardProps {
  taskList: TaskList;
  canWrite: boolean;
  tasks: TaskWithAssignee[];
  frequency: Frequency;
  onEditTaskList: () => void;
  onDeleteTaskList: () => void;
  onAddTask: () => void;
  onEditTask: (t: TaskWithAssignee) => void;
  onOpenTask: (t: TaskWithAssignee) => void;
  onDeleteTask: (t: TaskWithAssignee) => void;
}

function TaskListCard({
  taskList,
  canWrite,
  tasks,
  frequency,
  onEditTaskList,
  onDeleteTaskList,
  onAddTask,
  onEditTask,
  onOpenTask,
  onDeleteTask,
}: TaskListCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `task-list:${taskList.id}`,
      data: { type: 'task-list', taskListId: taskList.id },
    });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!canWrite}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 active:cursor-grabbing"
          aria-label="Drag task list"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <h4 className="flex-1 text-sm font-semibold">{taskList.name}</h4>
        {canWrite && (
          <>
            <Button variant="ghost" size="sm" onClick={onAddTask}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Task
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onEditTaskList}
              aria-label="Edit task list"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteTaskList}
              aria-label="Delete task list"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      <TaskDropArea taskListId={taskList.id}>
        <SortableContext
          items={tasks.map((task) => `task:${task.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="grid gap-1">
            {tasks.length === 0 ? (
              <li className="rounded-md bg-background/50 p-2 text-center text-xs text-muted-foreground">
                No tasks yet.
              </li>
            ) : (
              tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  canWrite={canWrite}
                  frequency={frequency}
                  onEdit={() => onEditTask(task)}
                  onOpen={() => onOpenTask(task)}
                  onDelete={() => onDeleteTask(task)}
                />
              ))
            )}
          </ul>
        </SortableContext>
      </TaskDropArea>
    </div>
  );
}

function TaskListDropArea({
  sectionId,
  children,
}: {
  sectionId: string | null;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `task-list-container:${sectionId ?? UNGROUPED}`,
    data: { type: 'task-list-container', sectionId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border border-dashed p-1 ${
        isOver ? 'border-primary bg-primary/5' : 'border-transparent'
      }`}
    >
      {children}
    </div>
  );
}

function TaskDropArea({
  taskListId,
  children,
}: {
  taskListId: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `task-container:${taskListId}`,
    data: { type: 'task-container', taskListId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border border-dashed p-1 ${
        isOver ? 'border-primary bg-primary/5' : 'border-transparent'
      }`}
    >
      {children}
    </div>
  );
}

function TaskRow({
  task,
  canWrite,
  frequency,
  onEdit,
  onOpen,
  onDelete,
}: {
  task: TaskWithAssignee;
  canWrite: boolean;
  frequency: Frequency;
  onEdit: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `task:${task.id}`,
      data: { type: 'task', taskId: task.id },
    });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5"
    >
      <button
        type="button"
        disabled={!canWrite}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 active:cursor-grabbing"
        aria-label="Drag task"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{task.name}</span>
          {!task.is_active && (
            <Badge variant="secondary" className="text-[10px]">
              Inactive
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            {task.frequency !== frequency ? `${task.frequency} (override)` : task.frequency}
          </span>
          {task.skip_weekends && <span>skip weekends</span>}
          {task.skip_holidays && <span>skip holidays</span>}
          {task.assignee ? (
            <span className="inline-flex items-center gap-1">
              <UserCircle2 className="h-3 w-3" />
              {task.assignee.name ?? task.assignee.email}
            </span>
          ) : (
            <span className="italic">unassigned</span>
          )}
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={onOpen} aria-label="Open entries">
        <ListChecks className="h-3.5 w-3.5" />
      </Button>

      {canWrite && (
        <>
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Edit task">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label="Delete task"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </li>
  );
}
