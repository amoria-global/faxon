-- Add payment tracking fields to property_address_unlocks
ALTER TABLE "property_address_unlocks" ADD COLUMN IF NOT EXISTS "transactionReference" VARCHAR(255);
ALTER TABLE "property_address_unlocks" ADD COLUMN IF NOT EXISTS "paymentStatus" VARCHAR(50) NOT NULL DEFAULT 'pending';
ALTER TABLE "property_address_unlocks" ADD COLUMN IF NOT EXISTS "paymentProvider" VARCHAR(50);

-- Make unlockedAt nullable (only set when payment is successful)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='property_address_unlocks' AND column_name='unlockedAt'
  ) THEN
    ALTER TABLE "property_address_unlocks" ALTER COLUMN "unlockedAt" DROP NOT NULL;
  END IF;
END $$;

-- Create unique index for transaction reference
CREATE UNIQUE INDEX IF NOT EXISTS "property_address_unlocks_transactionReference_key" ON "property_address_unlocks"("transactionReference");

-- Create indexes for payment queries
CREATE INDEX IF NOT EXISTS "property_address_unlocks_transactionReference_idx" ON "property_address_unlocks"("transactionReference");
CREATE INDEX IF NOT EXISTS "property_address_unlocks_paymentStatus_idx" ON "property_address_unlocks"("paymentStatus");
