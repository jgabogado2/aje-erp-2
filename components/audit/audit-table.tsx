'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  PlusCircle,
  PencilLine,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditLogEntry } from '@/types/domain';

const ENTITY_LABEL: Record<AuditLogEntry['entity_type'], string> = {
  task_entry: 'Task entry',
  site: 'Site',
  user: 'User',
  tracker_category: 'Tracker category',
  site_tracker: 'Site tracker',
  tracker_section: 'Section',
  task_list: 'Task item',
  task: 'Subtask',
  holiday: 'Holiday',
};

function actionIcon(action: AuditLogEntry['action']) {
  switch (action) {
    case 'create':
      return <PlusCircle className="h-4 w-4 text-emerald-600" />;
    case 'update':
      return <PencilLine className="h-4 w-4 text-blue-600" />;
    case 'delete':
      return <Trash2 className="h-4 w-4 text-destructive" />;
    case 'status_change':
      return <CheckCircle2 className="h-4 w-4 text-violet-600" />;
  }
}

interface AuditTableProps {
  rows: AuditLogEntry[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
}

export function AuditTable({
  rows,
  isLoading,
  hasMore,
  onLoadMore,
  isLoadingMore,
}: AuditTableProps) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="rounded-md border divide-y">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-3">
            <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No audit entries match these filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-background">
        <ul className="divide-y">
          {rows.map((row) => (
            <AuditRow key={row.id} row={row} />
          ))}
        </ul>
      </div>
      {hasMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

function AuditRow({ row }: { row: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff =
    (row.old_value && Object.keys(row.old_value).length > 0) ||
    (row.new_value && Object.keys(row.new_value).length > 0);

  return (
    <li className="px-3 py-2">
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setExpanded((v) => !v)}
        disabled={!hasDiff}
      >
        <div className="mt-0.5">
          {hasDiff ? (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <span className="block h-4 w-4" />
          )}
        </div>
        <div className="mt-0.5 shrink-0">{actionIcon(row.action)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium">
              {ENTITY_LABEL[row.entity_type]}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {row.action.replace('_', ' ')}
            </Badge>
            {row.site && (
              <span className="text-xs text-muted-foreground">
                · {row.site.name} ({row.site.code})
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {row.actor?.name ?? row.actor?.email ?? 'Unknown user'} ·{' '}
            {format(new Date(row.created_at), 'MMM d, yyyy h:mm a')}
          </div>
        </div>
      </button>

      {expanded && hasDiff && (
        <div className="mt-2 ml-10 rounded-md border bg-muted/30 p-3 text-xs">
          <DiffBlock oldValue={row.old_value} newValue={row.new_value} />
        </div>
      )}
    </li>
  );
}

function DiffBlock({
  oldValue,
  newValue,
}: {
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}) {
  // Build a unified field list. For create-only / delete-only events one
  // side is null and we just render the populated side.
  const keys = new Set<string>([
    ...Object.keys(oldValue ?? {}),
    ...Object.keys(newValue ?? {}),
  ]);
  if (keys.size === 0) return <p className="text-muted-foreground">No field changes.</p>;

  return (
    <ul className="grid gap-1.5">
      {Array.from(keys).map((key) => {
        const before = oldValue?.[key];
        const after = newValue?.[key];
        return (
          <li key={key} className="grid grid-cols-[120px_1fr] gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{key}</span>
            <span>
              {oldValue && newValue ? (
                <>
                  <span className="text-rose-700 dark:text-rose-300">
                    {formatValue(before)}
                  </span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="text-emerald-700 dark:text-emerald-300">
                    {formatValue(after)}
                  </span>
                </>
              ) : (
                <span>{formatValue(after ?? before)}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '<unserializable>';
  }
}
