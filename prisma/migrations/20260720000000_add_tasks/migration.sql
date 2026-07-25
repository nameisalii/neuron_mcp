CREATE TYPE "TaskStatus" AS ENUM ('suggested', 'active', 'completed', 'declined', 'archived');
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE "TaskCategory" AS ENUM ('work', 'school', 'startup', 'truck', 'personal', 'other');
CREATE TYPE "TaskActivityType" AS ENUM ('created', 'suggested', 'approved', 'edited', 'completed', 'reopened', 'declined', 'archived');

CREATE TABLE "Task" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'suggested',
  "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
  "category" "TaskCategory" NOT NULL DEFAULT 'work',
  "color" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "sourceType" TEXT,
  "sourceId" TEXT,
  "sourceUrl" TEXT,
  "sourceTitle" TEXT,
  "sourceSnippet" TEXT,
  "extractedFromKnowledgeItemId" TEXT,
  "assignedToUserId" TEXT,
  "createdByUserId" TEXT,
  "confidence" DOUBLE PRECISION,
  "metadata" JSONB,
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskEvent" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT,
  "type" "TaskActivityType" NOT NULL,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Task_workspaceId_dedupeKey_key" ON "Task"("workspaceId", "dedupeKey");
CREATE INDEX "Task_workspaceId_status_idx" ON "Task"("workspaceId", "status");
CREATE INDEX "Task_workspaceId_category_idx" ON "Task"("workspaceId", "category");
CREATE INDEX "Task_workspaceId_dueAt_idx" ON "Task"("workspaceId", "dueAt");
CREATE INDEX "Task_extractedFromKnowledgeItemId_idx" ON "Task"("extractedFromKnowledgeItemId");
CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_extractedFromKnowledgeItemId_fkey" FOREIGN KEY ("extractedFromKnowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
