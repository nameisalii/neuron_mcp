ALTER TABLE "KnowledgeItem"
ADD COLUMN IF NOT EXISTS "sourceCreatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sourceExternalId" TEXT;

CREATE INDEX IF NOT EXISTS "KnowledgeItem_workspaceId_source_sourceExternalId_idx"
ON "KnowledgeItem"("workspaceId", "source", "sourceExternalId");
