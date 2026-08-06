-- Data-only migration: assignment is now restricted to active Engineers
-- (see ClashesService.assertAssigneeIsEngineer). Any clash currently
-- assigned to a non-Engineer (e.g. a Coordinator, from before this rule
-- existed) is unassigned rather than left in a now-invalid state.
--
-- No AuditLog row is written for this: AuditLog.actorId is a required FK to
-- User, and there is no honest actor for a system migration — using the
-- reporter or a random admin would fabricate history. The affected row
-- count printed by `prisma migrate deploy` is the record of this change.
UPDATE "Clash" SET "assigneeId" = NULL
WHERE "assigneeId" IN (SELECT id FROM "User" WHERE role <> 'ENGINEER');
