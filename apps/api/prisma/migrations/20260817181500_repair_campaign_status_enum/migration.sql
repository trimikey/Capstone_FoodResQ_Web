-- Repair databases where 20260817030000 was recorded as applied while the
-- campaign_status enum still kept legacy values draft/open.
DO $$
DECLARE
  campaign_status_values TEXT[];
BEGIN
  SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    INTO campaign_status_values
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'campaign_status';

  IF campaign_status_values IS NOT NULL
     AND NOT ('approved' = ANY(campaign_status_values))
  THEN
    ALTER TABLE "kitchen_campaigns"
      ALTER COLUMN "status" DROP DEFAULT;

    CREATE TYPE "campaign_status_repair" AS ENUM (
      'pending_approval',
      'approved',
      'in_progress',
      'completed',
      'cancelled'
    );

    ALTER TABLE "kitchen_campaigns"
      ALTER COLUMN "status" TYPE "campaign_status_repair"
      USING (
        CASE "status"::text
          WHEN 'draft' THEN 'pending_approval'
          WHEN 'open' THEN 'approved'
          ELSE "status"::text
        END
      )::"campaign_status_repair";

    DROP TYPE "campaign_status";
    ALTER TYPE "campaign_status_repair" RENAME TO "campaign_status";

    ALTER TABLE "kitchen_campaigns"
      ALTER COLUMN "status" SET DEFAULT 'pending_approval'::"campaign_status";
  END IF;
END $$;
