-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "brand_footer_text" TEXT,
ADD COLUMN     "brand_name" TEXT,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'tr';

