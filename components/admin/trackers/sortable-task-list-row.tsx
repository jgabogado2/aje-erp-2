'use client';

import type { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import type { UseFormRegister } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TrackerFormValues } from './tracker-form-types';

interface SortableTaskListRowProps {
  /** Stable client-side id (form value `id`, not RHF field id). */
  id: string;
  /** Index into the flat `task_lists` field array. */
  flatIndex: number;
  register: UseFormRegister<TrackerFormValues>;
  onRemove: () => void;
}

export function SortableTaskListRow({
  id,
  flatIndex,
  register,
  onRemove,
}: SortableTaskListRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Input
        placeholder="Task list name (e.g. DCR, EWT Filing)"
        className="flex-1 border-0 shadow-none focus-visible:ring-1"
        {...register(`task_lists.${flatIndex}.name` as const)}
      />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        aria-label="Remove task list"
        className="text-muted-foreground hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
