-- AlterTable
ALTER TABLE "Discipline" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "whatsappNumber" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "emailEnabled" SET DEFAULT true,
ALTER COLUMN "whatsappEnabled" SET DEFAULT false;

-- AlterTable
ALTER TABLE "Priority" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
