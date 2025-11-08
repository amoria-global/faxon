-- Add duplicate detection tracking table
CREATE TABLE IF NOT EXISTS "duplicate_detection_logs" (
  "id" SERIAL PRIMARY KEY,
  "entity_type" VARCHAR(50) NOT NULL, -- 'property' or 'tour'
  "entity_id" VARCHAR(255) NOT NULL, -- ID of the new entity being created
  "duplicate_of_id" VARCHAR(255) NOT NULL, -- ID of the existing duplicate entity
  "similarity_score" DECIMAL(5,2) NOT NULL, -- Overall similarity score (0-100)
  "similarity_details" JSONB NOT NULL, -- JSON containing detailed similarity breakdown
  "uploader_id" INTEGER NOT NULL, -- User who uploaded the duplicate
  "original_owner_id" INTEGER, -- Owner of the original entity
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'reviewed', 'dismissed'
  "admin_notified" BOOLEAN DEFAULT FALSE,
  "uploader_notified" BOOLEAN DEFAULT FALSE,
  "owner_notified" BOOLEAN DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS "idx_duplicate_logs_entity_type" ON "duplicate_detection_logs"("entity_type");
CREATE INDEX IF NOT EXISTS "idx_duplicate_logs_status" ON "duplicate_detection_logs"("status");
CREATE INDEX IF NOT EXISTS "idx_duplicate_logs_created_at" ON "duplicate_detection_logs"("created_at");
CREATE INDEX IF NOT EXISTS "idx_duplicate_logs_uploader" ON "duplicate_detection_logs"("uploader_id");
CREATE INDEX IF NOT EXISTS "idx_duplicate_logs_owner" ON "duplicate_detection_logs"("original_owner_id");
