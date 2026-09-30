ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS ai_processing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ai_processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_processing_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_processing_error VARCHAR(64);

UPDATE documents
SET ai_processing_status = 'completed',
    ai_processing_finished_at = COALESCE(uploaded_at, NOW())
WHERE ai_summary IS NOT NULL
  AND ai_processing_status = 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'documents_ai_processing_status_check'
      AND conrelid = 'documents'::regclass
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_ai_processing_status_check
      CHECK (ai_processing_status IN ('pending', 'processing', 'completed', 'failed'));
  END IF;
END $$;