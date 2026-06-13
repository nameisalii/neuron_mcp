CREATE TABLE IF NOT EXISTS "EmailThread" (
  "id" TEXT NOT NULL,
  "gmailThreadId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "labelNames" TEXT[],
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3) NOT NULL,
  "syncedBy" TEXT NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailThread_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "EmailChunk" (
  "id" TEXT NOT NULL,
  "emailThreadId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "blockType" TEXT NOT NULL DEFAULT 'email_message',
  "position" INTEGER NOT NULL,
  "metadata" JSONB,
  "pineconeId" TEXT,
  "labels" JSONB NOT NULL DEFAULT '[]',
  "labeledBy" JSONB NOT NULL DEFAULT '[]',
  "visibility" TEXT NOT NULL DEFAULT 'personal',
  "visibilitySetBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailChunk_emailThreadId_fkey"
    FOREIGN KEY ("emailThreadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailThread_workspaceId_gmailThreadId_key"
ON "EmailThread"("workspaceId", "gmailThreadId");

CREATE INDEX IF NOT EXISTS "EmailThread_workspaceId_idx"
ON "EmailThread"("workspaceId");

CREATE INDEX IF NOT EXISTS "EmailChunk_emailThreadId_idx"
ON "EmailChunk"("emailThreadId");

CREATE INDEX IF NOT EXISTS "EmailChunk_workspaceId_idx"
ON "EmailChunk"("workspaceId");

CREATE INDEX IF NOT EXISTS "EmailChunk_workspaceId_visibility_idx"
ON "EmailChunk"("workspaceId", "visibility");
