'use client';

import { use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { PageCard, PageContainer } from '@/components/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useRegenerateTaskEntries,
  useTaskEntries,
  useUpdateTaskEntry,
} from '@/hooks/use-task-entries';
import { ApiError } from '@/lib/api-client';
import {
  BIR_STATUSES,
  TASK_STATUSES,
  type BirStatus,
  type TaskStatus,
} from '@/lib/tracker.types';
import type { TaskEntry } from '@/types/domain';

type PageProps = {
  params: Promise<{ siteId: string; trackerId: string; taskId: string }>;
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_DONE: 'Not done',
  ONGOING: 'Ongoing',
  DONE: 'Done',
  DONE_LATE: 'Done late',
};

const BIR_LABEL: Record<BirStatus, string> = {
  NO_SUBMISSION: 'No submission',
  SUBMITTED_TO_FRG: 'Submitted to FRG',
  APPROVED_FOR_FILING: 'Approved for filing',
  FILED_FOR_PAYMENT: 'Filed for payment',
  FILED_AND_PAID: 'Filed and paid',
  FILED_NO_PAYMENT: 'Filed no payment',
};

export default function TaskEntriesPage({ params }: PageProps) {
  const { siteId, trackerId, taskId } = use(params);
  const router = useRouter();
  const { data: session, status } = useSession();
  const entriesQuery = useTaskEntries(taskId);
  const updateEntry = useUpdateTaskEntry(taskId);
  const regenerate = useRegenerateTaskEntries(taskId);

  if (status === 'loading') return null;
  if (!session) {
    router.replace('/signin');
    return null;
  }

  if (entriesQuery.isError) {
    return (
      <PageContainer title="Task entries" breadcrumbs={[{ label: 'Sites', href: '/admin/sites' }]}>
        <PageCard>
          <div className="p-8 text-center text-sm text-destructive">
            {entriesQuery.error instanceof ApiError && entriesQuery.error.status === 403
              ? 'You do not have access to this task.'
              : 'Failed to load task entries.'}
          </div>
        </PageCard>
      </PageContainer>
    );
  }

  const payload = entriesQuery.data;
  if (entriesQuery.isLoading || !payload) {
    return (
      <PageContainer title="Loading…" breadcrumbs={[{ label: 'Sites', href: '/admin/sites' }]}>
        <PageCard>
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        </PageCard>
      </PageContainer>
    );
  }

  const taskList = payload.task_list;
  const tracker = taskList.site_tracker;
  const category = tracker.tracker_category;
  const site = tracker.site;
  const isBir = taskList.frequency === 'BIR';
  const canRegenerate =
    session.userRole?.role === 'SUPER_ADMIN' || session.userRole?.role === 'SITE_MANAGER';

  const patchEntry = async (entry: TaskEntry, input: Parameters<typeof updateEntry.mutateAsync>[0]['input']) => {
    try {
      await updateEntry.mutateAsync({ id: entry.id, input });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update entry');
    }
  };

  return (
    <PageContainer
      breadcrumbs={[
        { label: 'Sites', href: '/admin/sites' },
        { label: site.name, href: `/sites/${siteId}` },
        { label: category.name, href: `/sites/${siteId}/trackers/${trackerId}` },
        { label: taskList.name },
      ]}
      title={taskList.name}
      description={`${category.name} · ${tracker.year}`}
      actions={
        canRegenerate ? (
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const result = await regenerate.mutateAsync(undefined);
                toast.success(`Regenerated ${result.inserted} future entries`);
              } catch (err) {
                toast.error(
                  err instanceof ApiError ? err.message : 'Failed to regenerate entries'
                );
              }
            }}
            disabled={regenerate.isPending}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {regenerate.isPending ? 'Regenerating…' : 'Regenerate'}
          </Button>
        ) : null
      }
    >
      <PageCard className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              {isBir && <TableHead>BIR</TableHead>}
              {taskList.subtasks.length > 0 && <TableHead>Subtasks</TableHead>}
              <TableHead>Submission</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Marked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payload.entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={(isBir ? 7 : 6) + (taskList.subtasks.length > 0 ? 1 : 0)}
                  className="h-24 text-center text-muted-foreground"
                >
                  No entries generated for this task item.
                </TableCell>
              </TableRow>
            ) : (
              payload.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div className="font-medium">{entry.period_label}</div>
                    <div className="text-xs text-muted-foreground">{entry.period_date}</div>
                  </TableCell>
                  <TableCell>{entry.due_date}</TableCell>
                  <TableCell>
                    <Select
                      value={entry.status}
                      onChange={(event) =>
                        patchEntry(entry, { status: event.target.value as TaskStatus })
                      }
                      className="min-w-32"
                    >
                      {TASK_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  {isBir && (
                    <TableCell>
                      <Select
                        value={entry.bir_status ?? 'NO_SUBMISSION'}
                        onChange={(event) =>
                          patchEntry(entry, {
                            bir_status: event.target.value as BirStatus,
                          })
                        }
                        className="min-w-44"
                      >
                        {BIR_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {BIR_LABEL[status]}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                  )}
                  {taskList.subtasks.length > 0 && (
                    <TableCell>
                      <div className="grid min-w-48 gap-1">
                        {taskList.subtasks.map((subtask) => {
                          const completed = entry.subtask_completions.includes(subtask.id);
                          return (
                            <label key={subtask.id} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={completed}
                                onChange={(event) => {
                                  const next = event.currentTarget.checked
                                    ? [...entry.subtask_completions, subtask.id]
                                    : entry.subtask_completions.filter((id) => id !== subtask.id);
                                  patchEntry(entry, { subtask_completions: next });
                                }}
                                disabled={updateEntry.isPending}
                              />
                              <span>{subtask.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <Input
                      type="date"
                      defaultValue={entry.submission_date ?? ''}
                      onBlur={(event) =>
                        patchEntry(entry, {
                          submission_date: event.currentTarget.value || null,
                        })
                      }
                      className="min-w-36"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={entry.note ?? ''}
                      onBlur={(event) =>
                        patchEntry(entry, { note: event.currentTarget.value || null })
                      }
                      className="min-w-48"
                    />
                  </TableCell>
                  <TableCell>
                    <MarkedCell entry={entry} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </PageCard>
    </PageContainer>
  );
}

function MarkedCell({ entry }: { entry: TaskEntry }) {
  if (!entry.marked_at) {
    return <span className="text-xs text-muted-foreground">Never</span>;
  }

  return (
    <div className="space-y-1">
      <Badge variant={entry.status === 'DONE_LATE' ? 'destructive' : 'secondary'}>
        {STATUS_LABEL[entry.status]}
      </Badge>
      <div className="text-xs text-muted-foreground">
        {entry.marker?.name ?? entry.marker?.email ?? 'Unknown'} ·{' '}
        {new Date(entry.marked_at).toLocaleString()}
      </div>
    </div>
  );
}
