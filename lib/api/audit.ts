import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiCaller } from '@/lib/api/auth';

// Append-only audit record. The helper is intentionally fault-tolerant: a
// failed audit write must never break the user's actual request. Errors
// are logged and swallowed.

export type AuditEntityType =
  | 'task_entry'
  | 'site'
  | 'user'
  | 'tracker_category'
  | 'site_tracker'
  | 'tracker_section'
  | 'task_list'
  | 'task'
  | 'holiday';

export type AuditAction = 'create' | 'update' | 'delete' | 'status_change';

export interface AuditEvent {
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditAction;
  /** Previous row state. Omit for 'create'. */
  old_value?: Record<string, unknown> | null;
  /** New row state. Omit for 'delete'. */
  new_value?: Record<string, unknown> | null;
  /** Site context if applicable (e.g. task_entry, site_tracker, task_list, task). */
  site_id?: string | null;
}

type SupabaseAdmin = SupabaseClient;

const VOLATILE_FIELDS = new Set(['updated_at', 'created_at']);

/**
 * Returns the per-field diff of two records: { fieldName: { from, to } }.
 * Skips equal fields and timestamps that change on every update. Used to
 * keep audit rows compact even for wide tables.
 *
 * Exported for unit testing — it's a pure function with no DB dependency.
 */
export function diffFields(
  oldVal: Record<string, unknown> | null | undefined,
  newVal: Record<string, unknown> | null | undefined
): {
  oldChanged: Record<string, unknown> | null;
  newChanged: Record<string, unknown> | null;
} {
  if (!oldVal && !newVal) return { oldChanged: null, newChanged: null };
  if (!oldVal) return { oldChanged: null, newChanged: newVal ?? null };
  if (!newVal) return { oldChanged: oldVal, newChanged: null };

  const oldChanged: Record<string, unknown> = {};
  const newChanged: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);

  for (const key of keys) {
    if (VOLATILE_FIELDS.has(key)) continue;
    const a = oldVal[key];
    const b = newVal[key];
    if (!shallowEqual(a, b)) {
      oldChanged[key] = a;
      newChanged[key] = b;
    }
  }

  return {
    oldChanged: Object.keys(oldChanged).length ? oldChanged : null,
    newChanged: Object.keys(newChanged).length ? newChanged : null,
  };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  // Treat JSON-equal objects/arrays as unchanged for diff purposes. Cheap
  // and accurate for the simple shapes we audit.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export async function recordAudit(
  supabase: SupabaseAdmin,
  caller: ApiCaller,
  event: AuditEvent
): Promise<void> {
  try {
    let oldStored: unknown = event.old_value ?? null;
    let newStored: unknown = event.new_value ?? null;

    if (event.action === 'update' || event.action === 'status_change') {
      const diff = diffFields(
        event.old_value as Record<string, unknown> | null | undefined,
        event.new_value as Record<string, unknown> | null | undefined
      );
      oldStored = diff.oldChanged;
      newStored = diff.newChanged;
      // If literally nothing changed, skip the write. Avoids audit noise
      // when a PATCH is a no-op (e.g. saving the same row unchanged).
      if (!oldStored && !newStored) return;
    }

    const { error } = await supabase.from('audit_log').insert({
      user_id: caller.userId,
      organization_id: caller.organizationId,
      site_id: event.site_id ?? null,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      action: event.action,
      old_value: oldStored,
      new_value: newStored,
    });
    if (error) {
      console.error('[audit] insert failed', error, {
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        action: event.action,
      });
    }
  } catch (err) {
    // Defense-in-depth: never propagate audit failures to the user.
    console.error('[audit] unexpected error', err);
  }
}
