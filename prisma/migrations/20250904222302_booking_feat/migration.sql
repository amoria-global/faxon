-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "guestNotes" TEXT;

-- AlterTable
ALTER TABLE "tour_bookings" ADD COLUMN "guestNotes" TEXT;

-- CreateTable
CREATE TABLE "agent_bookings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "bookingType" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "commission" REAL NOT NULL,
    "commissionRate" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "agent_bookings_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_bookings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "agent_bookings_agentId_idx" ON "agent_bookings"("agentId");

-- CreateIndex
CREATE INDEX "agent_bookings_clientId_idx" ON "agent_bookings"("clientId");
