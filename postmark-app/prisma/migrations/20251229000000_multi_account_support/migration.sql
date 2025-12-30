-- Multi-account support:
-- - Allow multiple accounts per provider per user (keyed by emailAddress)
-- - Track OAuth providerAccountId for stable mailbox identity
-- - Scope providerMessageId uniqueness to an EmailAccount

-- EmailAccount: add providerAccountId
ALTER TABLE "EmailAccount"
ADD COLUMN "providerAccountId" TEXT;

-- EmailAccount: replace old unique constraint (userId, provider) with (userId, provider, emailAddress)
ALTER TABLE "EmailAccount"
DROP CONSTRAINT "EmailAccount_userId_provider_key";

CREATE UNIQUE INDEX "EmailAccount_userId_provider_emailAddress_key"
ON "EmailAccount"("userId", "provider", "emailAddress");

-- EmailAccount: prevent same OAuth mailbox being connected multiple times (nulls allowed)
CREATE UNIQUE INDEX "EmailAccount_provider_providerAccountId_key"
ON "EmailAccount"("provider", "providerAccountId");

-- Message: providerMessageId is only unique within a mailbox/account
DROP INDEX "Message_provider_providerMessageId_key";

CREATE UNIQUE INDEX "Message_emailAccountId_providerMessageId_key"
ON "Message"("emailAccountId", "providerMessageId");



