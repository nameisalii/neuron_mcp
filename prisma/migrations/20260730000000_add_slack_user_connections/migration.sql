CREATE TABLE "SlackUserConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "externalUserId" TEXT NOT NULL,
    "externalUserName" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "settings" JSONB NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackUserConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SlackUserConnection_workspaceId_connectedByUserId_key"
ON "SlackUserConnection"("workspaceId", "connectedByUserId");
CREATE INDEX "SlackUserConnection_workspaceId_idx" ON "SlackUserConnection"("workspaceId");
CREATE INDEX "SlackUserConnection_connectedByUserId_idx" ON "SlackUserConnection"("connectedByUserId");
CREATE INDEX "SlackUserConnection_teamId_idx" ON "SlackUserConnection"("teamId");

ALTER TABLE "SlackUserConnection"
ADD CONSTRAINT "SlackUserConnection_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
