-- Migration 0022: Add certificate template columns to certificate_configs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificate_configs' AND column_name = 'template_document_id'
  ) THEN
    ALTER TABLE certificate_configs ADD COLUMN template_document_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificate_configs' AND column_name = 'template_file_name'
  ) THEN
    ALTER TABLE certificate_configs ADD COLUMN template_file_name TEXT;
  END IF;
END $$;
