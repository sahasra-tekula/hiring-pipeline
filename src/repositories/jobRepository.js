async function create(client, job) {
  const result = await client.query(
    `
      INSERT INTO jobs (
        id,
        title,
        description,
        active_capacity,
        ack_window_seconds,
        decay_cooldown_seconds
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      job.id,
      job.title,
      job.description,
      job.active_capacity,
      job.ack_window_seconds,
      job.decay_cooldown_seconds,
    ],
  );

  return result.rows[0];
}

async function findById(client, jobId) {
  const result = await client.query("SELECT * FROM jobs WHERE id = $1", [jobId]);
  return result.rows[0] || null;
}

async function findByIdForUpdate(client, jobId) {
  const result = await client.query("SELECT * FROM jobs WHERE id = $1 FOR UPDATE", [
    jobId,
  ]);
  return result.rows[0] || null;
}

async function updateCounters(client, job) {
  const result = await client.query(
    `
      UPDATE jobs
      SET active_count = $2,
          waitlist_sequence = $3
      WHERE id = $1
      RETURNING *
    `,
    [job.id, job.active_count, job.waitlist_sequence],
  );

  return result.rows[0];
}

async function listUnderfilledJobs(client, limit) {
  const result = await client.query(
    `
      SELECT id
      FROM jobs
      WHERE active_count < active_capacity
      ORDER BY updated_at ASC, id ASC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row) => row.id);
}

module.exports = {
  create,
  findById,
  findByIdForUpdate,
  listUnderfilledJobs,
  updateCounters,
};