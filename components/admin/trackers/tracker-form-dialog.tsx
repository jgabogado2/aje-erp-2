'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Check, GripVertical, Layers, ListChecks, Plus, X } from 'lucide-react';
import { z } from 'zod';
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

import { ApiError } from '@/lib/api-client';
import {
  useCreateTrackerCategory,
  useUpdateTrackerCategory,
} from '@/hooks/use-tracker-categories';
import { FREQUENCIES, type Frequency } from '@/lib/tracker.types';
import type { TrackerCategoryCreateInput } from '@/lib/validations/tracker';
import type { TrackerCategory } from '@/types/domain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  TrackerFormValues,
  TrackerFormSection,
  TrackerFormTaskList,
} from './tracker-form-types';

const FREQ_LABEL: Record<Frequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annual',
  BIR: 'BIR',
  CUSTOM: 'Custom',
};

const STEPS = ['Basics', 'Sections', 'Task lists', 'Review'] as const;

const formSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    frequency: z.enum(FREQUENCIES),
    sections: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().trim().min(1, 'Section name is required').max(120),
        })
      )
      .min(1, 'Add at least one section'),
    task_lists: z.array(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1, 'Task list name is required').max(120),
        section_id: z.string().min(1),
      })
    ),
  })
  .superRefine((val, ctx) => {
    const seen = new Set<string>();
    for (const [i, section] of val.sections.entries()) {
      const key = section.name.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections', i, 'name'],
          message: 'Section names must be unique',
        });
      }
      seen.add(key);
    }

    const sectionIds = new Set(val.sections.map((section) => section.id));
    for (const [i, taskList] of val.task_lists.entries()) {
      if (!sectionIds.has(taskList.section_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['task_lists', i, 'section_id'],
          message: 'Pick a section',
        });
      }
    }
  });

interface TrackerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: TrackerCategory | null;
}

function defaultValuesFor(category?: TrackerCategory | null): TrackerFormValues {
  if (!category) {
    const firstSectionId = crypto.randomUUID();
    return {
      name: '',
      description: '',
      frequency: 'MONTHLY',
      sections: [{ id: firstSectionId, name: '' }],
      task_lists: [],
    };
  }

  const sections: TrackerFormSection[] = category.section_templates.map((section) => ({
    id: crypto.randomUUID(),
    name: section.name,
  }));
  const idByName = new Map(sections.map((section) => [section.name, section.id]));
  const fallbackSectionId = sections[0]?.id ?? crypto.randomUUID();

  return {
    name: category.name,
    description: category.description ?? '',
    frequency: category.frequency,
    sections: sections.length > 0 ? sections : [{ id: fallbackSectionId, name: '' }],
    task_lists: category.task_list_templates.map((taskList) => ({
      id: crypto.randomUUID(),
      name: taskList.name,
      section_id:
        (taskList.section && idByName.get(taskList.section)) || fallbackSectionId,
    })),
  };
}

