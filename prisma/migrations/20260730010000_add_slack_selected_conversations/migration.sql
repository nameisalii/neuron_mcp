CREATE TABLE "SlackSelectedConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slackUserConnectionId" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "conversationName" TEXT,
    "conversationType" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "visibility" TEXT NOT NULL DEFAULT 'personal',
    "lastSyncedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackSelectedConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SlackSelectedConversation_slackUserConnectionId_conversationId_key"
ON "SlackSelectedConversation"("slackUserConnectionId", "conversationId");
CREATE INDEX "SlackSelectedConversation_workspaceId_userId_idx"
ON "SlackSelectedConversation"("workspaceId", "userId");
CREATE INDEX "SlackSelectedConversation_slackUserConnectionId_idx"
ON "SlackSelectedConversation"("slackUserConnectionId");
CREATE INDEX "SlackSelectedConversation_selected_idx"
ON "SlackSelectedConversation"("selected");
CREATE INDEX "SlackSelectedConversation_syncEnabled_idx"
ON "SlackSelectedConversation"("syncEnabled");
CREATE INDEX "SlackSelectedConversation_conversationType_idx"
ON "SlackSelectedConversation"("conversationType");

ALTER TABLE "SlackSelectedConversation"
ADD CONSTRAINT "SlackSelectedConversation_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SlackSelectedConversation"
ADD CONSTRAINT "SlackSelectedConversation_slackUserConnectionId_fkey"
FOREIGN KEY ("slackUserConnectionId") REFERENCES "SlackUserConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
