-- Add agent and owner relationships to Property table
ALTER TABLE "properties" ADD COLUMN "ownerId" INTEGER;
ALTER TABLE "properties" ADD COLUMN "agentId" INTEGER;
ALTER TABLE "properties" ADD COLUMN "commissionRate" DOUBLE PRECISION DEFAULT 0.10;

-- Add check-in/check-out validation to Booking table
ALTER TABLE "bookings" ADD COLUMN "checkInValidated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN "checkInValidatedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "checkInValidatedBy" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "checkOutValidated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN "checkOutValidatedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "checkOutValidatedBy" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "checkInCode" TEXT;
ALTER TABLE "bookings" ADD COLUMN "checkOutCode" TEXT;

-- Create AgentCommission table
CREATE TABLE "agent_commissions" (
    "id" TEXT NOT NULL,
    "agentId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "earnedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "payoutMethod" TEXT,
    "transactionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_commissions_pkey" PRIMARY KEY ("id")
);

-- Create HostPayment table
CREATE TABLE "host_payments" (
    "id" TEXT NOT NULL,
    "hostId" INTEGER NOT NULL,
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

    CONSTRAINT "host_payments_pkey" PRIMARY KEY ("id")
);

-- Create indexes for Property
CREATE INDEX "properties_ownerId_idx" ON "properties"("ownerId");
CREATE INDEX "properties_agentId_idx" ON "properties"("agentId");

-- Create indexes for Booking
CREATE INDEX "bookings_paymentStatus_idx" ON "bookings"("paymentStatus");

-- Create indexes for AgentCommission
CREATE INDEX "agent_commissions_agentId_idx" ON "agent_commissions"("agentId");
CREATE INDEX "agent_commissions_propertyId_idx" ON "agent_commissions"("propertyId");
CREATE INDEX "agent_commissions_bookingId_idx" ON "agent_commissions"("bookingId");
CREATE INDEX "agent_commissions_status_idx" ON "agent_commissions"("status");

-- Create indexes for HostPayment
CREATE INDEX "host_payments_hostId_idx" ON "host_payments"("hostId");
CREATE INDEX "host_payments_bookingId_idx" ON "host_payments"("bookingId");
CREATE INDEX "host_payments_status_idx" ON "host_payments"("status");
CREATE INDEX "host_payments_checkInValidated_idx" ON "host_payments"("checkInValidated");

-- Add foreign keys for Property
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "properties" ADD CONSTRAINT "properties_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add foreign keys for AgentCommission
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign keys for HostPayment
ALTER TABLE "host_payments" ADD CONSTRAINT "host_payments_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "host_payments" ADD CONSTRAINT "host_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
