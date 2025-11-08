-- Drop escrow tables if they exist
-- This migration removes all escrow-related database tables that are no longer used in the system

-- Drop escrow_notifications table (Pesapal/escrow notifications)
DROP TABLE IF EXISTS "escrow_notifications" CASCADE;

-- Drop escrow_transactions table (main escrow transaction records)
DROP TABLE IF EXISTS "escrow_transactions" CASCADE;

-- Log completion
-- Migration completed: All escrow tables have been dropped
