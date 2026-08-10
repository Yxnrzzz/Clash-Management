-- AlterTable
ALTER TABLE "Clash" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Clash_projectId_deletedAt_createdAt_idx" ON "Clash"("projectId", "deletedAt", "createdAt");
