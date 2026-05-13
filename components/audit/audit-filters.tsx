'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { AuditFilters } from '@/hooks/use-audit';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '@/lib/validations/audit';
import type { Site } from '@/types/domain';

const ENTITY_LABEL: Record<(typeof AUDIT_ENTITY_TYPES)[number], string> = {
  task_entry: 'Task entry',
  site: 'Site',
  user: 'User',
  tracker_category: 'Tracker category',
  site_tracker: 'Site tracker',
  tracker_section: 'Section',
  task_list: 'Task item',
  task: 'Subtask',
};

interface AuditFiltersBarProps {
  filters: AuditFilters;
  onChange: (next: AuditFilters) => void;
  /** When provided, the site filter renders as a select. Otherwise it's hidden. */
  sites?: Site[];
  /** Lock the site filter to a specific value (per-site audit page). */
  lockedSiteId?: string;
}

export function AuditFiltersBar({
  filters,
  onChange,
  sites,
  lockedSiteId,
}: AuditFiltersBarProps) {
  function set<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {sites && !lockedSiteId && (
        <div className="grid gap-1">
          <Label htmlFor="audit-site">Site</Label>
          <Select
            id="audit-site"
            value={filters.site_id ?? ''}
            onChange={(e) => set('site_id', e.target.value || null)}
          >
            <option value="">All sites</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid gap-1">
        <Label htmlFor="audit-entity">Entity</Label>
        <Select
          id="audit-entity"
          value={filters.entity_type ?? ''}
          onChange={(e) =>
            set('entity_type', (e.target.value || null) as AuditFilters['entity_type'])
          }
        >
          <option value="">All entities</option>
          {AUDIT_ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ENTITY_LABEL[type]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-1">
        <Label htmlFor="audit-action">Action</Label>
        <Select
          id="audit-action"
          value={filters.action ?? ''}
          onChange={(e) =>
            set('action', (e.target.value || null) as AuditFilters['action'])
          }
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {action.replace('_', ' ')}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-1">
        <Label htmlFor="audit-from">From</Label>
        <Input
          id="audit-from"
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => set('from', e.target.value || null)}
        />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="audit-to">To</Label>
        <Input
          id="audit-to"
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => set('to', e.target.value || null)}
        />
      </div>

      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange(lockedSiteId ? { site_id: lockedSiteId } : {})
          }
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
