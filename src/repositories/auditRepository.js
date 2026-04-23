async function insert(client, event) {
  const result = await client.query(
    `
      INSERT INTO application_events (
        application_id,
        job_id,
        applicant_id,
        event_type,
        actor_type,
        actor_id,
        reason,
        from_status,
        to_status,
        from_ack_state,
        to_ack_state,
        from_queue_token,
        to_queue_token,
        metadata
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
      )
      RETURNING *
    `,
    [
      event.application_id,
      event.job_id,
      event.applicant_id,
      event.event_type,
      event.actor_type,
      event.actor_id || null,
      event.reason || null,
      event.from_status || null,
      event.to_status || null,
      event.from_ack_state || null,
      event.to_ack_state || null,
      event.from_queue_token ?? null,
      event.to_queue_token ?? null,
      JSON.stringify(event.metadata || {}),
    ],
  );

  return result.rows[0];
}

async function listByJob(client, jobId, limit) {
  const result = await client.query(
    `
      SELECT *
      FROM application_events
      WHERE job_id = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2
    `,
    [jobId, limit],
  );

  return result.rows;
}

module.exports = {
  insert,
  listByJob,
};