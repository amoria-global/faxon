-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "checkInInstructions" TEXT;
ALTER TABLE "bookings" ADD COLUMN "checkOutInstructions" TEXT;
ALTER TABLE "bookings" ADD COLUMN "notes" TEXT;
ALTER TABLE "bookings" ADD COLUMN "specialRequests" TEXT;

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "method" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "fees" REAL NOT NULL DEFAULT 0,
    "netAmount" REAL NOT NULL,
    "reference" TEXT NOT NULL,
    "externalId" TEXT,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "processedAt" DATETIME,
    CONSTRAINT "payouts_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "host_earnings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostId" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "grossAmount" REAL NOT NULL,
    "platformFee" REAL NOT NULL,
    "hostEarning" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payoutId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "earnedAt" DATETIME,
    CONSTRAINT "host_earnings_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "host_earnings_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "host_earnings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "host_earnings_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "password" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerId" TEXT,
    "phone" TEXT,
    "phoneCountryCode" TEXT,
    "profileImage" TEXT,
    "country" TEXT,
    "state" TEXT,
    "province" TEXT,
    "city" TEXT,
    "street" TEXT,
    "zipCode" TEXT,
    "postalCode" TEXT,
    "postcode" TEXT,
    "pinCode" TEXT,
    "eircode" TEXT,
    "cep" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userType" TEXT NOT NULL DEFAULT 'guest',
    "bio" TEXT,
    "experience" INTEGER,
    "languages" TEXT,
    "specializations" TEXT,
    "rating" REAL NOT NULL DEFAULT 0,
    "totalTours" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "licenseNumber" TEXT,
    "certifications" TEXT,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLogin" DATETIME,
    "resetPasswordOtp" TEXT,
    "resetPasswordExpires" DATETIME,
    "verificationStatus" TEXT DEFAULT 'unverified',
    "preferredCommunication" TEXT DEFAULT 'email',
    "hostNotes" TEXT,
    "averageRating" REAL NOT NULL DEFAULT 0
);
INSERT INTO "new_users" ("bio", "cep", "certifications", "city", "country", "createdAt", "eircode", "email", "experience", "firstName", "id", "isVerified", "languages", "lastLogin", "lastName", "licenseNumber", "password", "phone", "phoneCountryCode", "pinCode", "postalCode", "postcode", "profileImage", "provider", "providerId", "province", "rating", "resetPasswordExpires", "resetPasswordOtp", "specializations", "state", "status", "street", "totalSessions", "totalTours", "twoFactorEnabled", "updatedAt", "userType", "zipCode") SELECT "bio", "cep", "certifications", "city", "country", "createdAt", "eircode", "email", "experience", "firstName", "id", "isVerified", "languages", "lastLogin", "lastName", "licenseNumber", "password", "phone", "phoneCountryCode", "pinCode", "postalCode", "postcode", "profileImage", "provider", "providerId", "province", "rating", "resetPasswordExpires", "resetPasswordOtp", "specializations", "state", "status", "street", "totalSessions", "totalTours", "twoFactorEnabled", "updatedAt", "userType", "zipCode" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "payouts_reference_key" ON "payouts"("reference");

-- CreateIndex
CREATE INDEX "payouts_hostId_idx" ON "payouts"("hostId");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE INDEX "payouts_periodStart_periodEnd_idx" ON "payouts"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "host_earnings_bookingId_key" ON "host_earnings"("bookingId");

-- CreateIndex
CREATE INDEX "host_earnings_hostId_idx" ON "host_earnings"("hostId");

-- CreateIndex
CREATE INDEX "host_earnings_bookingId_idx" ON "host_earnings"("bookingId");

-- CreateIndex
CREATE INDEX "host_earnings_propertyId_idx" ON "host_earnings"("propertyId");

-- CreateIndex
CREATE INDEX "host_earnings_status_idx" ON "host_earnings"("status");

-- CreateIndex
CREATE INDEX "host_earnings_earnedAt_idx" ON "host_earnings"("earnedAt");
