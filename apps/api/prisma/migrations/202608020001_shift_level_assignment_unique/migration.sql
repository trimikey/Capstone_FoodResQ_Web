-- Allow one volunteer to join multiple shifts with the same campaign role.
-- The old campaign-level unique index blocks valid chef/waiter/shipper shift assignments.
DROP INDEX IF EXISTS "campaign_volunteer_assignments_campaign_id_volunteer_id_rol_key";

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_volunteer_assignments_shift_id_volunteer_id_role_key"
  ON "campaign_volunteer_assignments"("shift_id", "volunteer_id", "role");

CREATE INDEX IF NOT EXISTS "campaign_volunteer_assignments_campaign_id_volunteer_id_role_idx"
  ON "campaign_volunteer_assignments"("campaign_id", "volunteer_id", "role");
