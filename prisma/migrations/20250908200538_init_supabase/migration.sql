-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
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
    "languages" JSONB,
    "specializations" JSONB,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTours" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "licenseNumber" TEXT,
    "certifications" JSONB,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),
    "resetPasswordOtp" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "verificationStatus" TEXT DEFAULT 'unverified',
    "preferredCommunication" TEXT DEFAULT 'email',
    "hostNotes" TEXT,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "device" TEXT,
    "browser" TEXT,
    "location" TEXT,
    "ipAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "pricePerNight" DOUBLE PRECISION NOT NULL,
    "pricePerTwoNights" DOUBLE PRECISION,
    "beds" INTEGER NOT NULL,
    "baths" INTEGER NOT NULL,
    "maxGuests" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "images" JSONB NOT NULL,
    "video3D" TEXT,
    "hostId" INTEGER NOT NULL,
    "ownerDetails" JSONB,
    "availableFrom" TIMESTAMP(3),
    "availableTo" TIMESTAMP(3),
    "minStay" INTEGER NOT NULL DEFAULT 1,
    "maxStay" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isInstantBook" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "guestId" INTEGER NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "guests" INTEGER NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "message" TEXT,
    "hostResponse" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT,
    "transactionId" TEXT,
    "notes" TEXT,
    "specialRequests" TEXT,
    "checkInInstructions" TEXT,
    "checkOutInstructions" TEXT,
    "guestNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "bookingId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "images" JSONB,
    "response" TEXT,
    "responseDate" TIMESTAMP(3),
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isReported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_dates" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "priceModifier" DOUBLE PRECISION NOT NULL,
    "modifierType" TEXT NOT NULL,
    "minStay" INTEGER,
    "maxStay" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_views" (
    "id" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tours" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "tourGuideId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "maxGroupSize" INTEGER NOT NULL,
    "minGroupSize" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "images" JSONB NOT NULL,
    "itinerary" JSONB NOT NULL,
    "inclusions" JSONB NOT NULL,
    "exclusions" JSONB NOT NULL,
    "requirements" JSONB NOT NULL,
    "difficulty" TEXT NOT NULL,
    "locationCountry" TEXT NOT NULL,
    "locationState" TEXT,
    "locationCity" TEXT NOT NULL,
    "locationAddress" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationZipCode" TEXT,
    "meetingPoint" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "tags" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_schedules" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "tourGuideId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "availableSlots" INTEGER NOT NULL,
    "bookedSlots" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "price" DOUBLE PRECISION,
    "specialNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_bookings" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "tourId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "tourGuideId" INTEGER NOT NULL,
    "numberOfParticipants" INTEGER NOT NULL,
    "participants" JSONB NOT NULL,
    "specialRequests" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "paymentId" TEXT,
    "checkInStatus" TEXT NOT NULL DEFAULT 'not_checked_in',
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "refundAmount" DOUBLE PRECISION,
    "refundReason" TEXT,
    "guestNotes" TEXT,
    "bookingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "tourId" TEXT NOT NULL,
    "tourGuideId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "images" JSONB,
    "pros" JSONB NOT NULL,
    "cons" JSONB NOT NULL,
    "wouldRecommend" BOOLEAN NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isReported" BOOLEAN NOT NULL DEFAULT false,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "response" TEXT,
    "responseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_messages" (
    "id" TEXT NOT NULL,
    "senderId" INTEGER NOT NULL,
    "receiverId" INTEGER NOT NULL,
    "bookingId" TEXT,
    "tourId" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "attachments" JSONB,
    "messageType" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_notifications" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tour_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_earnings" (
    "id" TEXT NOT NULL,
    "tourGuideId" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payoutDate" TIMESTAMP(3),
    "payoutMethod" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_analytics" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "userId" INTEGER,
    "eventType" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "sessionId" TEXT,
    "country" TEXT,
    "city" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tour_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "accountNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reference" TEXT NOT NULL,
    "externalId" TEXT,
    "jengaTransactionId" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "charges" DOUBLE PRECISION,
    "netAmount" DOUBLE PRECISION,
    "sourceAccount" TEXT,
    "destinationAccount" TEXT,
    "phoneNumber" TEXT,
    "bankCode" TEXT,
    "accountName" TEXT,
    "failureReason" TEXT,
    "callbackUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceBefore" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_money_accounts" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_money_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_settings" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'KES',
    "autoWithdrawal" BOOLEAN NOT NULL DEFAULT false,
    "withdrawalThreshold" DOUBLE PRECISION,
    "defaultBankAccount" TEXT,
    "defaultMobileNumber" TEXT,
    "notificationPreferences" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "hostId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "method" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT NOT NULL,
    "externalId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_earnings" (
    "id" TEXT NOT NULL,
    "hostId" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "hostEarning" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payoutId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "earnedAt" TIMESTAMP(3),

    CONSTRAINT "host_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_bookings" (
    "id" TEXT NOT NULL,
    "agentId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "bookingType" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_sessionToken_key" ON "user_sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refreshToken_key" ON "user_sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_sessionToken_idx" ON "user_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "properties_hostId_idx" ON "properties"("hostId");

-- CreateIndex
CREATE INDEX "properties_status_idx" ON "properties"("status");

-- CreateIndex
CREATE INDEX "properties_location_idx" ON "properties"("location");

-- CreateIndex
CREATE INDEX "properties_type_idx" ON "properties"("type");

-- CreateIndex
CREATE INDEX "properties_category_idx" ON "properties"("category");

-- CreateIndex
CREATE INDEX "properties_pricePerNight_idx" ON "properties"("pricePerNight");

-- CreateIndex
CREATE INDEX "properties_averageRating_idx" ON "properties"("averageRating");

-- CreateIndex
CREATE INDEX "bookings_propertyId_idx" ON "bookings"("propertyId");

-- CreateIndex
CREATE INDEX "bookings_guestId_idx" ON "bookings"("guestId");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_checkIn_checkOut_idx" ON "bookings"("checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "reviews_propertyId_idx" ON "reviews"("propertyId");

-- CreateIndex
CREATE INDEX "reviews_userId_idx" ON "reviews"("userId");

-- CreateIndex
CREATE INDEX "reviews_rating_idx" ON "reviews"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_propertyId_userId_key" ON "reviews"("propertyId", "userId");

-- CreateIndex
CREATE INDEX "blocked_dates_propertyId_idx" ON "blocked_dates"("propertyId");

-- CreateIndex
CREATE INDEX "blocked_dates_startDate_endDate_idx" ON "blocked_dates"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "pricing_rules_propertyId_idx" ON "pricing_rules"("propertyId");

-- CreateIndex
CREATE INDEX "pricing_rules_startDate_endDate_idx" ON "pricing_rules"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "wishlists_userId_idx" ON "wishlists"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_userId_propertyId_key" ON "wishlists"("userId", "propertyId");

-- CreateIndex
CREATE INDEX "property_views_propertyId_idx" ON "property_views"("propertyId");

-- CreateIndex
CREATE INDEX "property_views_userId_idx" ON "property_views"("userId");

-- CreateIndex
CREATE INDEX "property_views_createdAt_idx" ON "property_views"("createdAt");

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

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE INDEX "wallets_userId_idx" ON "wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_reference_key" ON "payment_transactions"("reference");

-- CreateIndex
CREATE INDEX "payment_transactions_userId_idx" ON "payment_transactions"("userId");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_type_idx" ON "payment_transactions"("type");

-- CreateIndex
CREATE INDEX "payment_transactions_method_idx" ON "payment_transactions"("method");

-- CreateIndex
CREATE INDEX "payment_transactions_reference_idx" ON "payment_transactions"("reference");

-- CreateIndex
CREATE INDEX "payment_transactions_jengaTransactionId_idx" ON "payment_transactions"("jengaTransactionId");

-- CreateIndex
CREATE INDEX "payment_transactions_createdAt_idx" ON "payment_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_idx" ON "wallet_transactions"("walletId");

-- CreateIndex
CREATE INDEX "wallet_transactions_reference_idx" ON "wallet_transactions"("reference");

-- CreateIndex
CREATE INDEX "wallet_transactions_createdAt_idx" ON "wallet_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "bank_accounts_userId_idx" ON "bank_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_userId_accountNumber_bankCode_key" ON "bank_accounts"("userId", "accountNumber", "bankCode");

-- CreateIndex
CREATE INDEX "mobile_money_accounts_userId_idx" ON "mobile_money_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_money_accounts_userId_phoneNumber_key" ON "mobile_money_accounts"("userId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payment_settings_userId_key" ON "payment_settings"("userId");

-- CreateIndex
CREATE INDEX "payment_settings_userId_idx" ON "payment_settings"("userId");

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

-- CreateIndex
CREATE INDEX "agent_bookings_agentId_idx" ON "agent_bookings"("agentId");

-- CreateIndex
CREATE INDEX "agent_bookings_clientId_idx" ON "agent_bookings"("clientId");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tours" ADD CONSTRAINT "tours_tourGuideId_fkey" FOREIGN KEY ("tourGuideId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_schedules" ADD CONSTRAINT "tour_schedules_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_bookings" ADD CONSTRAINT "tour_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_bookings" ADD CONSTRAINT "tour_bookings_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_bookings" ADD CONSTRAINT "tour_bookings_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "tour_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_reviews" ADD CONSTRAINT "tour_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "tour_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_reviews" ADD CONSTRAINT "tour_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_reviews" ADD CONSTRAINT "tour_reviews_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_messages" ADD CONSTRAINT "tour_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_messages" ADD CONSTRAINT "tour_messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_messages" ADD CONSTRAINT "tour_messages_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "tour_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_messages" ADD CONSTRAINT "tour_messages_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_notifications" ADD CONSTRAINT "tour_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_earnings" ADD CONSTRAINT "tour_earnings_tourGuideId_fkey" FOREIGN KEY ("tourGuideId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_earnings" ADD CONSTRAINT "tour_earnings_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "tour_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_earnings" ADD CONSTRAINT "tour_earnings_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_analytics" ADD CONSTRAINT "tour_analytics_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_money_accounts" ADD CONSTRAINT "mobile_money_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_earnings" ADD CONSTRAINT "host_earnings_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_earnings" ADD CONSTRAINT "host_earnings_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_earnings" ADD CONSTRAINT "host_earnings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_earnings" ADD CONSTRAINT "host_earnings_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_bookings" ADD CONSTRAINT "agent_bookings_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_bookings" ADD CONSTRAINT "agent_bookings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
