-- Phase 1c — per-topic subscriber membership.
--
-- Introduces `subscriber_topics`: a subscriber (global email identity) opts into
-- one topic, with a per-topic status and unsubscribe token. Delivery and
-- per-topic opt-out are governed by these rows. `sends.subscriber_topic_id`
-- links each delivery to the membership it was sent under (nullable; existing
-- rows are left untouched).
--
-- Backfill (Step 6) attaches every existing subscriber to the seed
-- `enterprise-ai` topic, carrying over its current status and minting a fresh
-- per-topic unsubscribe token — so today's single newsletter keeps the exact
-- same recipient set with zero behavior change.

-- Step 1: nullable link column on sends (no backfill required)
ALTER TABLE "sends" ADD COLUMN     "subscriber_topic_id" TEXT;

-- Step 2: the join table
CREATE TABLE "subscriber_topics" (
    "id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'active',
    "unsubscribe_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriber_topics_pkey" PRIMARY KEY ("id")
);

-- Step 3: constraints + indexes (before backfill so any seed dup is caught)
CREATE UNIQUE INDEX "subscriber_topics_unsubscribe_token_key" ON "subscriber_topics"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "subscriber_topics_topic_id_status_idx" ON "subscriber_topics"("topic_id", "status");

-- CreateIndex
CREATE INDEX "subscriber_topics_subscriber_id_idx" ON "subscriber_topics"("subscriber_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriber_topics_subscriber_id_topic_id_key" ON "subscriber_topics"("subscriber_id", "topic_id");

-- Step 4: foreign keys
ALTER TABLE "subscriber_topics" ADD CONSTRAINT "subscriber_topics_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriber_topics" ADD CONSTRAINT "subscriber_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sends" ADD CONSTRAINT "sends_subscriber_topic_id_fkey" FOREIGN KEY ("subscriber_topic_id") REFERENCES "subscriber_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: backfill — every existing subscriber joins the seed enterprise-ai
-- topic, carrying its current status and a fresh per-topic token. The token is
-- intentionally distinct from subscribers.unsubscribe_token (the global token);
-- gen_random_uuid() is built in on Postgres 13+.
INSERT INTO "subscriber_topics"
    ("id", "subscriber_id", "topic_id", "status", "unsubscribe_token", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    s."id",
    'topic_enterprise_ai',
    s."status",
    gen_random_uuid()::text,
    NOW(),
    NOW()
FROM "subscribers" s;
