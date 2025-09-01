/*
  Warnings:

  - You are about to drop the column `hostResponse` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `paymentStatus` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `transactionId` on the `bookings` table. All the data in the column will be lost.
  - Added the required column `cleaningFee` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `confirmationCode` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hostId` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nights` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentTiming` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pricePerNight` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceFee` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotal` to the `bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `taxes` to the `bookings` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_bookings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" INTEGER NOT NULL,
    "guestId" INTEGER NOT NULL,
    "hostId" INTEGER NOT NULL,
    "checkIn" DATETIME NOT NULL,
    "checkOut" DATETIME NOT NULL,
    "guests" INTEGER NOT NULL,
    "nights" INTEGER NOT NULL,
    "pricePerNight" REAL NOT NULL,
    "subtotal" REAL NOT NULL,
    "cleaningFee" REAL NOT NULL,
    "serviceFee" REAL NOT NULL,
    "taxes" REAL NOT NULL,
    "totalPrice" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT,
    "paymentTiming" TEXT NOT NULL,
    "message" TEXT,
    "specialRequests" TEXT,
    "cancellationReason" TEXT,
    "refundAmount" REAL,
    "confirmationCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bookings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bookings_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bookings_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_bookings" ("checkIn", "checkOut", "createdAt", "guestId", "guests", "id", "message", "paymentMethod", "propertyId", "status", "totalPrice", "updatedAt") SELECT "checkIn", "checkOut", "createdAt", "guestId", "guests", "id", "message", "paymentMethod", "propertyId", "status", "totalPrice", "updatedAt" FROM "bookings";
DROP TABLE "bookings";
ALTER TABLE "new_bookings" RENAME TO "bookings";
CREATE UNIQUE INDEX "bookings_confirmationCode_key" ON "bookings"("confirmationCode");
CREATE INDEX "bookings_propertyId_idx" ON "bookings"("propertyId");
CREATE INDEX "bookings_guestId_idx" ON "bookings"("guestId");
CREATE INDEX "bookings_hostId_idx" ON "bookings"("hostId");
CREATE INDEX "bookings_status_idx" ON "bookings"("status");
CREATE INDEX "bookings_checkIn_idx" ON "bookings"("checkIn");
CREATE INDEX "bookings_checkOut_idx" ON "bookings"("checkOut");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
