'use client';

import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TASK_STATUSES, type TaskStatus } from '@/lib/tracker.types';
import type { TaskListWithAssignee } from '@/types/domain';

export interface TrackerViewFilters {
  search?: string;
  status?: TaskStatus;
  assignee?: string;
  task_list_id?: string;
}

export function TrackerViewToolbar({
  filters,
  taskLists,
  onChange,
  onRefresh,
  siteTrackerId,
}: {
  filters: TrackerViewFilters;
  taskLists: TaskListWithAssignee[];
  onChange: (filters: TrackerViewFilters) => void;
  onRefresh: () => void;
  siteTrackerId?: string;
}) {
  const assignees = new Map<string, string>();
  for (const taskList of taskLists) {
    if (taskList.assignee && taskList.assigned_to) {
      assignees.set(taskList.assigned_to, taskList.assignee.name ?? taskList.assignee.email);
    }
  }

  const exportQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) exportQuery.set(key, String(value));
  }
  const exportSuffix = exportQuery.toString() ? `?${exportQuery.toString()}` : '';

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3 lg:flex-row">
      <Input
        value={filters.search ?? ''}
        onChange={(event) => onChange({ ...filters, search: event.target.value || undefined })}
        placeholder="Search task items"
        className="lg:max-w-64"
      />
      <Select
        value={filters.status ?? ''}
        onChange={(event) =>
          onChange({
            ...filters,
            status: (event.target.value || undefined) as TaskStatus | undefined,
          })
        }
        className="lg:max-w-44"
      >
        <option value="">All statuses</option>
        {TASK_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status.replaceAll('_', ' ')}
          </option>
        ))}
      </Select>
      <Select
        value={filters.assignee ?? ''}
        onChange={(event) => onChange({ ...filters, assignee: event.target.value || undefined })}
        className="lg:max-w-56"
      >
        <option value="">All assignees</option>
        {[...assignees.entries()].map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>
      <Select
        value={filters.task_list_id ?? ''}
        onChange={(event) =>
          onChange({ ...filters, task_list_id: event.target.value || undefined })
        }
        className="lg:max-w-56"
      >
        <option value="">All task items</option>
        {taskLists.map((taskList) => (
          <option key={taskList.id} value={taskList.id}>
            {taskList.name}
          </option>
        ))}
      </Select>
      {siteTrackerId && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="lg:ml-auto">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={`/api/site-trackers/${siteTrackerId}/export.xlsx${exportSuffix}`}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/api/site-trackers/${siteTrackerId}/export.pdf${exportSuffix}`}>
                <FileText className="h-4 w-4" />
                PDF
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={onRefresh}
        className={siteTrackerId ? undefined : 'lg:ml-auto'}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Refresh
      </Button>
    </div>
  );
}
