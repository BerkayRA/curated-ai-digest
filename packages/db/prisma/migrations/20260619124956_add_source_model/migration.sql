-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('rss', 'radar', 'exa');

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "last_run_at" TIMESTAMP(3),
    "last_status" TEXT,
    "last_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sources_enabled_idx" ON "sources"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "sources_type_url_key" ON "sources"("type", "url");
