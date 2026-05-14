-- ============================================================================
-- Seed: Example tracker categories (one-shot, not a migration)
-- ============================================================================
-- Replace the placeholder org ID below with your real organization UUID
-- before running. To find it:
--   SELECT id FROM organizations LIMIT 1;
-- ============================================================================

DO $$
DECLARE
  v_org_id UUID := (SELECT id FROM organizations LIMIT 1);
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found — create one first.';
  END IF;

  INSERT INTO tracker_categories (
    organization_id, name, description, frequency, is_active, created_by
  ) VALUES

  (v_org_id, 'Daily Operations',
   'Front-office daily compliance checks and reports',
   'DAILY', true, NULL),

  (v_org_id, 'Weekly Reports',
   'Weekly government and management submissions',
   'WEEKLY', true, NULL),

  (v_org_id, 'Monthly FS Requirements',
   'Monthly financial statement filings and requirements',
   'MONTHLY', true, NULL),

  (v_org_id, 'BIR Compliance',
   'Bureau of Internal Revenue monthly + quarterly filings',
   'BIR', true, NULL),

  (v_org_id, 'Quarter/Annual Filings',
   'Quarterly and annual regulatory filings',
   'QUARTERLY', true, NULL)

  ON CONFLICT DO NOTHING;

END $$;
