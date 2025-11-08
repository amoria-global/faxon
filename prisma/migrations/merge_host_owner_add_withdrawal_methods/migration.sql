-- CreateEnum for withdrawal method types (if needed)
-- CREATE TYPE "WithdrawalMethodType" AS ENUM ('bank_account', 'mobile_money', 'crypto', 'paypal');

-- Step 1: Add new columns to Wallet table
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "pendingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "walletNumber" TEXT;

-- Generate unique wallet numbers for existing wallets
UPDATE "wallets"
SET "walletNumber" = 'WLT-' || LPAD(CAST("userId" AS TEXT), 8, '0') || '-' || SUBSTRING(md5(random()::text), 1, 6)
WHERE "walletNumber" IS NULL;

-- Make walletNumber NOT NULL and UNIQUE after populating
ALTER TABLE "wallets" ALTER COLUMN "walletNumber" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_walletNumber_key" ON "wallets"("walletNumber");
CREATE INDEX IF NOT EXISTS "wallets_walletNumber_idx" ON "wallets"("walletNumber");

-- Step 2: Update Booking table - rename hostResponse to ownerResponse (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='bookings' AND column_name='hostResponse'
  ) THEN
    ALTER TABLE "bookings" RENAME COLUMN "hostResponse" TO "ownerResponse";
  END IF;
END $$;

-- Step 3: Update Property table - merge hostId into ownerId
-- First, add ownerId column if it doesn't exist
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "ownerId" INTEGER;

-- Copy hostId to ownerId for all existing properties
UPDATE "properties" SET "ownerId" = "hostId" WHERE "ownerId" IS NULL;

-- Make ownerId NOT NULL
ALTER TABLE "properties" ALTER COLUMN "ownerId" SET NOT NULL;

-- Drop old hostId foreign key and column
ALTER TABLE "properties" DROP CONSTRAINT IF EXISTS "properties_hostId_fkey";
DROP INDEX IF EXISTS "properties_hostId_idx";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "hostId";

-- Add new foreign key for ownerId
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "properties_ownerId_idx" ON "properties"("ownerId");

-- Step 4: Create OwnerEarning table
CREATE TABLE IF NOT EXISTS "owner_earnings" (
    "id" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "ownerEarning" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payoutId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "earnedAt" TIMESTAMP(3),

    CONSTRAINT "owner_earnings_pkey" PRIMARY KEY ("id")
);

-- Copy data from host_earnings to owner_earnings
INSERT INTO "owner_earnings" (
  "id", "ownerId", "bookingId", "propertyId", "grossAmount",
  "platformFee", "ownerEarning", "currency", "payoutId",
  "status", "createdAt", "updatedAt", "earnedAt"
)
SELECT
  "id", "hostId", "bookingId", "propertyId", "grossAmount",
  "platformFee", "hostEarning", "currency", "payoutId",
  "status", "createdAt", "updatedAt", "earnedAt"
FROM "host_earnings"
ON CONFLICT DO NOTHING;

-- Create indexes for owner_earnings
CREATE UNIQUE INDEX IF NOT EXISTS "owner_earnings_bookingId_key" ON "owner_earnings"("bookingId");
CREATE INDEX IF NOT EXISTS "owner_earnings_ownerId_idx" ON "owner_earnings"("ownerId");
CREATE INDEX IF NOT EXISTS "owner_earnings_propertyId_idx" ON "owner_earnings"("propertyId");
CREATE INDEX IF NOT EXISTS "owner_earnings_status_idx" ON "owner_earnings"("status");

-- Add foreign keys
ALTER TABLE "owner_earnings" ADD CONSTRAINT "owner_earnings_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_earnings" ADD CONSTRAINT "owner_earnings_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_earnings" ADD CONSTRAINT "owner_earnings_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_earnings" ADD CONSTRAINT "owner_earnings_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: Create OwnerPayment table
CREATE TABLE IF NOT EXISTS "owner_payments" (
    "id" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "checkInRequired" BOOLEAN NOT NULL DEFAULT true,
    "checkInValidated" BOOLEAN NOT NULL DEFAULT false,
    "checkInValidatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "payoutMethod" TEXT,
    "transactionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_payments_pkey" PRIMARY KEY ("id")
);

-- Copy data from host_payments to owner_payments
INSERT INTO "owner_payments" (
  "id", "ownerId", "propertyId", "bookingId", "amount", "platformFee",
  "netAmount", "currency", "status", "checkInRequired", "checkInValidated",
  "checkInValidatedAt", "approvedAt", "paidAt", "payoutMethod",
  "transactionId", "notes", "createdAt", "updatedAt"
)
SELECT
  hp."id", hp."hostId", b."propertyId", hp."bookingId", hp."amount", hp."platformFee",
  hp."netAmount", hp."currency", hp."status", hp."checkInRequired", hp."checkInValidated",
  hp."checkInValidatedAt", hp."approvedAt", hp."paidAt", hp."payoutMethod",
  hp."transactionId", hp."notes", hp."createdAt", hp."updatedAt"
FROM "host_payments" hp
JOIN "bookings" b ON b."id" = hp."bookingId"
ON CONFLICT DO NOTHING;

-- Create indexes for owner_payments
CREATE INDEX IF NOT EXISTS "owner_payments_ownerId_idx" ON "owner_payments"("ownerId");
CREATE INDEX IF NOT EXISTS "owner_payments_propertyId_idx" ON "owner_payments"("propertyId");
CREATE INDEX IF NOT EXISTS "owner_payments_bookingId_idx" ON "owner_payments"("bookingId");
CREATE INDEX IF NOT EXISTS "owner_payments_status_idx" ON "owner_payments"("status");
CREATE INDEX IF NOT EXISTS "owner_payments_checkInValidated_idx" ON "owner_payments"("checkInValidated");

-- Add foreign keys
ALTER TABLE "owner_payments" ADD CONSTRAINT "owner_payments_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_payments" ADD CONSTRAINT "owner_payments_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_payments" ADD CONSTRAINT "owner_payments_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: Create WithdrawalMethod table
CREATE TABLE IF NOT EXISTS "withdrawal_methods" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "methodType" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountDetails" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" INTEGER,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_methods_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "withdrawal_methods_userId_idx" ON "withdrawal_methods"("userId");
CREATE INDEX IF NOT EXISTS "withdrawal_methods_isApproved_idx" ON "withdrawal_methods"("isApproved");
CREATE INDEX IF NOT EXISTS "withdrawal_methods_methodType_idx" ON "withdrawal_methods"("methodType");

-- Add foreign key
ALTER TABLE "withdrawal_methods" ADD CONSTRAINT "withdrawal_methods_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Update WithdrawalRequest table
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "withdrawalMethodId" TEXT;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "adminNotes" TEXT;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "approvedBy" INTEGER;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "rejectedBy" INTEGER;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "processedBy" INTEGER;

-- Add index for withdrawalMethodId
CREATE INDEX IF NOT EXISTS "withdrawal_requests_withdrawalMethodId_idx" ON "withdrawal_requests"("withdrawalMethodId");

-- Add foreign key for withdrawalMethodId
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_withdrawalMethodId_fkey"
  FOREIGN KEY ("withdrawalMethodId") REFERENCES "withdrawal_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
