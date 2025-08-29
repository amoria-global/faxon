-- AlterTable
ALTER TABLE "users" ADD COLUMN "resetPasswordExpires" DATETIME;
ALTER TABLE "users" ADD COLUMN "resetPasswordOtp" TEXT;
