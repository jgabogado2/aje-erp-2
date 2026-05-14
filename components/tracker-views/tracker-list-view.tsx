'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackerAnnualList } from '@/components/tracker-views/tracker-annual-list';
import { TrackerEntrySheet } from '@/components/tracker-views/tracker-entry-sheet';
import { TrackerGridView } from '@/components/tracker-views/tracker-grid-view';
import { TrackerSummaryCards } from '@/components/tracker-views/tracker-summary-cards';
import {
  TrackerViewToolbar,
  type TrackerViewFilters,
} from '@/components/tracker-views/tracker-view-toolbar';
import { ApiError } from '@/lib/api-client';
import { getFrequencyConfig, type KpiContext } from '@/lib/tracker-frequency-config';
import { useTrackerEntries, useUpdateTrackerEntry } from '@/hooks/use-tracker-entries';
import type { BirStatus, TaskStatus } from '@/lib/tracker.types';

/**
 * Tracker view dispatcher — owns data fetching, the per-frequency config, the
 * KPI strip, the toolbar, and the entry drawer. The actual timeline is
 * delegated to a grid or list layout based on `config.layout`.
 */
export function TrackerListView({ siteTrackerId }: { siteTrackerId: string }) {
  const [filters, setFilters] = useState<TrackerViewFilters>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const query = useTrackerEntries(siteTrackerId, filters);
  const updateEntry = useUpdateTrackerEntry(siteTrackerId, filters);
  const now = useMemo(() => new Date(), []);

  const frequency = query.data?.site_tracker.tracker_category.frequency;
  const config = useMemo(
    () => (frequency ? getFrequencyConfig(frequency) : null),
    [frequency]
  );
  const activeCard = config?.kpiCards.find((card) => card.key === activeFilter);

  // Reactive entry from live query data so the sheet reflects server updates.
  const selectedEntry = useMemo(
    () =>
      selectedEntryId && query.data
        ? (query.data.entries.find((e) => e.id === selectedEntryId) ?? null)
        : null,
    [selectedEntryId, query.data]
  );
  const selectedTaskList = useMemo(
    () =>
      selectedEntry && query.data
        ? (query.data.task_lists.find((tl) => tl.id === selectedEntry.task_list_id) ?? null)
        : null,
    [selectedEntry, query.data]
  );
  const selectedSubtasks = useMemo(
    () =>
      selectedEntry && query.data
        ? query.data.tasks.filter((t) => t.task_list_id === selectedEntry.task_list_id)
        : [],
    [selectedEntry, query.data]
  );

  async function patchEntry(
    id: string,
    input: {
      status?: TaskStatus;
      bir_status?: BirStatus | null;
      submission_date?: string | null;
      note?: string | null;
      subtask_completions?: string[];
    }
  ) {
    try {
      await updateEntry.mutateAsync({ id, input });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update entry');
    }
  }

  function handleFilterChange(key: string | null) {
    setActiveFilter((prev) => (prev === key ? null : key));
  }

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
        <div className="overflow-hidden rounded-md border">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex border-b last:border-0">
              <Skeleton className="m-2 h-14 w-64 shrink-0 rounded" />
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="m-2 h-14 w-32 shrink-0 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (query.isError || !query.data || !config) {
    return (
      <div className="rounded-md border p-8 text-sm text-destructive">
        Failed to load tracker entries.
      </div>
    );
  }

  const kpiContext: KpiContext = {
    summary: query.data.summary,
    entries: query.data.entries,
    now,
  };

  return (
    <div className="space-y-4">
      <TrackerSummaryCards
        cards={config.kpiCards}
        ctx={kpiContext}
        activeFilter={activeFilter}
        onFilter={handleFilterChange}
      />

      <TrackerViewToolbar
        siteTrackerId={siteTrackerId}
        filters={filters}
        taskLists={query.data.task_lists}
        onChange={setFilters}
        onRefresh={() => query.refetch()}
      />

      {config.layout === 'list' ? (
        <TrackerAnnualList
          data={query.data}
          config={config}
          activeCard={activeCard}
          now={now}
          onSelectEntry={setSelectedEntryId}
        />
      ) : (
        <TrackerGridView
          data={query.data}
          config={config}
          activeCard={activeCard}
          now={now}
          onSelectEntry={setSelectedEntryId}
        />
      )}

      <TrackerEntrySheet
        entry={selectedEntry}
        taskList={selectedTaskList}
        subtasks={selectedSubtasks}
        isBir={config.statusVocabulary === 'bir'}
        isPending={updateEntry.isPending}
        onClose={() => setSelectedEntryId(null)}
        onPatch={patchEntry}
      />
    </div>
  );
}