export function TrackerFormDialog({ open, onOpenChange, category }: TrackerFormDialogProps) {
  const isEdit = !!category;
  const [step, setStep] = useState(0);
  const createMutation = useCreateTrackerCategory();
  const updateMutation = useUpdateTrackerCategory(category?.id ?? '');

  const form = useForm<TrackerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValuesFor(category),
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = form;

  const sectionsArray = useFieldArray({
    control,
    name: 'sections',
    keyName: 'fieldId',
  });
  const taskListsArray = useFieldArray({
    control,
    name: 'task_lists',
    keyName: 'fieldId',
  });

  const watchedSections = useWatch({ control, name: 'sections' });
  const watchedTaskLists = useWatch({ control, name: 'task_lists' });
  const sectionValues = useMemo(() => watchedSections ?? [], [watchedSections]);
  const taskListValues = useMemo(() => watchedTaskLists ?? [], [watchedTaskLists]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!open) return;
    reset(defaultValuesFor(category));
  }, [open, category, reset]);

  const taskListsBySection = useMemo(() => {
    const map = new Map<string, Array<{ value: TrackerFormTaskList; flatIndex: number }>>();
    for (const section of sectionValues) map.set(section.id, []);
    taskListValues.forEach((taskList, idx) => {
      map.get(taskList.section_id)?.push({ value: taskList, flatIndex: idx });
    });
    return map;
  }, [sectionValues, taskListValues]);

  function addSection() {
    sectionsArray.append({ id: crypto.randomUUID(), name: '' });
  }

  function removeSection(sectionIndex: number) {
    if (sectionValues.length === 1) {
      toast.error('At least one section is required');
      return;
    }

    const section = sectionValues[sectionIndex];
    const fallback = sectionValues.find((candidate) => candidate.id !== section?.id);
    if (section && fallback) {
      setValue(
        'task_lists',
        getValues('task_lists').map((taskList) =>
          taskList.section_id === section.id
            ? { ...taskList, section_id: fallback.id }
            : taskList
        ),
        { shouldDirty: true, shouldValidate: true }
      );
    }
    sectionsArray.remove(sectionIndex);
  }

  function addTaskList(sectionId: string) {
    taskListsArray.append({
      id: crypto.randomUUID(),
      name: '',
      section_id: sectionId,
    });
  }

  function removeTaskList(flatIndex: number) {
    taskListsArray.remove(flatIndex);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as
      | { type: 'section'; sectionId: string }
      | { type: 'task-list'; taskListId: string; sectionId: string }
      | undefined;
    const overData = over.data.current as
      | { type: 'section'; sectionId: string }
      | { type: 'task-list'; taskListId: string; sectionId: string }
      | { type: 'task-list-container'; sectionId: string }
      | undefined;

    if (activeData?.type === 'section' && overData?.type === 'section') {
      const from = sectionValues.findIndex((section) => section.id === activeData.sectionId);
      const to = sectionValues.findIndex((section) => section.id === overData.sectionId);
      if (from >= 0 && to >= 0) sectionsArray.move(from, to);
      return;
    }

    if (activeData?.type !== 'task-list' || !overData) return;

    const current = getValues('task_lists');
    const from = current.findIndex((taskList) => taskList.id === activeData.taskListId);
    if (from < 0) return;

    const moving = current[from];
    const withoutMoving = current.filter((taskList) => taskList.id !== moving.id);
    const targetSectionId =
      overData.type === 'task-list-container' ? overData.sectionId : overData.sectionId;
    let insertAt = withoutMoving.length;

    if (overData.type === 'task-list') {
      const overIndex = withoutMoving.findIndex(
        (taskList) => taskList.id === overData.taskListId
      );
      insertAt = overIndex >= 0 ? overIndex : withoutMoving.length;
    } else {
      const lastInSection = withoutMoving
        .map((taskList, idx) => ({ taskList, idx }))
        .filter(({ taskList }) => taskList.section_id === targetSectionId)
        .at(-1);
      insertAt = lastInSection ? lastInSection.idx + 1 : withoutMoving.length;
    }

    const next = [...withoutMoving];
    next.splice(insertAt, 0, { ...moving, section_id: targetSectionId });
    setValue('task_lists', next, { shouldDirty: true, shouldValidate: true });
  }

  async function nextStep() {
    const ok =
      step === 0
        ? await trigger(['name', 'description', 'frequency'])
        : step === 1
          ? await trigger('sections')
          : step === 2
            ? await trigger(['sections', 'task_lists'])
            : true;
    if (ok) setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  const onSubmit = async (values: TrackerFormValues) => {
    const sectionNameById = new Map(
      values.sections.map((section) => [section.id, section.name.trim()])
    );
    const orderedTaskLists = values.sections.flatMap((section) =>
      values.task_lists.filter((taskList) => taskList.section_id === section.id)
    );

    const payload: TrackerCategoryCreateInput = {
      name: values.name.trim(),
      description: values.description?.trim() ? values.description.trim() : null,
      frequency: values.frequency,
      section_templates: values.sections.map((section, i) => ({
        name: section.name.trim(),
        order: i,
      })),
      task_list_templates: orderedTaskLists.map((taskList, i) => ({
        name: taskList.name.trim(),
        order: i,
        section: sectionNameById.get(taskList.section_id) ?? '',
      })),
    };

    try {
      if (isEdit && category) {
        await updateMutation.mutateAsync(payload);
        toast.success(`"${payload.name}" updated`);
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(`"${payload.name}" created`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const frequency = getValues('frequency');

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setStep(0);
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? 'Edit tracker category' : 'Create tracker category'}
            </DialogTitle>
            <DialogDescription>
              Build the reusable structure that will be assigned to sites.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="mb-5 grid grid-cols-4 gap-2">
              {STEPS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(idx)}
                  className={`flex h-10 items-center justify-center rounded-md border text-sm transition-colors ${
                    idx === step
                      ? 'border-primary bg-primary text-primary-foreground'
                      : idx < step
                        ? 'border-primary/30 bg-primary/5 text-foreground'
                        : 'bg-background text-muted-foreground'
                  }`}
                >
                  {idx < step ? <Check className="mr-1 h-3.5 w-3.5" /> : null}
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[62vh] overflow-y-auto pr-2">
              {step === 0 && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="tc-name">Name</Label>
                    <Input
                      id="tc-name"
                      placeholder="e.g. Daily Operations"
                      {...register('name')}
                    />
                    {errors.name && (
                      <p className="text-sm text-destructive">{errors.name.message}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tc-description">Description</Label>
                    <Input
                      id="tc-description"
                      placeholder="What this category covers"
                      {...register('description')}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tc-frequency">Frequency</Label>
                    <Select id="tc-frequency" {...register('frequency')}>
                      {FREQUENCIES.map((item) => (
                        <option key={item} value={item}>
                          {FREQ_LABEL[item]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              )}

              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToWindowEdges]}
              >
                {step === 1 && (
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between">
                      <Label>Sections</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addSection}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Section
                      </Button>
                    </div>
                    {errors.sections?.message && (
                      <p className="text-sm text-destructive">{errors.sections.message}</p>
                    )}
                    <SortableContext
                      items={sectionValues.map((section) => `section:${section.id}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="grid gap-2">
                        {sectionsArray.fields.map((field, idx) => {
                          const section = sectionValues[idx];
                          if (!section) return null;
                          return (
                            <SortableSectionRow
                              key={field.fieldId}
                              id={section.id}
                              registerName={register(`sections.${idx}.name` as const)}
                              error={errors.sections?.[idx]?.name?.message}
                              disableRemove={sectionValues.length === 1}
                              onRemove={() => removeSection(idx)}
                            />
                          );
                        })}
                      </div>
                    </SortableContext>
                  </div>
                )}

                {step === 2 && (
                  <div className="grid gap-3">
                    {sectionValues.map((section) => {
                      const bucket = taskListsBySection.get(section.id) ?? [];
                      return (
                        <TaskListDropSection
                          key={section.id}
                          section={section}
                          items={bucket}
                          register={register}
                          onAdd={() => addTaskList(section.id)}
                          onRemove={removeTaskList}
                          errors={errors.task_lists}
                        />
                      );
                    })}
                  </div>
                )}
              </DndContext>

              {step === 3 && (
                <div className="grid gap-4">
                  <div className="rounded-md border p-4">
                    <div className="flex items-center gap-2 font-semibold">
                      <Layers className="h-4 w-4" />
                      {getValues('name') || 'Untitled tracker'}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {FREQ_LABEL[frequency]} · {sectionValues.length} sections ·{' '}
                      {taskListValues.length} task lists
                    </p>
                  </div>
                  {sectionValues.map((section) => (
                    <div key={section.id} className="rounded-md border p-4">
                      <h3 className="text-sm font-semibold">{section.name || 'Untitled section'}</h3>
                      <div className="mt-2 grid gap-1">
                        {(taskListsBySection.get(section.id) ?? []).length === 0 ? (
                          <p className="text-sm text-muted-foreground">No task lists</p>
                        ) : (
                          (taskListsBySection.get(section.id) ?? []).map(({ value }) => (
                            <div
                              key={value.id}
                              className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-sm"
                            >
                              <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                              {value.name || 'Untitled task list'}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
              disabled={isSubmitting}
            >
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={nextStep} disabled={isSubmitting}>
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create category'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SortableSectionRow({
  id,
  registerName,
  error,
  disableRemove,
  onRemove,
}: {
  id: string;
  registerName: ReturnType<typeof useForm<TrackerFormValues>>['register'] extends (
    name: infer _Name
  ) => infer R
    ? R
    : never;
  error?: string;
  disableRemove: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `section:${id}`, data: { type: 'section', sectionId: id } });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border bg-background p-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label="Drag section"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Input placeholder="Section name" className="flex-1" {...registerName} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={disableRemove}
          aria-label="Remove section"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function TaskListDropSection({
  section,
  items,
  register,
  onAdd,
  onRemove,
  errors,
}: {
  section: TrackerFormSection;
  items: Array<{ value: TrackerFormTaskList; flatIndex: number }>;
  register: ReturnType<typeof useForm<TrackerFormValues>>['register'];
  onAdd: () => void;
  onRemove: (flatIndex: number) => void;
  errors: ReturnType<typeof useForm<TrackerFormValues>>['formState']['errors']['task_lists'];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `task-list-container:${section.id}`,
    data: { type: 'task-list-container', sectionId: section.id },
  });

  return (
    <div ref={setNodeRef} className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{section.name || 'Untitled section'}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Task list
        </Button>
      </div>
      <SortableContext
        items={items.map(({ value }) => `task-list:${value.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div
          className={`grid min-h-12 gap-1.5 rounded-md border border-dashed p-1.5 ${
            isOver ? 'border-primary bg-primary/5' : 'border-transparent'
          }`}
        >
          {items.length === 0 ? (
            <p className="p-2 text-center text-xs text-muted-foreground">No task lists</p>
          ) : (
            items.map(({ value, flatIndex }) => (
              <SortableWizardTaskListRow
                key={value.id}
                id={value.id}
                sectionId={section.id}
                registerName={register(`task_lists.${flatIndex}.name` as const)}
                error={errors?.[flatIndex]?.name?.message}
                onRemove={() => onRemove(flatIndex)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableWizardTaskListRow({
  id,
  sectionId,
  registerName,
  error,
  onRemove,
}: {
  id: string;
  sectionId: string;
  registerName: ReturnType<typeof useForm<TrackerFormValues>>['register'] extends (
    name: infer _Name
  ) => infer R
    ? R
    : never;
  error?: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `task-list:${id}`,
      data: { type: 'task-list', taskListId: id, sectionId },
    });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border bg-background p-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label="Drag task list"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Input placeholder="Task list name" className="flex-1" {...registerName} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label="Remove task list"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
