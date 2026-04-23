async function create(client, application) {
  const result = await client.query(
    `
      INSERT INTO applications (
        id,
        job_id,
        applicant_id,
        status,
        ack_state,
        queue_token,
        waitlist_entered_at,
        waitlist_eligible_at,
        last_promoted_at,
        ack_deadline_at,
        waitlist_penalty_count,
        applied_at,
        metadata
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
      )
      RETURNING *
    `,
    [
      application.id,
      application.job_id,
      application.applicant_id,
      application.status,
      application.ack_state,
      application.queue_token,
      application.waitlist_entered_at,
      application.waitlist_eligible_at,
      application.last_promoted_at,
      application.ack_deadline_at,
      application.waitlist_penalty_count ?? 0,
      application.applied_at,
      JSON.stringify(application.metadata || {}),
    ],
  );

  return result.rows[0];
}

async function findById(client, applicationId) {
  const result = await client.query("SELECT * FROM applications WHERE id = $1", [
    applicationId,
  ]);
  return result.rows[0] || null;
}

async function findByIdForUpdate(client, applicationId) {
  const result = await client.query(
    "SELECT * FROM applications WHERE id = $1 FOR UPDATE",
    [applicationId],
  );
  return result.rows[0] || null;
}

async function findByJobAndApplicant(client, jobId, applicantId) {
  const result = await client.query(
    `
      SELECT *
      FROM applications
      WHERE job_id = $1 AND applicant_id = $2
    `,
    [jobId, applicantId],
  );

  return result.rows[0] || null;
}

async function findDetailedById(client, applicationId) {
  const result = await client.query(
    `
      SELECT
        a.*,
        j.title AS job_title,
        j.active_capacity,
        j.active_count,
        j.ack_window_seconds,
        j.decay_cooldown_seconds,
        ap.name AS applicant_name,
        ap.email AS applicant_email
      FROM applications a
      INNER JOIN jobs j ON j.id = a.job_id
      INNER JOIN applicants ap ON ap.id = a.applicant_id
      WHERE a.id = $1
    `,
    [applicationId],
  );

  return result.rows[0] || null;
}

async function countQueueAhead(client, application) {
  const result = await client.query(
    `
      SELECT COUNT(*)::INTEGER AS queue_ahead
      FROM applications
      WHERE job_id = $1
        AND status = 'WAITLIST'
        AND (
          waitlist_eligible_at < $2
          OR (
            waitlist_eligible_at = $2
            AND queue_token < $3
          )
          OR (
            waitlist_eligible_at = $2
            AND queue_token = $3
            AND id::text < $4::text
          )
        )
    `,
    [
      application.job_id,
      application.waitlist_eligible_at,
      application.queue_token,
      application.id,
    ],
  );

  return result.rows[0].queue_ahead;
}

async function findNextPromotableWaitlistedForUpdate(client, jobId, now) {
  const result = await client.query(
    `
      SELECT *
      FROM applications
      WHERE job_id = $1
  AND status = 'WAITLIST'
ORDER BY waitlist_eligible_at ASC, queue_token ASC, created_at ASC, id ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
    `,
    [jobId],
  );

  return result.rows[0] || null;
}

async function findExpiredPendingAcknowledgementsForUpdate(client, jobId, now) {
  const result = await client.query(
    `
      SELECT *
      FROM applications
      WHERE job_id = $1
        AND status = 'ACTIVE'
        AND ack_state = 'PENDING'
        AND ack_deadline_at <= $2
      ORDER BY ack_deadline_at ASC, last_promoted_at ASC, id ASC
      FOR UPDATE
    `,
    [jobId, now],
  );

  return result.rows;
}

async function promoteToActivePendingAck(client, applicationId, fields) {
  const result = await client.query(
    `
      UPDATE applications
      SET status = 'ACTIVE',
          ack_state = 'PENDING',
          queue_token = NULL,
          waitlist_entered_at = NULL,
          waitlist_eligible_at = NULL,
          last_promoted_at = $2,
          ack_deadline_at = $3,
          exited_at = NULL,
          exit_reason = NULL,
          version = version + 1
      WHERE id = $1
      RETURNING *
    `,
    [applicationId, fields.last_promoted_at, fields.ack_deadline_at],
  );

  return result.rows[0];
}

async function acknowledge(client, applicationId) {
  const result = await client.query(
    `
      UPDATE applications
      SET ack_state = 'ACKNOWLEDGED',
          ack_deadline_at = NULL,
          version = version + 1
      WHERE id = $1
      RETURNING *
    `,
    [applicationId],
  );

  return result.rows[0];
}

async function moveToWaitlist(client, applicationId, fields) {
  const result = await client.query(
    `
      UPDATE applications
      SET status = 'WAITLIST',
          ack_state = 'NOT_REQUIRED',
          queue_token = $2,
          waitlist_entered_at = $3,
          waitlist_eligible_at = $4,
          ack_deadline_at = NULL,
          exited_at = NULL,
          exit_reason = NULL,
          waitlist_penalty_count = $5,
          version = version + 1
      WHERE id = $1
      RETURNING *
    `,
    [
      applicationId,
      fields.queue_token,
      fields.waitlist_entered_at,
      fields.waitlist_eligible_at,
      fields.waitlist_penalty_count,
    ],
  );

  return result.rows[0];
}

async function markExited(client, applicationId, fields) {
  const result = await client.query(
    `
      UPDATE applications
      SET status = 'EXITED',
          ack_state = 'NOT_REQUIRED',
          queue_token = NULL,
          waitlist_entered_at = NULL,
          waitlist_eligible_at = NULL,
          ack_deadline_at = NULL,
          exited_at = $2,
          exit_reason = $3,
          version = version + 1
      WHERE id = $1
      RETURNING *
    `,
    [applicationId, fields.exited_at, fields.exit_reason],
  );

  return result.rows[0];
}

async function listJobsWithExpiredAcknowledgements(client, limit) {
  const result = await client.query(
    `
      SELECT DISTINCT job_id
      FROM applications
      WHERE status = 'ACTIVE'
        AND ack_state = 'PENDING'
        AND ack_deadline_at <= NOW()
      ORDER BY job_id ASC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row) => row.job_id);
}

module.exports = {
  acknowledge,
  countQueueAhead,
  create,
  findById,
  findByIdForUpdate,
  findByJobAndApplicant,
  findDetailedById,
  findExpiredPendingAcknowledgementsForUpdate,
  findNextPromotableWaitlistedForUpdate,
  listJobsWithExpiredAcknowledgements,
  markExited,
  moveToWaitlist,
  promoteToActivePendingAck,
};