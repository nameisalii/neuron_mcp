-- CreateTable
CREATE TABLE "KnowledgeRelationship" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceKnowledgeItemId" TEXT NOT NULL,
    "targetKnowledgeItemId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemporalKnowledgeVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersedesId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "sourceEvidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemporalKnowledgeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceClaim" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceLink" (
    "id" TEXT NOT NULL,
    "evidenceClaimId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPPORTS',
    "relationship" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeContradiction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statementIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "likelyCurrentTruthId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" JSONB,
    "fingerprint" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeContradiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaleKnowledgeFinding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "staleScore" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lastVerifiedAt" TIMESTAMP(3),
    "relevantNewerItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendedAction" TEXT,
    "dismissedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaleKnowledgeFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceChange" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "significance" DOUBLE PRECISION NOT NULL,
    "evidenceClaimId" TEXT,
    "relatedKnowledgeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelligenceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveredProcess" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "frequency" INTEGER NOT NULL,
    "averageDurationMs" BIGINT,
    "participants" JSONB,
    "deviations" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL,
    "lastObservedAt" TIMESTAMP(3) NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveredProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceFeedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousValue" JSONB,
    "correctedValue" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelligenceFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeHealthSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "coverage" DOUBLE PRECISION NOT NULL,
    "freshness" DOUBLE PRECISION NOT NULL,
    "consistency" DOUBLE PRECISION NOT NULL,
    "connectivity" DOUBLE PRECISION NOT NULL,
    "distribution" DOUBLE PRECISION NOT NULL,
    "findings" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeRelationship_workspaceId_sourceKnowledgeItemId_con_idx" ON "KnowledgeRelationship"("workspaceId", "sourceKnowledgeItemId", "confidence");

-- CreateIndex
CREATE INDEX "KnowledgeRelationship_workspaceId_targetKnowledgeItemId_con_idx" ON "KnowledgeRelationship"("workspaceId", "targetKnowledgeItemId", "confidence");

-- CreateIndex
CREATE INDEX "KnowledgeRelationship_workspaceId_relationshipType_idx" ON "KnowledgeRelationship"("workspaceId", "relationshipType");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeRelationship_sourceKnowledgeItemId_targetKnowledge_key" ON "KnowledgeRelationship"("sourceKnowledgeItemId", "targetKnowledgeItemId", "relationshipType");

-- CreateIndex
CREATE INDEX "TemporalKnowledgeVersion_workspaceId_subjectKey_isCurrent_idx" ON "TemporalKnowledgeVersion"("workspaceId", "subjectKey", "isCurrent");

-- CreateIndex
CREATE INDEX "TemporalKnowledgeVersion_workspaceId_subjectKey_validFrom_v_idx" ON "TemporalKnowledgeVersion"("workspaceId", "subjectKey", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "TemporalKnowledgeVersion_knowledgeItemId_idx" ON "TemporalKnowledgeVersion"("knowledgeItemId");

-- CreateIndex
CREATE INDEX "TemporalKnowledgeVersion_supersedesId_idx" ON "TemporalKnowledgeVersion"("supersedesId");

-- CreateIndex
CREATE INDEX "EvidenceClaim_workspaceId_targetType_targetId_idx" ON "EvidenceClaim"("workspaceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "EvidenceClaim_workspaceId_confidence_idx" ON "EvidenceClaim"("workspaceId", "confidence");

-- CreateIndex
CREATE INDEX "EvidenceLink_knowledgeItemId_idx" ON "EvidenceLink"("knowledgeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceLink_evidenceClaimId_knowledgeItemId_role_key" ON "EvidenceLink"("evidenceClaimId", "knowledgeItemId", "role");

-- CreateIndex
CREATE INDEX "KnowledgeContradiction_workspaceId_status_confidence_idx" ON "KnowledgeContradiction"("workspaceId", "status", "confidence");

-- CreateIndex
CREATE INDEX "KnowledgeContradiction_workspaceId_subjectKey_idx" ON "KnowledgeContradiction"("workspaceId", "subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeContradiction_workspaceId_fingerprint_key" ON "KnowledgeContradiction"("workspaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "StaleKnowledgeFinding_workspaceId_status_staleScore_idx" ON "StaleKnowledgeFinding"("workspaceId", "status", "staleScore");

-- CreateIndex
CREATE UNIQUE INDEX "StaleKnowledgeFinding_workspaceId_knowledgeItemId_key" ON "StaleKnowledgeFinding"("workspaceId", "knowledgeItemId");

-- CreateIndex
CREATE INDEX "IntelligenceChange_workspaceId_occurredAt_idx" ON "IntelligenceChange"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "IntelligenceChange_workspaceId_significance_occurredAt_idx" ON "IntelligenceChange"("workspaceId", "significance", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceChange_workspaceId_fingerprint_key" ON "IntelligenceChange"("workspaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "DiscoveredProcess_workspaceId_confidence_lastObservedAt_idx" ON "DiscoveredProcess"("workspaceId", "confidence", "lastObservedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredProcess_workspaceId_fingerprint_key" ON "DiscoveredProcess"("workspaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "IntelligenceFeedback_workspaceId_targetType_targetId_idx" ON "IntelligenceFeedback"("workspaceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "IntelligenceFeedback_workspaceId_userId_createdAt_idx" ON "IntelligenceFeedback"("workspaceId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeHealthSnapshot_workspaceId_calculatedAt_idx" ON "KnowledgeHealthSnapshot"("workspaceId", "calculatedAt");

-- AddForeignKey
ALTER TABLE "KnowledgeRelationship" ADD CONSTRAINT "KnowledgeRelationship_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRelationship" ADD CONSTRAINT "KnowledgeRelationship_sourceKnowledgeItemId_fkey" FOREIGN KEY ("sourceKnowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRelationship" ADD CONSTRAINT "KnowledgeRelationship_targetKnowledgeItemId_fkey" FOREIGN KEY ("targetKnowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporalKnowledgeVersion" ADD CONSTRAINT "TemporalKnowledgeVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporalKnowledgeVersion" ADD CONSTRAINT "TemporalKnowledgeVersion_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporalKnowledgeVersion" ADD CONSTRAINT "TemporalKnowledgeVersion_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "TemporalKnowledgeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceClaim" ADD CONSTRAINT "EvidenceClaim_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_evidenceClaimId_fkey" FOREIGN KEY ("evidenceClaimId") REFERENCES "EvidenceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeContradiction" ADD CONSTRAINT "KnowledgeContradiction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaleKnowledgeFinding" ADD CONSTRAINT "StaleKnowledgeFinding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceChange" ADD CONSTRAINT "IntelligenceChange_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveredProcess" ADD CONSTRAINT "DiscoveredProcess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceFeedback" ADD CONSTRAINT "IntelligenceFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeHealthSnapshot" ADD CONSTRAINT "KnowledgeHealthSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "SlackSelectedConversation_slackUserConnectionId_conversationId_" RENAME TO "SlackSelectedConversation_slackUserConnectionId_conversatio_key";
