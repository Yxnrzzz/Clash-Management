-- DropIndex
DROP INDEX "Clash_projectId_statusId_priorityId_disciplineId_zoneId_ass_idx";

-- CreateIndex
CREATE INDEX "AuditLog_clashId_createdAt_idx" ON "AuditLog"("clashId", "createdAt");

-- CreateIndex
CREATE INDEX "Clash_projectId_createdAt_idx" ON "Clash"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Clash_projectId_statusId_idx" ON "Clash"("projectId", "statusId");

-- CreateIndex
CREATE INDEX "Clash_projectId_assigneeId_idx" ON "Clash"("projectId", "assigneeId");

-- CreateIndex
CREATE INDEX "Clash_projectId_dueDate_idx" ON "Clash"("projectId", "dueDate");

-- CreateIndex
CREATE INDEX "Comment_clashId_createdAt_idx" ON "Comment"("clashId", "createdAt");
