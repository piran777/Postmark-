-- Add unique constraint for one account per provider per user
ALTER TABLE "EmailAccount"
ADD CONSTRAINT "EmailAccount_userId_provider_key" UNIQUE ("userId", "provider");

