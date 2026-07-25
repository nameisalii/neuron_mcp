ALTER TABLE "KnowledgeItem"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "statusUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "statusUpdatedByUserId" TEXT;

UPDATE "KnowledgeItem"
SET "status" = CASE
  WHEN "frozen" = true OR "conflictNote" IS NOT NULL THEN 'conflicting'
  WHEN "verified" = true THEN 'verified'
  ELSE 'unverified'
END;

CREATE INDEX "KnowledgeItem_workspaceId_status_idx" ON "KnowledgeItem"("workspaceId", "status");
