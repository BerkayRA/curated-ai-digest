-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('draft', 'in_review', 'approved', 'scheduled', 'sent', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('candidate', 'selected', 'rejected');

-- CreateEnum
CREATE TYPE "SendStatus" AS ENUM ('queued', 'sent', 'delivered', 'bounced', 'failed');

-- CreateEnum
CREATE TYPE "EmailProviderKind" AS ENUM ('microsoft_graph', 'acs_email', 'resend');

-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('active', 'unsubscribed', 'bounced');

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "iso_week" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'draft',
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "body_html" TEXT,
    "body_json" JSONB,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "auto_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_articles" (
    "id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "raw_excerpt" TEXT,
    "published_at" TIMESTAMP(3),
    "content_hash" TEXT NOT NULL,
    "importance_score" DOUBLE PRECISION,
    "relevance_score" DOUBLE PRECISION,
    "status" "ArticleStatus" NOT NULL DEFAULT 'candidate',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingest_run_id" TEXT,

    CONSTRAINT "candidate_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_items" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "candidate_article_id" TEXT,
    "order" INTEGER NOT NULL,
    "title_tr" TEXT NOT NULL,
    "summary_tr" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "fact_check_notes" TEXT,
    "qa_flags" JSONB,

    CONSTRAINT "issue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "company" TEXT,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'active',
    "locale" TEXT NOT NULL DEFAULT 'tr-TR',
    "unsubscribe_token" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "auto_send_enabled" BOOLEAN NOT NULL DEFAULT false,
    "send_day_of_week" TEXT NOT NULL,
    "send_time" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "active_provider" "EmailProviderKind" NOT NULL DEFAULT 'acs_email',
    "from_address" TEXT NOT NULL,
    "reply_to" TEXT,
    "pipeline_lead_days" INTEGER NOT NULL DEFAULT 2,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sends" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "status" "SendStatus" NOT NULL DEFAULT 'queued',
    "provider_message_id" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_runs" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "candidate_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error" TEXT,

    CONSTRAINT "ingest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT,
    "stage" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issues_iso_week_key" ON "issues"("iso_week");

-- CreateIndex
CREATE INDEX "issues_status_idx" ON "issues"("status");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_articles_source_url_key" ON "candidate_articles"("source_url");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_articles_content_hash_key" ON "candidate_articles"("content_hash");

-- CreateIndex
CREATE INDEX "candidate_articles_status_idx" ON "candidate_articles"("status");

-- CreateIndex
CREATE INDEX "candidate_articles_ingest_run_id_idx" ON "candidate_articles"("ingest_run_id");

-- CreateIndex
CREATE INDEX "issue_items_issue_id_idx" ON "issue_items"("issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_items_issue_id_order_key" ON "issue_items"("issue_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_email_key" ON "subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_unsubscribe_token_key" ON "subscribers"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "subscribers_status_idx" ON "subscribers"("status");

-- CreateIndex
CREATE INDEX "sends_issue_id_idx" ON "sends"("issue_id");

-- CreateIndex
CREATE INDEX "sends_subscriber_id_idx" ON "sends"("subscriber_id");

-- CreateIndex
CREATE INDEX "ingest_runs_status_idx" ON "ingest_runs"("status");

-- CreateIndex
CREATE INDEX "pipeline_runs_issue_id_idx" ON "pipeline_runs"("issue_id");

-- CreateIndex
CREATE INDEX "pipeline_runs_stage_idx" ON "pipeline_runs"("stage");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- AddForeignKey
ALTER TABLE "candidate_articles" ADD CONSTRAINT "candidate_articles_ingest_run_id_fkey" FOREIGN KEY ("ingest_run_id") REFERENCES "ingest_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_items" ADD CONSTRAINT "issue_items_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sends" ADD CONSTRAINT "sends_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
