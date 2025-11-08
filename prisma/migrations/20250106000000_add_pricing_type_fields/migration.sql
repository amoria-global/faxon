-- AlterTable: Add pricing type fields to Property and Booking tables
-- This migration adds support for both nightly and monthly pricing

-- Step 1: Add new columns to properties table
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "pricingType" TEXT DEFAULT 'night';
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "pricePerMonth" DOUBLE PRECISION;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "coordinates" JSONB;

-- Step 2: Make pricePerNight nullable (was required before)
ALTER TABLE "properties" ALTER COLUMN "pricePerNight" DROP NOT NULL;

-- Step 3: Update existing properties to have 'night' pricing type (default)
UPDATE "properties" SET "pricingType" = 'night' WHERE "pricingType" IS NULL;

-- Step 4: Make pricingType NOT NULL after setting defaults
ALTER TABLE "properties" ALTER COLUMN "pricingType" SET NOT NULL;

-- Step 5: Add check constraint to ensure valid pricing type
ALTER TABLE "properties" ADD CONSTRAINT "properties_pricingType_check"
CHECK ("pricingType" IN ('night', 'month'));

-- Step 6: Add new columns to bookings table
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "pricingType" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "nightsCount" INTEGER;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "monthsCount" INTEGER;

-- Step 7: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "idx_properties_pricingType" ON "properties"("pricingType");
CREATE INDEX IF NOT EXISTS "idx_bookings_pricingType" ON "bookings"("pricingType");

-- Note: Complex constraint to ensure appropriate price field is set based on pricing type
-- will be enforced at application level for better flexibility
