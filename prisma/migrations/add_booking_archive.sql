-- Migration: Add Booking Archive/Leads Table
-- Created: 2025-10-08
-- Purpose: Store deleted booking data for admin tracking and lead generation

-- Create booking_archive table for property bookings
CREATE TABLE IF NOT EXISTS "booking_archive" (
  "id" TEXT NOT NULL,
  "original_booking_id" TEXT NOT NULL,
  "property_id" INTEGER NOT NULL,
  "property_name" TEXT NOT NULL,
  "property_location" TEXT NOT NULL,
  "guest_id" INTEGER NOT NULL,
  "guest_name" TEXT NOT NULL,
  "guest_email" TEXT NOT NULL,
  "guest_phone" TEXT,
  "check_in" TIMESTAMP(3) NOT NULL,
  "check_out" TIMESTAMP(3) NOT NULL,
  "guests" INTEGER NOT NULL,
  "total_price" DOUBLE PRECISION NOT NULL,
  "message" TEXT,
  "special_requests" TEXT,
  "status" TEXT NOT NULL,
  "payment_status" TEXT NOT NULL,
  "booking_created_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archive_reason" TEXT NOT NULL,
  "admin_notified" BOOLEAN NOT NULL DEFAULT false,
  "admin_notified_at" TIMESTAMP(3),
  "admin_notes" TEXT,
  "lead_status" TEXT NOT NULL DEFAULT 'new',
  "contacted_at" TIMESTAMP(3),
  "converted_to_booking" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,

  CONSTRAINT "booking_archive_pkey" PRIMARY KEY ("id")
);

-- Create tour_booking_archive table for tour bookings
CREATE TABLE IF NOT EXISTS "tour_booking_archive" (
  "id" TEXT NOT NULL,
  "original_booking_id" TEXT NOT NULL,
  "tour_id" TEXT NOT NULL,
  "tour_title" TEXT NOT NULL,
  "tour_location" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "user_name" TEXT NOT NULL,
  "user_email" TEXT NOT NULL,
  "user_phone" TEXT,
  "tour_guide_id" INTEGER NOT NULL,
  "schedule_id" TEXT NOT NULL,
  "schedule_start_date" TIMESTAMP(3) NOT NULL,
  "number_of_participants" INTEGER NOT NULL,
  "participants" JSONB NOT NULL,
  "total_amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "special_requests" TEXT,
  "status" TEXT NOT NULL,
  "payment_status" TEXT NOT NULL,
  "booking_created_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archive_reason" TEXT NOT NULL,
  "admin_notified" BOOLEAN NOT NULL DEFAULT false,
  "admin_notified_at" TIMESTAMP(3),
  "admin_notes" TEXT,
  "lead_status" TEXT NOT NULL DEFAULT 'new',
  "contacted_at" TIMESTAMP(3),
  "converted_to_booking" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,

  CONSTRAINT "tour_booking_archive_pkey" PRIMARY KEY ("id")
);

-- Create indexes for better query performance
CREATE INDEX "booking_archive_property_id_idx" ON "booking_archive"("property_id");
CREATE INDEX "booking_archive_guest_id_idx" ON "booking_archive"("guest_id");
CREATE INDEX "booking_archive_archived_at_idx" ON "booking_archive"("archived_at");
CREATE INDEX "booking_archive_admin_notified_idx" ON "booking_archive"("admin_notified");
CREATE INDEX "booking_archive_lead_status_idx" ON "booking_archive"("lead_status");
CREATE INDEX "booking_archive_original_booking_id_idx" ON "booking_archive"("original_booking_id");

CREATE INDEX "tour_booking_archive_tour_id_idx" ON "tour_booking_archive"("tour_id");
CREATE INDEX "tour_booking_archive_user_id_idx" ON "tour_booking_archive"("user_id");
CREATE INDEX "tour_booking_archive_archived_at_idx" ON "tour_booking_archive"("archived_at");
CREATE INDEX "tour_booking_archive_admin_notified_idx" ON "tour_booking_archive"("admin_notified");
CREATE INDEX "tour_booking_archive_lead_status_idx" ON "tour_booking_archive"("lead_status");
CREATE INDEX "tour_booking_archive_original_booking_id_idx" ON "tour_booking_archive"("original_booking_id");
