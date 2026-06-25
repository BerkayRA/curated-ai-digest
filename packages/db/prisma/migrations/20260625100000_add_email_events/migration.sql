-- Phase 2 — engagement analytics.
--
-- Adds `email_events` (open/click from tracking hooks; delivered/bounced/
-- complaint from provider webhooks) and a per-send `track_token` embedded in
-- the open pixel + click links. Purely additive — no FK into a populated table
-- besides the self-contained backfill of track_token below.

-- Step 1: event type enum
CREATE TYPE "EmailEventType" AS ENUM ('open', 'click', 'delivered', 'bounced', 'complaint');

-- Step 2: track_token on sends — add nullable, backfill, then enforce NOT NULL
-- + uniqueness (safe whether or not sends already has rows).
ALTER TABLE "sends" ADD COLUMN "track_token" TEXT;
UPDATE "sends" SET "track_token" = gen_random_uuid()::text WHERE "track_token" IS NULL;
ALTER TABLE "sends" ALTER COLUMN "track_token" SET NOT NULL;
CREATE UNIQUE INDEX "sends_track_token_key" ON "sends"("track_token");

-- Step 3: email_events table
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "send_id" TEXT NOT NULL,
    "type" "EmailEventType" NOT NULL,
    "url" TEXT,
    "url_index" INTEGER,
    "ip_hash" TEXT,
    "ua_class" TEXT,
    "provider_event_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- Step 4: indexes
CREATE UNIQUE INDEX "email_events_provider_event_id_key" ON "email_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "email_events_send_id_idx" ON "email_events"("send_id");

-- CreateIndex
CREATE INDEX "email_events_type_idx" ON "email_events"("type");

-- Step 5: foreign key
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_send_id_fkey" FOREIGN KEY ("send_id") REFERENCES "sends"("id") ON DELETE CASCADE ON UPDATE CASCADE;
