-- ============================================================================
-- Migration 009 — Attachments (per-entry evidence files)
-- ============================================================================
-- Each task entry can carry one or more uploaded artifacts (receipts, PDFs,
-- screenshots, etc.). Files live in Supabase Storage; this table tracks the
-- metadata + access path.
--
-- Object path convention:
--   {organization_id}/{site_id}/{task_entry_id}/{uuid}-{file_name}
--
-- Storage bucket is private; uploads use short-lived presigned URLs minted
-- by the API. Downloads use signed URLs minted on read.
-- ============================================================================


-- 9.1  attachments table -------------------------------------------------------

CREATE TABLE IF NOT EXISTS attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_entry_id UUID NOT NULL REFERENCES task_entries(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_size     INTEGER NOT NULL CHECK (file_size > 0),
  mime_type     TEXT NOT NULL,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Path is globally unique because we embed a uuid in it.
  CONSTRAINT attachments_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_attachments_entry      ON attachments(task_entry_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by ON attachments(uploaded_by);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attachments_service_role_only" ON attachments;
CREATE POLICY "attachments_service_role_only"
  ON attachments FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);


-- 9.2  Private storage bucket --------------------------------------------------
-- Bucket creation runs via direct insert; idempotent so re-running the
-- migration is safe. Set as private — every read/write goes through a
-- signed URL minted by the API after authz.

INSERT INTO storage.buckets (id, name, public)
VALUES ('tracker-attachments', 'tracker-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Lock the bucket: deny all direct authenticated/anon access via storage RLS.
-- The service-role client (used inside our API routes) bypasses this.
DROP POLICY IF EXISTS "tracker_attachments_no_direct_access_select"
  ON storage.objects;
CREATE POLICY "tracker_attachments_no_direct_access_select"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id <> 'tracker-attachments');

DROP POLICY IF EXISTS "tracker_attachments_no_direct_access_insert"
  ON storage.objects;
CREATE POLICY "tracker_attachments_no_direct_access_insert"
  ON storage.objects FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id <> 'tracker-attachments');

DROP POLICY IF EXISTS "tracker_attachments_no_direct_access_update"
  ON storage.objects;
CREATE POLICY "tracker_attachments_no_direct_access_update"
  ON storage.objects FOR UPDATE
  TO authenticated, anon
  USING (bucket_id <> 'tracker-attachments');

DROP POLICY IF EXISTS "tracker_attachments_no_direct_access_delete"
  ON storage.objects;
CREATE POLICY "tracker_attachments_no_direct_access_delete"
  ON storage.objects FOR DELETE
  TO authenticated, anon
  USING (bucket_id <> 'tracker-attachments');

-- End of Migration 009
