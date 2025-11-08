-- Fix property_address_unlocks table columns
-- Add missing unlockId column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='property_address_unlocks' AND column_name='unlockId'
  ) THEN
    -- Add unlockId column
    ALTER TABLE "property_address_unlocks" ADD COLUMN "unlockId" VARCHAR(255);

    -- Generate unique IDs for existing rows
    UPDATE "property_address_unlocks"
    SET "unlockId" = 'unlock-' || id || '-' || EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::TEXT
    WHERE "unlockId" IS NULL;

    -- Make it NOT NULL after populating
    ALTER TABLE "property_address_unlocks" ALTER COLUMN "unlockId" SET NOT NULL;

    -- Create unique constraint
    CREATE UNIQUE INDEX IF NOT EXISTS "property_address_unlocks_unlockId_key" ON "property_address_unlocks"("unlockId");
  END IF;
END $$;

-- Add fullAddress to properties if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='properties' AND column_name='fullAddress'
  ) THEN
    ALTER TABLE "properties" ADD COLUMN "fullAddress" TEXT;
  END IF;
END $$;

-- Ensure all required indexes exist
CREATE INDEX IF NOT EXISTS "property_address_unlocks_unlockId_idx" ON "property_address_unlocks"("unlockId");
