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

const STEPS = ['Basics', 'Sections', 'Task items', 'Review'] as const;

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
        name: z.string().trim().min(1, 'Task item name is required').max(120),
        section_id: z.string().min(1),
        frequency: z.enum(FREQUENCIES),
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

    // Task list names must be unique within each section. Mirrors the DB
    // constraint enforced on instantiation; surfacing it here means the
    // wizard refuses to save bad data instead of waiting for assign-time.
    const seenInSection = new Map<string, number>();
    for (const [i, taskList] of val.task_lists.entries()) {
      const key = `${taskList.section_id}::${taskList.name.trim().toLowerCase()}`;
      if (seenInSection.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['task_lists', i, 'name'],
          message: 'Task item names must be unique within their section',
        });
      } else {
        seenInSection.set(key, i);
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
      frequency: taskList.frequency ?? category.frequency,
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
    reset,
    setValue,
    getValues,
    trigger,
    formState: { errors },
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
      frequency: getValues('frequency'),
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

  // The Save button is wired to this directly (not via form submit). Form
  // submission is intentionally disabled on the <form> element, so the only
  // way to save is an explicit click on the Confirm button on the Review
  // step. This makes accidental saves structurally impossible.
  const handleConfirmAndSave = async () => {
    // Final validation across all fields before saving.
    const ok = await trigger();
    if (!ok) {
      toast.error('Please fix the highlighted errors first');
      return;
    }
    const values = getValues();
    await persistCategory(values);
  };

  const persistCategory = async (values: TrackerFormValues) => {
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
        frequency: taskList.frequency,
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
  const isPersisting = createMutation.isPending || updateMutation.isPending;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setStep(0);
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        {/*
          NOTE: this is a <div>, not a <form>. Saving goes through an
          explicit Button onClick on the Review step. We deliberately avoid
          form submission so Enter / focus / double-click can't ever trigger
          a save behind the user's back. Any pre-submit validation is done
          with RHF's `trigger()` inside the click handler.
        */}
        <div
          onKeyDown={(e) => {
            // Belt-and-braces: Enter inside any input becomes a no-op for
            // non-textarea fields. Stops a stray Enter from clicking a
            // focused button.
            if (e.key !== 'Enter') return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'TEXTAREA') return;
            e.preventDefault();
          }}
        >
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
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
                    <h3 className="text-base font-semibold">Review &amp; confirm</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This is your last chance to make changes. Use{' '}
                      <span className="font-medium">Back</span> to edit anything, or{' '}
                      <span className="font-medium">Confirm &amp; {isEdit ? 'save' : 'create'}</span>{' '}
                      to commit. Nothing is saved until you click the button below.
                    </p>
                  </div>
                  <div className="rounded-md border p-4">
                    <div className="flex items-center gap-2 font-semibold">
                      <Layers className="h-4 w-4" />
                      {getValues('name') || 'Untitled tracker'}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {FREQ_LABEL[frequency]} · {sectionValues.length} sections ·{' '}
                      {taskListValues.length} task items
                    </p>
                  </div>
                  {sectionValues.map((section) => (
                    <div key={section.id} className="rounded-md border p-4">
                      <h3 className="text-sm font-semibold">{section.name || 'Untitled section'}</h3>
                      <div className="mt-2 grid gap-1">
                        {(taskListsBySection.get(section.id) ?? []).length === 0 ? (
                          <p className="text-sm text-muted-foreground">No task items</p>
                        ) : (
                          (taskListsBySection.get(section.id) ?? []).map(({ value }) => (
                            <div
                              key={value.id}
                              className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-sm"
                            >
                              <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="flex-1">{value.name || 'Untitled task item'}</span>
                              <span className="text-xs text-muted-foreground">
                                {FREQ_LABEL[value.frequency]}
                              </span>
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
              disabled={isPersisting}
            >
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={nextStep} disabled={isPersisting}>
                Next
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleConfirmAndSave}
                disabled={isPersisting}
              >
                {isPersisting
                  ? 'Saving...'
                  : isEdit
                    ? 'Confirm & save changes'
                    : 'Confirm & create category'}
              </Button>
            )}
          </DialogFooter>
        </div>
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
          Task item
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
            <p className="p-2 text-center text-xs text-muted-foreground">No task items in this section</p>
          ) : (
            items.map(({ value, flatIndex }) => (
              <SortableWizardTaskListRow
                key={value.id}
                id={value.id}
                sectionId={section.id}
                registerName={register(`task_lists.${flatIndex}.name` as const)}
                registerFrequency={register(`task_lists.${flatIndex}.frequency` as const)}
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
  registerFrequency,
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
  registerFrequency: ReturnType<typeof useForm<TrackerFormValues>>['register'] extends (
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
          aria-label="Drag task item"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Input placeholder="Task item name" className="flex-1" {...registerName} />
        <Select className="w-36" aria-label="Task item frequency" {...registerFrequency}>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQ_LABEL[f]}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label="Remove task item"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
