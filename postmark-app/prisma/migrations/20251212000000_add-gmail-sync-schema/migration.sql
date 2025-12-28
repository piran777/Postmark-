-- AlterTable: add token storage to EmailAccount
ALTER TABLE "EmailAccount"
ADD COLUMN "accessToken" TEXT,
ADD COLUMN "refreshToken" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateTable: Message metadata
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "threadId" TEXT,
    "subject" TEXT,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "date" TIMESTAMP(3),
    "snippet" TEXT,
    "labels" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- Indexes and constraints
CREATE UNIQUE INDEX "Message_provider_providerMessageId_key" ON "Message"("provider", "providerMessageId");
CREATE INDEX "Message_userId_provider_idx" ON "Message"("userId", "provider");

-- Foreign keys
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;



