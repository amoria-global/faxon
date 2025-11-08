-- Add refund approval fields to bookings table
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundRequestedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundRequestedBy" INTEGER;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundApproved" BOOLEAN DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundApprovedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundApprovedBy" INTEGER;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundRejected" BOOLEAN DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundRejectedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundRejectedBy" INTEGER;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundRejectionReason" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundAmount" DOUBLE PRECISION;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundPlatformFee" DOUBLE PRECISION;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundChannel" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundTransactionId" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundCompletedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundToWallet" BOOLEAN DEFAULT true;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundWalletCredited" BOOLEAN DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refundWalletCreditedAt" TIMESTAMP(3);

-- Add refund approval fields to tour_bookings table
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundRequestedAt" TIMESTAMP(3);
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundRequestedBy" INTEGER;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundApproved" BOOLEAN DEFAULT false;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundApprovedAt" TIMESTAMP(3);
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundApprovedBy" INTEGER;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundRejected" BOOLEAN DEFAULT false;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundRejectedAt" TIMESTAMP(3);
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundRejectedBy" INTEGER;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundRejectionReason" TEXT;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundPlatformFee" DOUBLE PRECISION;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundChannel" TEXT;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundTransactionId" TEXT;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundCompletedAt" TIMESTAMP(3);
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundToWallet" BOOLEAN DEFAULT true;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundWalletCredited" BOOLEAN DEFAULT false;
ALTER TABLE "tour_bookings" ADD COLUMN IF NOT EXISTS "refundWalletCreditedAt" TIMESTAMP(3);

-- Create indexes for refund queries
CREATE INDEX IF NOT EXISTS "bookings_refundRequested_idx" ON "bookings"("refundRequested");
CREATE INDEX IF NOT EXISTS "bookings_refundApproved_idx" ON "bookings"("refundApproved");
CREATE INDEX IF NOT EXISTS "tour_bookings_refundRequested_idx" ON "tour_bookings"("refundRequested");
CREATE INDEX IF NOT EXISTS "tour_bookings_refundApproved_idx" ON "tour_bookings"("refundApproved");
