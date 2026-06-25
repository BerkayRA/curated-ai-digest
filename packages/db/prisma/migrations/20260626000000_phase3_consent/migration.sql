-- Phase 3 — self-serve growth: consent model + double opt-in.
--
-- Ordering is critical and the file MUST NOT be wrapped in BEGIN/COMMIT:
-- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block in Postgres.
-- Prisma `migrate deploy` runs each statement with autocommit, matching the
-- additive Phase 2 pattern (20260625100000_add_email_events).
--
-- Steps:
--   1. ADD VALUE 'pending' to SubscriberStatus (must precede any use of it).
--   2. CREATE new enum types ConsentMode / ConsentBasis.
--   3. topics.consent_mode — add nullable, backfill 'business', enforce NOT NULL + default.
--   4. subscriber_topics consent + confirm columns (all nullable by design).
--   5. Backfill existing memberships: basis='import', consentAt=createdAt, source='backfill'.
--   6. Unique index on confirm_token (Postgres treats NULLs as distinct → many NULLs OK).

-- Step 1: extend SubscriberStatus with 'pending'. Stand-alone, before any reference.
ALTER TYPE "SubscriberStatus" ADD VALUE 'pending';

-- Step 2: new enum types.
CREATE TYPE "ConsentMode" AS ENUM ('business', 'public');
CREATE TYPE "ConsentBasis" AS ENUM (
    'business_relationship',
    'double_opt_in',
    'import',
    'single_opt_in'
);

-- Step 3: topics.consent_mode — nullable → backfill → NOT NULL + default.
ALTER TABLE "topics" ADD COLUMN "consent_mode" "ConsentMode";
UPDATE "topics" SET "consent_mode" = 'business' WHERE "consent_mode" IS NULL;
ALTER TABLE "topics" ALTER COLUMN "consent_mode" SET NOT NULL;
ALTER TABLE "topics" ALTER COLUMN "consent_mode" SET DEFAULT 'business';

-- Step 4: subscriber_topics consent + confirm columns (stay nullable by design).
ALTER TABLE "subscriber_topics" ADD COLUMN "confirm_token"  TEXT;
ALTER TABLE "subscriber_topics" ADD COLUMN "consent_basis"  "ConsentBasis";
ALTER TABLE "subscriber_topics" ADD COLUMN "consent_at"     TIMESTAMP(3);
ALTER TABLE "subscriber_topics" ADD COLUMN "consent_source" TEXT;

-- Step 5: backfill existing memberships (e.g. the 3 enterprise-ai imports) with an
-- auditable lawful basis. Send behaviour is unchanged — status is untouched.
UPDATE "subscriber_topics"
SET
    "consent_basis"  = 'import',
    "consent_at"     = "created_at",
    "consent_source" = 'backfill'
WHERE "consent_basis" IS NULL;

-- Step 6: unique index for confirm_token. Multiple NULLs are permitted (NULLs are
-- distinct in a Postgres unique index); only non-NULL tokens must be unique.
CREATE UNIQUE INDEX "subscriber_topics_confirm_token_key"
    ON "subscriber_topics"("confirm_token");
