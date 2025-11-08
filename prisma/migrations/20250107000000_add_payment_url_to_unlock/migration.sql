-- AlterTable
ALTER TABLE "PropertyAddressUnlock" ADD COLUMN "paymentUrl" TEXT;

-- Add comment
COMMENT ON COLUMN "PropertyAddressUnlock"."paymentUrl" IS 'XentriPay payment URL for card payments';
