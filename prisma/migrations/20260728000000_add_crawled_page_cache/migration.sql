CREATE TABLE "CrawledPage" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "normalizedUrl" TEXT NOT NULL,
  "title" TEXT,
  "content" TEXT,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "httpStatus" INTEGER,
  "contentHash" TEXT,
  "errorCode" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrawledPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrawledPage_url_key" ON "CrawledPage"("url");
CREATE UNIQUE INDEX "CrawledPage_normalizedUrl_key" ON "CrawledPage"("normalizedUrl");
CREATE INDEX "CrawledPage_fetchedAt_idx" ON "CrawledPage"("fetchedAt");
CREATE INDEX "CrawledPage_status_idx" ON "CrawledPage"("status");
