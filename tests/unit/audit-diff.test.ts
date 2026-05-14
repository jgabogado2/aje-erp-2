import { describe, it, expect } from 'vitest';
import { diffFields } from '@/lib/api/audit';

describe('diffFields', () => {
  it('returns nulls when both sides are absent', () => {
    expect(diffFields(null, null)).toEqual({ oldChanged: null, newChanged: null });
    expect(diffFields(undefined, undefined)).toEqual({
      oldChanged: null,
      newChanged: null,
    });
  });

  it('passes the new row through whole on create (no old value)', () => {
    const created = { id: 'x', name: 'Manila HQ', is_active: true };
    expect(diffFields(null, created)).toEqual({
      oldChanged: null,
      newChanged: created,
    });
  });

  it('passes the old row through whole on delete (no new value)', () => {
    const deleted = { id: 'x', name: 'Manila HQ', is_active: true };
    expect(diffFields(deleted, null)).toEqual({
      oldChanged: deleted,
      newChanged: null,
    });
  });

  it('captures only the fields that actually changed', () => {
    const before = { id: 'x', name: 'Old', code: 'SITE-1', is_active: true };
    const after = { id: 'x', name: 'New', code: 'SITE-1', is_active: false };
    expect(diffFields(before, after)).toEqual({
      oldChanged: { name: 'Old', is_active: true },
      newChanged: { name: 'New', is_active: false },
    });
  });

  it('returns null/null when nothing changed', () => {
    const row = { id: 'x', name: 'Same', is_active: true };
    expect(diffFields(row, { ...row })).toEqual({
      oldChanged: null,
      newChanged: null,
    });
  });

  it('ignores volatile timestamp fields (updated_at, created_at)', () => {
    const before = { name: 'Same', updated_at: '2026-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z' };
    const after = { name: 'Same', updated_at: '2026-02-02T00:00:00Z', created_at: '2025-01-01T00:00:00Z' };
    // Only updated_at changed, and it's volatile → no diff.
    expect(diffFields(before, after)).toEqual({
      oldChanged: null,
      newChanged: null,
    });
  });

  it('still records a real change even when a volatile field also changed', () => {
    const before = { name: 'Old', updated_at: '2026-01-01T00:00:00Z' };
    const after = { name: 'New', updated_at: '2026-02-02T00:00:00Z' };
    expect(diffFields(before, after)).toEqual({
      oldChanged: { name: 'Old' },
      newChanged: { name: 'New' },
    });
  });

  it('treats deep-equal objects/arrays as unchanged', () => {
    const before = { tags: ['a', 'b'], meta: { x: 1 } };
    const after = { tags: ['a', 'b'], meta: { x: 1 } };
    expect(diffFields(before, after)).toEqual({
      oldChanged: null,
      newChanged: null,
    });
  });

  it('detects a changed array', () => {
    const before = { tags: ['a', 'b'] };
    const after = { tags: ['a', 'b', 'c'] };
    expect(diffFields(before, after)).toEqual({
      oldChanged: { tags: ['a', 'b'] },
      newChanged: { tags: ['a', 'b', 'c'] },
    });
  });

  it('captures a field present on only one side', () => {
    const before = { name: 'X' };
    const after = { name: 'X', note: 'added' };
    expect(diffFields(before, after)).toEqual({
      oldChanged: { note: undefined },
      newChanged: { note: 'added' },
    });
  });
});
