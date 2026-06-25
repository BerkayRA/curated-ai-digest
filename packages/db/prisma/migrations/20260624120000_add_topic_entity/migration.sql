-- Phase 1a — Topic entity + per-topic data isolation (ADR-0007).
--
-- Hand-authored because topic_id is a REQUIRED FK added to tables that already
-- hold rows. The safe order is: create the topics table + seed the default
-- topic, add nullable topic_id columns, backfill every existing row to that
-- topic, THEN enforce NOT NULL and swap the global unique indexes for composite
-- (topic, …) ones. Postgres DDL is transactional, so any failure rolls back.

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('active', 'paused');

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "audience" TEXT,
    "voice" TEXT,
    "status" "TopicStatus" NOT NULL DEFAULT 'active',
    "send_day_of_week" TEXT,
    "send_time" TEXT,
    "timezone" TEXT,
    "pipeline_lead_days" INTEGER,
    "auto_send_enabled" BOOLEAN,
    "from_address" TEXT,
    "reply_to" TEXT,
    "brand_logo_url" TEXT,
    "brand_color_hex" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");

-- CreateIndex
CREATE INDEX "topics_status_idx" ON "topics"("status");

-- Seed the default topic (the existing newsletter) with a stable id for backfill.
-- audience/voice left NULL so the pipeline prompts use their current hardcoded
-- text verbatim → zero behavior change for this topic.
INSERT INTO "topics" ("id", "slug", "name", "description", "status", "updated_at")
VALUES (
    'topic_enterprise_ai',
    'enterprise-ai',
    'on-prem & enterprise AI workflows',
    'Haftalık on-prem ve kurumsal yapay zeka haber digesti — Mega Bilgisayar müşterileri için.',
    'active',
    CURRENT_TIMESTAMP
);

-- Add topic_id columns (nullable for now so existing rows survive the add).
ALTER TABLE "issues" ADD COLUMN "topic_id" TEXT;
ALTER TABLE "candidate_articles" ADD COLUMN "topic_id" TEXT;
ALTER TABLE "ingest_runs" ADD COLUMN "topic_id" TEXT;
ALTER TABLE "pipeline_runs" ADD COLUMN "topic_id" TEXT;
ALTER TABLE "sources" ADD COLUMN "topic_id" TEXT;

-- Backfill every existing row to the default topic.
UPDATE "issues" SET "topic_id" = 'topic_enterprise_ai';
UPDATE "candidate_articles" SET "topic_id" = 'topic_enterprise_ai';
UPDATE "ingest_runs" SET "topic_id" = 'topic_enterprise_ai';
UPDATE "pipeline_runs" SET "topic_id" = 'topic_enterprise_ai';
UPDATE "sources" SET "topic_id" = 'topic_enterprise_ai';

-- Enforce NOT NULL on the required columns (ingest_runs/pipeline_runs stay nullable).
ALTER TABLE "issues" ALTER COLUMN "topic_id" SET NOT NULL;
ALTER TABLE "candidate_articles" ALTER COLUMN "topic_id" SET NOT NULL;
ALTER TABLE "sources" ALTER COLUMN "topic_id" SET NOT NULL;

-- DropIndex (old global uniqueness, now superseded by composite per-topic keys)
DROP INDEX "issues_iso_week_key";
DROP INDEX "candidate_articles_source_url_key";
DROP INDEX "candidate_articles_content_hash_key";
DROP INDEX "sources_type_url_key";

-- CreateIndex
CREATE INDEX "issues_topic_id_idx" ON "issues"("topic_id");
CREATE UNIQUE INDEX "issues_topic_id_iso_week_key" ON "issues"("topic_id", "iso_week");
CREATE INDEX "candidate_articles_topic_id_idx" ON "candidate_articles"("topic_id");
CREATE UNIQUE INDEX "candidate_articles_topic_id_source_url_key" ON "candidate_articles"("topic_id", "source_url");
CREATE UNIQUE INDEX "candidate_articles_topic_id_content_hash_key" ON "candidate_articles"("topic_id", "content_hash");
CREATE INDEX "ingest_runs_topic_id_idx" ON "ingest_runs"("topic_id");
CREATE INDEX "pipeline_runs_topic_id_idx" ON "pipeline_runs"("topic_id");
CREATE INDEX "sources_topic_id_idx" ON "sources"("topic_id");
CREATE UNIQUE INDEX "sources_topic_id_type_url_key" ON "sources"("topic_id", "type", "url");

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_articles" ADD CONSTRAINT "candidate_articles_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sources" ADD CONSTRAINT "sources_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
