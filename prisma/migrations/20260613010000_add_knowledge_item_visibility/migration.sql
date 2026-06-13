ALTER TABLE "KnowledgeItem"
ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'team',
ADD COLUMN IF NOT EXISTS "visibilitySetBy" TEXT;

CREATE INDEX IF NOT EXISTS "KnowledgeItem_workspaceId_visibility_visibilitySetBy_idx"
ON "KnowledgeItem"("workspaceId", "visibility", "visibilitySetBy");
