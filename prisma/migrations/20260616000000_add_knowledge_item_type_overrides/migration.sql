ALTER TABLE "KnowledgeItem"
  ADD COLUMN "aiSuggestedCategory" TEXT,
  ADD COLUMN "typeOverriddenByUser" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "typeOverriddenAt" TIMESTAMP(3),
  ADD COLUMN "typeOverriddenByUserId" TEXT;

UPDATE "KnowledgeItem"
SET "aiSuggestedCategory" = "category"
WHERE "aiSuggestedCategory" IS NULL;
