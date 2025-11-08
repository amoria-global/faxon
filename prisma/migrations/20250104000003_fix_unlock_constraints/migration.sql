-- Fix property_address_unlocks schema completely

-- First, ensure the transactionReference column exists (from earlier migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='property_address_unlocks' AND column_name='transactionReference'
  ) THEN
    ALTER TABLE "property_address_unlocks" ADD COLUMN "transactionReference" VARCHAR(255);
  END IF;
END $$;

-- Drop old constraints if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_address_unlocks_unlock_id_key'
  ) THEN
    ALTER TABLE "property_address_unlocks" DROP CONSTRAINT "property_address_unlocks_unlock_id_key";
  END IF;
END $$;

-- Drop old indexes
DROP INDEX IF EXISTS "property_address_unlocks_unlock_id_key";
DROP INDEX IF EXISTS "property_address_unlocks_unlockId_key";

-- Now use db push to sync the rest - just create essential indexes
CREATE INDEX IF NOT EXISTS "property_address_unlocks_unlockId_idx" ON "property_address_unlocks"("unlockId");
CREATE INDEX IF NOT EXISTS "property_address_unlocks_propertyId_idx" ON "property_address_unlocks"("propertyId");
CREATE INDEX IF NOT EXISTS "property_address_unlocks_transactionReference_idx" ON "property_address_unlocks"("transactionReference");
CREATE INDEX IF NOT EXISTS "property_address_unlocks_paymentStatus_idx" ON "property_address_unlocks"("paymentStatus");
