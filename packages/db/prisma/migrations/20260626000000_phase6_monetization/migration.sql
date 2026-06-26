-- CreateEnum
CREATE TYPE "TopicTier" AS ENUM ('free', 'premium');

-- CreateEnum
CREATE TYPE "IssueItemKind" AS ENUM ('editorial', 'sponsored');

-- AlterTable
ALTER TABLE "issue_items" ADD COLUMN     "kind" "IssueItemKind" NOT NULL DEFAULT 'editorial',
ADD COLUMN     "sponsor_id" TEXT;

-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "tier" "TopicTier" NOT NULL DEFAULT 'free';

-- CreateTable
CREATE TABLE "sponsors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website_url" TEXT NOT NULL,
    "logo_url" TEXT,
    "contact_email" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sponsors_active_idx" ON "sponsors"("active");

-- CreateIndex
CREATE INDEX "issue_items_sponsor_id_idx" ON "issue_items"("sponsor_id");

-- AddForeignKey
ALTER TABLE "issue_items" ADD CONSTRAINT "issue_items_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

