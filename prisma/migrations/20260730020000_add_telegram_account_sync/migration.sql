CREATE TABLE "TelegramAccountConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phoneHash" TEXT,
  "externalUserId" TEXT,
  "externalUsername" TEXT,
  "externalDisplayName" TEXT,
  "encryptedSession" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending_code',
  "lastSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAccountConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramSelectedChat" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "telegramAccountConnectionId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "accessHash" TEXT,
  "title" TEXT,
  "username" TEXT,
  "chatType" TEXT,
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
  "visibility" TEXT NOT NULL DEFAULT 'personal',
  "visibilitySetBy" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3),
  "oldestSyncedMessageId" TEXT,
  "newestSyncedMessageId" TEXT,
  "syncCursor" JSONB,
  "status" TEXT NOT NULL DEFAULT 'discovered',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramSelectedChat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramAccountConnection_workspaceId_userId_key" ON "TelegramAccountConnection"("workspaceId", "userId");
CREATE INDEX "TelegramAccountConnection_workspaceId_userId_idx" ON "TelegramAccountConnection"("workspaceId", "userId");
CREATE INDEX "TelegramAccountConnection_status_idx" ON "TelegramAccountConnection"("status");
CREATE UNIQUE INDEX "TelegramSelectedChat_telegramAccountConnectionId_chatId_key" ON "TelegramSelectedChat"("telegramAccountConnectionId", "chatId");
CREATE INDEX "TelegramSelectedChat_workspaceId_userId_idx" ON "TelegramSelectedChat"("workspaceId", "userId");
CREATE INDEX "TelegramSelectedChat_selected_idx" ON "TelegramSelectedChat"("selected");
CREATE INDEX "TelegramSelectedChat_syncEnabled_idx" ON "TelegramSelectedChat"("syncEnabled");
CREATE INDEX "TelegramSelectedChat_chatType_idx" ON "TelegramSelectedChat"("chatType");
CREATE INDEX "TelegramSelectedChat_status_idx" ON "TelegramSelectedChat"("status");

ALTER TABLE "TelegramAccountConnection" ADD CONSTRAINT "TelegramAccountConnection_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramSelectedChat" ADD CONSTRAINT "TelegramSelectedChat_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramSelectedChat" ADD CONSTRAINT "TelegramSelectedChat_telegramAccountConnectionId_fkey"
  FOREIGN KEY ("telegramAccountConnectionId") REFERENCES "TelegramAccountConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
