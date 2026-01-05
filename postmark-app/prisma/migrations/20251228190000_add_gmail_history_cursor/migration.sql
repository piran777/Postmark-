-- Add Gmail History API cursor to support true delta sync.
ALTER TABLE "EmailAccount" ADD COLUMN "gmailHistoryId" TEXT;





