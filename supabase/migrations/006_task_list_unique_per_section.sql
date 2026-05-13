-- ============================================================================
-- Migration 006 — Relax task_lists uniqueness to per-section
-- ============================================================================
-- Original constraint from 004 was UNIQUE(site_tracker_id, name) — too strict.
-- A task list named "Filing" under section "EWT Recon" should coexist with
-- another "Filing" under section "Quarterly ITR". The right grain is
-- (site_tracker_id, tracker_section_id, name).
--
-- NULLS NOT DISTINCT (Postgres 15+) makes two rows with the same name and
-- both NULL tracker_section_id (ungrouped) still collide — otherwise the
-- default NULLS DISTINCT would silently allow duplicates among ungrouped
-- task lists. Supabase ships on Postgres 15+, so this is safe.
-- ============================================================================

ALTER TABLE task_lists
  DROP CONSTRAINT IF EXISTS task_lists_site_tracker_name_unique;

ALTER TABLE task_lists
  ADD CONSTRAINT task_lists_site_tracker_section_name_unique
  UNIQUE NULLS NOT DISTINCT (site_tracker_id, tracker_section_id, name);
