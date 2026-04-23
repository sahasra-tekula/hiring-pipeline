async function upsert(client, applicant) {
  const result = await client.query(
    `
      INSERT INTO applicants (id, name, email, metadata)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        metadata = applicants.metadata || EXCLUDED.metadata
      RETURNING *
    `,
    [
      applicant.id,
      applicant.name,
      applicant.email,
      JSON.stringify(applicant.metadata || {}),
    ],
  );

  return result.rows[0];
}

module.exports = {
  upsert,
};