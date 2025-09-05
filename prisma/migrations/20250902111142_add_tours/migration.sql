-- CreateTable
CREATE TABLE "tours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "tourGuideId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "duration" REAL NOT NULL,
    "maxGroupSize" INTEGER NOT NULL,
    "minGroupSize" INTEGER NOT NULL DEFAULT 1,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "images" TEXT NOT NULL,
    "itinerary" TEXT NOT NULL,
    "inclusions" TEXT NOT NULL,
    "exclusions" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "locationCountry" TEXT NOT NULL,
    "locationState" TEXT,
    "locationCity" TEXT NOT NULL,
    "locationAddress" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "locationZipCode" TEXT,
    "meetingPoint" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rating" REAL NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tours_tourGuideId_fkey" FOREIGN KEY ("tourGuideId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tour_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tourId" TEXT NOT NULL,
    "tourGuideId" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "availableSlots" INTEGER NOT NULL,
    "bookedSlots" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "price" REAL,
    "specialNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tour_schedules_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tour_bookings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "tourId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "tourGuideId" INTEGER NOT NULL,
    "numberOfParticipants" INTEGER NOT NULL,
    "participants" TEXT NOT NULL,
    "specialRequests" TEXT,
    "totalAmount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "paymentId" TEXT,
    "checkInStatus" TEXT NOT NULL DEFAULT 'not_checked_in',
    "checkInTime" DATETIME,
    "checkOutTime" DATETIME,
    "refundAmount" REAL,
    "refundReason" TEXT,
    "bookingDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tour_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tour_bookings_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tour_bookings_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "tour_schedules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tour_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "tourId" TEXT NOT NULL,
    "tourGuideId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "images" TEXT,
    "pros" TEXT NOT NULL,
    "cons" TEXT NOT NULL,
    "wouldRecommend" BOOLEAN NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isReported" BOOLEAN NOT NULL DEFAULT false,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "response" TEXT,
    "responseDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tour_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "tour_bookings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tour_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tour_reviews_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tour_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderId" INTEGER NOT NULL,
    "receiverId" INTEGER NOT NULL,
    "bookingId" TEXT,
    "tourId" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "attachments" TEXT,
    "messageType" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tour_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tour_messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tour_messages_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "tour_bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tour_messages_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tour_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tour_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tour_earnings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tourGuideId" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "commission" REAL NOT NULL,
    "netAmount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payoutDate" DATETIME,
    "payoutMethod" TEXT,
    "transactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tour_earnings_tourGuideId_fkey" FOREIGN KEY ("tourGuideId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tour_earnings_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "tour_bookings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tour_earnings_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tour_analytics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tourId" TEXT NOT NULL,
    "userId" INTEGER,
    "eventType" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "sessionId" TEXT,
    "country" TEXT,
    "city" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tour_analytics_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tour_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tour_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    "resetPasswordExpires" DATETIME
);
INSERT INTO "new_users" ("cep", "city", "country", "createdAt", "eircode", "email", "firstName", "id", "lastLogin", "lastName", "password", "phone", "phoneCountryCode", "pinCode", "postalCode", "postcode", "profileImage", "provider", "providerId", "province", "resetPasswordExpires", "resetPasswordOtp", "state", "status", "street", "totalSessions", "twoFactorEnabled", "updatedAt", "userType", "zipCode") SELECT "cep", "city", "country", "createdAt", "eircode", "email", "firstName", "id", "lastLogin", "lastName", "password", "phone", "phoneCountryCode", "pinCode", "postalCode", "postcode", "profileImage", "provider", "providerId", "province", "resetPasswordExpires", "resetPasswordOtp", "state", "status", "street", "totalSessions", "twoFactorEnabled", "updatedAt", "userType", "zipCode" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "tours_tourGuideId_idx" ON "tours"("tourGuideId");

-- CreateIndex
CREATE INDEX "tours_category_idx" ON "tours"("category");

-- CreateIndex
CREATE INDEX "tours_type_idx" ON "tours"("type");

-- CreateIndex
CREATE INDEX "tours_difficulty_idx" ON "tours"("difficulty");

-- CreateIndex
CREATE INDEX "tours_isActive_idx" ON "tours"("isActive");

-- CreateIndex
CREATE INDEX "tours_rating_idx" ON "tours"("rating");

-- CreateIndex
CREATE INDEX "tours_locationCountry_locationCity_idx" ON "tours"("locationCountry", "locationCity");

-- CreateIndex
CREATE INDEX "tours_createdAt_idx" ON "tours"("createdAt");

-- CreateIndex
CREATE INDEX "tour_schedules_tourId_idx" ON "tour_schedules"("tourId");

-- CreateIndex
CREATE INDEX "tour_schedules_tourGuideId_idx" ON "tour_schedules"("tourGuideId");

-- CreateIndex
CREATE INDEX "tour_schedules_startDate_endDate_idx" ON "tour_schedules"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "tour_schedules_isAvailable_idx" ON "tour_schedules"("isAvailable");

-- CreateIndex
CREATE INDEX "tour_bookings_userId_idx" ON "tour_bookings"("userId");

-- CreateIndex
CREATE INDEX "tour_bookings_tourId_idx" ON "tour_bookings"("tourId");

-- CreateIndex
CREATE INDEX "tour_bookings_scheduleId_idx" ON "tour_bookings"("scheduleId");

-- CreateIndex
CREATE INDEX "tour_bookings_tourGuideId_idx" ON "tour_bookings"("tourGuideId");

-- CreateIndex
CREATE INDEX "tour_bookings_status_idx" ON "tour_bookings"("status");

-- CreateIndex
CREATE INDEX "tour_bookings_paymentStatus_idx" ON "tour_bookings"("paymentStatus");

-- CreateIndex
CREATE INDEX "tour_bookings_bookingDate_idx" ON "tour_bookings"("bookingDate");

-- CreateIndex
CREATE INDEX "tour_reviews_userId_idx" ON "tour_reviews"("userId");

-- CreateIndex
CREATE INDEX "tour_reviews_tourId_idx" ON "tour_reviews"("tourId");

-- CreateIndex
CREATE INDEX "tour_reviews_tourGuideId_idx" ON "tour_reviews"("tourGuideId");

-- CreateIndex
CREATE INDEX "tour_reviews_rating_idx" ON "tour_reviews"("rating");

-- CreateIndex
CREATE INDEX "tour_reviews_isVisible_idx" ON "tour_reviews"("isVisible");

-- CreateIndex
CREATE INDEX "tour_reviews_createdAt_idx" ON "tour_reviews"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tour_reviews_bookingId_userId_key" ON "tour_reviews"("bookingId", "userId");

-- CreateIndex
CREATE INDEX "tour_messages_senderId_idx" ON "tour_messages"("senderId");

-- CreateIndex
CREATE INDEX "tour_messages_receiverId_idx" ON "tour_messages"("receiverId");

-- CreateIndex
CREATE INDEX "tour_messages_bookingId_idx" ON "tour_messages"("bookingId");

-- CreateIndex
CREATE INDEX "tour_messages_tourId_idx" ON "tour_messages"("tourId");

-- CreateIndex
CREATE INDEX "tour_messages_isRead_idx" ON "tour_messages"("isRead");

-- CreateIndex
CREATE INDEX "tour_messages_createdAt_idx" ON "tour_messages"("createdAt");

-- CreateIndex
CREATE INDEX "tour_notifications_userId_idx" ON "tour_notifications"("userId");

-- CreateIndex
CREATE INDEX "tour_notifications_type_idx" ON "tour_notifications"("type");

-- CreateIndex
CREATE INDEX "tour_notifications_isRead_idx" ON "tour_notifications"("isRead");

-- CreateIndex
CREATE INDEX "tour_notifications_createdAt_idx" ON "tour_notifications"("createdAt");

-- CreateIndex
CREATE INDEX "tour_earnings_tourGuideId_idx" ON "tour_earnings"("tourGuideId");

-- CreateIndex
CREATE INDEX "tour_earnings_bookingId_idx" ON "tour_earnings"("bookingId");

-- CreateIndex
CREATE INDEX "tour_earnings_tourId_idx" ON "tour_earnings"("tourId");

-- CreateIndex
CREATE INDEX "tour_earnings_status_idx" ON "tour_earnings"("status");

-- CreateIndex
CREATE INDEX "tour_earnings_payoutDate_idx" ON "tour_earnings"("payoutDate");

-- CreateIndex
CREATE INDEX "tour_earnings_createdAt_idx" ON "tour_earnings"("createdAt");

-- CreateIndex
CREATE INDEX "tour_analytics_tourId_idx" ON "tour_analytics"("tourId");

-- CreateIndex
CREATE INDEX "tour_analytics_userId_idx" ON "tour_analytics"("userId");

-- CreateIndex
CREATE INDEX "tour_analytics_eventType_idx" ON "tour_analytics"("eventType");

-- CreateIndex
CREATE INDEX "tour_analytics_createdAt_idx" ON "tour_analytics"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tour_categories_name_key" ON "tour_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tour_categories_slug_key" ON "tour_categories"("slug");

-- CreateIndex
CREATE INDEX "tour_categories_isActive_idx" ON "tour_categories"("isActive");

-- CreateIndex
CREATE INDEX "tour_categories_sortOrder_idx" ON "tour_categories"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "tour_tags_name_key" ON "tour_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tour_tags_slug_key" ON "tour_tags"("slug");

-- CreateIndex
CREATE INDEX "tour_tags_isActive_idx" ON "tour_tags"("isActive");

-- CreateIndex
CREATE INDEX "tour_tags_usageCount_idx" ON "tour_tags"("usageCount");
