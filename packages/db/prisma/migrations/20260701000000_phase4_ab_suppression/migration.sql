-- CreateEnum
CREATE TYPE "AbStatus" AS ENUM ('none', 'testing', 'selecting', 'completed');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('hard_bounce', 'soft_bounce_threshold', 'complaint', 'manual');

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "ab_holdout_minutes" INTEGER,
ADD COLUMN     "ab_status" "AbStatus" NOT NULL DEFAULT 'none',
ADD COLUMN     "ab_winner_variant_index" INTEGER;

-- AlterTable
ALTER TABLE "sends" ADD COLUMN     "variant_index" INTEGER;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "dkim_selector" TEXT;

-- CreateTable
CREATE TABLE "subject_variants" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "variant_index" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "test_fraction" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "open_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subject_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT NOT NULL,
    "bounce_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subject_variants_issue_id_idx" ON "subject_variants"("issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_variants_issue_id_variant_index_key" ON "subject_variants"("issue_id", "variant_index");

-- CreateIndex
CREATE UNIQUE INDEX "suppressions_email_key" ON "suppressions"("email");

-- CreateIndex
CREATE INDEX "suppressions_email_idx" ON "suppressions"("email");

-- AddForeignKey
ALTER TABLE "subject_variants" ADD CONSTRAINT "subject_variants_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

