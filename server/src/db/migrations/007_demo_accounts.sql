DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'is_demo'
  ) THEN
    ALTER TABLE users ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_demo_role_guard'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_demo_role_guard
      CHECK (NOT is_demo OR role IN ('patient', 'doctor'));
  END IF;
END $$;
