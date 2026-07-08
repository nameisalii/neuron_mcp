-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "relatedLoadId" TEXT,
    "sourceContext" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceReferences" JSONB,
    "documentReferences" JSONB,
    "relatedLoadId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "conversationId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAttachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "externalLoadId" TEXT,
    "documentType" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "source" TEXT NOT NULL,
    "sourceExternalId" TEXT,
    "sourceMessageId" TEXT,
    "sourceUrl" TEXT,
    "storageUrl" TEXT,
    "storageKey" TEXT,
    "extractedText" TEXT,
    "extractionStatus" TEXT,
    "uploadedByUserId" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiConnector" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "apiBaseUrl" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "encryptedCredential" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_configured',
    "lastSyncAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiConnector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatConversation_workspaceId_idx" ON "ChatConversation"("workspaceId");
CREATE INDEX "ChatConversation_workspaceId_userId_idx" ON "ChatConversation"("workspaceId", "userId");
CREATE INDEX "ChatConversation_workspaceId_relatedLoadId_idx" ON "ChatConversation"("workspaceId", "relatedLoadId");
CREATE INDEX "ChatConversation_workspaceId_updatedAt_idx" ON "ChatConversation"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");
CREATE INDEX "ChatMessage_workspaceId_idx" ON "ChatMessage"("workspaceId");
CREATE INDEX "ChatMessage_workspaceId_userId_idx" ON "ChatMessage"("workspaceId", "userId");
CREATE INDEX "ChatMessage_workspaceId_relatedLoadId_idx" ON "ChatMessage"("workspaceId", "relatedLoadId");
CREATE INDEX "ChatMessage_workspaceId_createdAt_idx" ON "ChatMessage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAnalyticsEvent_workspaceId_idx" ON "ChatAnalyticsEvent"("workspaceId");
CREATE INDEX "ChatAnalyticsEvent_workspaceId_userId_idx" ON "ChatAnalyticsEvent"("workspaceId", "userId");
CREATE INDEX "ChatAnalyticsEvent_workspaceId_conversationId_idx" ON "ChatAnalyticsEvent"("workspaceId", "conversationId");
CREATE INDEX "ChatAnalyticsEvent_workspaceId_eventType_idx" ON "ChatAnalyticsEvent"("workspaceId", "eventType");
CREATE INDEX "ChatAnalyticsEvent_workspaceId_createdAt_idx" ON "ChatAnalyticsEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentAttachment_workspaceId_idx" ON "DocumentAttachment"("workspaceId");
CREATE INDEX "DocumentAttachment_workspaceId_externalLoadId_idx" ON "DocumentAttachment"("workspaceId", "externalLoadId");
CREATE INDEX "DocumentAttachment_workspaceId_documentType_idx" ON "DocumentAttachment"("workspaceId", "documentType");
CREATE INDEX "DocumentAttachment_workspaceId_source_idx" ON "DocumentAttachment"("workspaceId", "source");
CREATE INDEX "DocumentAttachment_workspaceId_sourceExternalId_idx" ON "DocumentAttachment"("workspaceId", "sourceExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiConnector_workspaceId_sourceKey_key" ON "ApiConnector"("workspaceId", "sourceKey");
CREATE INDEX "ApiConnector_workspaceId_idx" ON "ApiConnector"("workspaceId");
CREATE INDEX "ApiConnector_workspaceId_status_idx" ON "ApiConnector"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatAnalyticsEvent" ADD CONSTRAINT "ChatAnalyticsEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatAnalyticsEvent" ADD CONSTRAINT "ChatAnalyticsEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiConnector" ADD CONSTRAINT "ApiConnector_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
