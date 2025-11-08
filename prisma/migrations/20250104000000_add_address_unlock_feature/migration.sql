-- CreateTable: Property Address Unlocks
CREATE TABLE "property_address_unlocks" (
    "id" SERIAL NOT NULL,
    "unlock_id" VARCHAR(255) NOT NULL,
    "property_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "payment_method" VARCHAR(50) NOT NULL,
    "payment_amount_rwf" DECIMAL(10,2) NOT NULL,
    "payment_amount_usd" DECIMAL(10,2),
    "exchange_rate" DECIMAL(10,4) NOT NULL,
    "deal_code_id" INTEGER,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appreciation_submitted" BOOLEAN NOT NULL DEFAULT false,
    "appreciation_level" VARCHAR(50),
    "appreciation_feedback" TEXT,
    "appreciation_submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_address_unlocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "property_address_unlocks_unlock_id_key" UNIQUE ("unlock_id"),
    CONSTRAINT "property_address_unlocks_user_property_key" UNIQUE ("user_id", "property_id"),
    CONSTRAINT "property_address_unlocks_payment_method_check" CHECK (payment_method IN ('non_refundable_fee', 'three_month_30_percent')),
    CONSTRAINT "property_address_unlocks_appreciation_level_check" CHECK (appreciation_level IN ('appreciated', 'neutral', 'not_appreciated'))
);

-- CreateTable: Deal Codes
CREATE TABLE "deal_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source_property_id" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "remaining_unlocks" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "deal_codes_code_key" UNIQUE ("code"),
    CONSTRAINT "deal_codes_remaining_unlocks_check" CHECK (remaining_unlocks >= 0)
);

-- CreateTable: Deal Code Usage Tracking
CREATE TABLE "deal_code_usage" (
    "id" SERIAL NOT NULL,
    "deal_code_id" INTEGER NOT NULL,
    "unlock_id" VARCHAR(255) NOT NULL,
    "property_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_code_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Address Unlock Refunds
CREATE TABLE "address_unlock_refunds" (
    "id" SERIAL NOT NULL,
    "unlock_id" VARCHAR(255) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "refund_amount_rwf" DECIMAL(10,2) NOT NULL,
    "refund_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "refund_method" VARCHAR(50),
    "refund_reference" VARCHAR(255),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_unlock_refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "address_unlock_refunds_refund_status_check" CHECK (refund_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- CreateIndex
CREATE INDEX "property_address_unlocks_user_id_property_id_idx" ON "property_address_unlocks"("user_id", "property_id");
CREATE INDEX "property_address_unlocks_unlock_id_idx" ON "property_address_unlocks"("unlock_id");
CREATE INDEX "property_address_unlocks_property_id_idx" ON "property_address_unlocks"("property_id");

CREATE INDEX "deal_codes_code_idx" ON "deal_codes"("code");
CREATE INDEX "deal_codes_user_id_is_active_idx" ON "deal_codes"("user_id", "is_active");
CREATE INDEX "deal_codes_expires_at_idx" ON "deal_codes"("expires_at");

CREATE INDEX "deal_code_usage_deal_code_id_idx" ON "deal_code_usage"("deal_code_id");
CREATE INDEX "deal_code_usage_user_id_idx" ON "deal_code_usage"("user_id");

CREATE INDEX "address_unlock_refunds_user_id_refund_status_idx" ON "address_unlock_refunds"("user_id", "refund_status");

-- AddForeignKey
ALTER TABLE "property_address_unlocks" ADD CONSTRAINT "property_address_unlocks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_address_unlocks" ADD CONSTRAINT "property_address_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_address_unlocks" ADD CONSTRAINT "property_address_unlocks_deal_code_id_fkey" FOREIGN KEY ("deal_code_id") REFERENCES "deal_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_codes" ADD CONSTRAINT "deal_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_codes" ADD CONSTRAINT "deal_codes_source_property_id_fkey" FOREIGN KEY ("source_property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_code_usage" ADD CONSTRAINT "deal_code_usage_deal_code_id_fkey" FOREIGN KEY ("deal_code_id") REFERENCES "deal_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_code_usage" ADD CONSTRAINT "deal_code_usage_unlock_id_fkey" FOREIGN KEY ("unlock_id") REFERENCES "property_address_unlocks"("unlock_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_code_usage" ADD CONSTRAINT "deal_code_usage_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_code_usage" ADD CONSTRAINT "deal_code_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_unlock_refunds" ADD CONSTRAINT "address_unlock_refunds_unlock_id_fkey" FOREIGN KEY ("unlock_id") REFERENCES "property_address_unlocks"("unlock_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_unlock_refunds" ADD CONSTRAINT "address_unlock_refunds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add columns to properties table for full contact information
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "full_address" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "host_phone" VARCHAR(50);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "host_email" VARCHAR(255);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "preferred_contact_method" VARCHAR(20);

-- Add constraint for preferred_contact_method
ALTER TABLE "properties" ADD CONSTRAINT "properties_preferred_contact_method_check"
    CHECK (preferred_contact_method IS NULL OR preferred_contact_method IN ('phone', 'email', 'both'));

-- Add index for address lookups
CREATE INDEX IF NOT EXISTS "properties_full_address_idx" ON "properties"("id");
