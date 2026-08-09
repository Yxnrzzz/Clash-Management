-- CreateEnum
CREATE TYPE "AttachmentRole" AS ENUM ('ORIGINAL', 'CLASH_DETECTION', 'OTHER');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "role" "AttachmentRole" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "Clash" ADD COLUMN     "resolveByConsultant" TEXT,
ADD COLUMN     "resolveProposed" TEXT;
