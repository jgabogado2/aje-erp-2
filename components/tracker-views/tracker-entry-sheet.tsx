'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar, StickyNote, Paperclip, CheckSquare } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { AttachmentList } from '@/components/attachments/attachment-list';
import { AttachmentUploader } from '@/components/attachments/attachment-uploader';
import { STATUS_LABEL, BIR_LABEL } from '@/components/tracker-views/tracker-status-select';
import { BIR_STATUSES, TASK_STATUSES, type BirStatus, type TaskStatus } from '@/lib/tracker.types';
import type { TaskEntry, TaskListWithAssignee, Task } from '@/types/domain';

interface TrackerEntrySheetProps {
  entry: TaskEntry | null;
  taskList: TaskListWithAssignee | null;
  subtasks: Task[];
  isBir: boolean;
  isPending: boolean;
  onClose: () => void;
  onPatch: (
    entryId: string,
    input: {
      status?: TaskStatus;
      bir_status?: BirStatus | null;
      submission_date?: string | null;
      note?: string | null;
      subtask_completions?: string[];
    }
  ) => void;
}

const STATUS_DOT: Record<TaskStatus, string> = {
  DONE: 'bg-emerald-500',
  DONE_LATE: 'bg-orange-500',
  ONGOING: 'bg-blue-500',
  NOT_DONE: 'bg-gray-300',
};

export function TrackerEntrySheet({
  entry,
  taskList,
  subtasks,
  isBir,
  isPending,
  onClose,
  onPatch,
}: TrackerEntrySheetProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'attachments'>('details');

  if (!entry || !taskList) return null;

  const tabs = [
    { key: 'details', label: 'Details', icon: StickyNote },
    { key: 'attachments', label: 'Files', icon: Paperclip },
  ] as const;

  return (
    <Sheet open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg" side="right">
        {/* Header */}
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[entry.status]}`} />
            <SheetTitle className="text-base font-semibold leading-tight">
              {taskList.name}
            </SheetTitle>
          </div>
          <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-normal">
              {entry.period_label}
            </Badge>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Due {format(new Date(entry.due_date + 'T00:00:00'), 'MMM d, yyyy')}
            </span>
            {taskList.assignee && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {taskList.assignee.name ?? taskList.assignee.email}
                </span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex border-b">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                activeTab === key
                  ? 'border-b-2 border-primary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'details' ? (
            <div className="space-y-5">
              {/* Status */}
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Status
                </Label>
                <Select
                  value={entry.status}
                  onChange={(e) => onPatch(entry.id, { status: e.target.value as TaskStatus })}
                  disabled={isPending}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </Select>
              </div>

              {/* BIR status */}
              {isBir && (
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    BIR filing status
                  </Label>
                  <Select
                    value={entry.bir_status ?? 'NO_SUBMISSION'}
                    onChange={(e) =>
                      onPatch(entry.id, { bir_status: e.target.value as BirStatus })
                    }
                    disabled={isPending}
                  >
                    {BIR_STATUSES.map((s) => (
                      <option key={s} value={s}>{BIR_LABEL[s]}</option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Completion date */}
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Submission date
                </Label>
                <Input
                  type="date"
                  defaultValue={entry.submission_date ?? ''}
                  onBlur={(e) =>
                    onPatch(entry.id, { submission_date: e.currentTarget.value || null })
                  }
                  disabled={isPending}
                />
              </div>

              {/* Notes */}
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Notes
                </Label>
                <textarea
                  defaultValue={entry.note ?? ''}
                  onBlur={(e) =>
                    onPatch(entry.id, { note: e.currentTarget.value || null })
                  }
                  disabled={isPending}
                  rows={3}
                  placeholder="Add a note…"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                />
              </div>

              {/* Subtasks */}
              {subtasks.length > 0 && (
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <CheckSquare className="h-3.5 w-3.5" />
                    Subtasks ({entry.subtask_completions.length}/{subtasks.length})
                  </Label>
                  <div className="rounded-md border divide-y">
                    {subtasks.map((subtask) => {
                      const completed = entry.subtask_completions.includes(subtask.id);
                      return (
                        <label
                          key={subtask.id}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            checked={completed}
                            onChange={(e) => {
                              const next = e.currentTarget.checked
                                ? [...entry.subtask_completions, subtask.id]
                                : entry.subtask_completions.filter((id) => id !== subtask.id);
                              onPatch(entry.id, { subtask_completions: next });
                            }}
                            disabled={isPending}
                            className="h-4 w-4 rounded"
                          />
                          <span className={completed ? 'line-through text-muted-foreground' : ''}>
                            {subtask.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <AttachmentUploader taskEntryId={entry.id} />
              <AttachmentList taskEntryId={entry.id} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
