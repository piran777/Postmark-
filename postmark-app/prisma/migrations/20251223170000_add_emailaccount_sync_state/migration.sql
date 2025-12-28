-- Add basic sync state fields for EmailAccount (delta sync cursor + last error)
ALTER TABLE "EmailAccount" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "EmailAccount" ADD COLUMN "lastSyncError" TEXT;



