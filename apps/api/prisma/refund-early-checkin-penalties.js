const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.$queryRaw`
    SELECT
      h.id AS history_id,
      h.user_id,
      h.delta,
      h.reference_id AS campaign_id,
      u.trust_score
    FROM trust_score_history h
    JOIN users u ON u.id = h.user_id
    WHERE h.reason = 'late_check_in'::trust_score_reason
      AND h.delta < 0
      AND h.reference_type = 'campaign'
      AND h.reference_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM trust_score_history r
        WHERE r.reason = 'manual_penalty'::trust_score_reason
          AND r.reference_type = 'campaign'
          AND r.reference_id = h.reference_id
          AND r.note = 'refund early check-in penalty:' || h.id::text
      )
      AND EXISTS (
        SELECT 1
        FROM campaign_volunteer_assignments a
        JOIN volunteer_profiles vp ON vp.id = a.volunteer_id
        JOIN kitchen_campaigns c ON c.id = a.campaign_id
        LEFT JOIN campaign_shifts s ON s.id = a.shift_id
        WHERE vp.user_id = h.user_id
          AND a.campaign_id = h.reference_id
          AND a.check_in_time IS NOT NULL
          AND COALESCE(a.check_in_late_minutes, 0) > 0
          AND (
            (timezone('Asia/Ho_Chi_Minh', a.check_in_time)::date < COALESCE(a.work_date, c.scheduled_date))
            OR (
              timezone('Asia/Ho_Chi_Minh', a.check_in_time)::date = COALESCE(a.work_date, c.scheduled_date)
              AND timezone('Asia/Ho_Chi_Minh', a.check_in_time)::time < COALESCE(s.start_time, c.start_time)::time
            )
          )
      )
    ORDER BY h.created_at ASC
  `;

  let refunded = 0;
  for (const row of candidates) {
    const refundDelta = Math.abs(Number(row.delta));
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: row.user_id },
        select: { trustScore: true, status: true },
      });
      if (!user) return;

      const scoreBefore = user.trustScore;
      const scoreAfter = Math.min(100, scoreBefore + refundDelta);

      await tx.user.update({
        where: { id: row.user_id },
        data: {
          trustScore: scoreAfter,
          ...(user.status === 'suspended' && scoreAfter > 60 ? { status: 'active' } : {}),
        },
      });

      await tx.trustScoreHistory.create({
        data: {
          userId: row.user_id,
          delta: scoreAfter - scoreBefore,
          reason: 'manual_penalty',
          referenceType: 'campaign',
          referenceId: row.campaign_id,
          scoreBefore,
          scoreAfter,
          note: `refund early check-in penalty:${row.history_id}`,
        },
      });
    });
    refunded += 1;
  }

  console.log(`Refunded ${refunded} early check-in trust penalty record(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
