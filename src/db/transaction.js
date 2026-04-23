const { pool } = require("./pool");

const RETRYABLE_ERROR_CODES = new Set(["40001", "40P01", "55P03"]);

function isRetryable(error) {
  return RETRYABLE_ERROR_CODES.has(error.code);
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Rollback failed", rollbackError);
  }
}

async function withTransaction(work, options = {}) {
  const maxRetries = options.maxRetries ?? 3;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await work(client, attempt);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await rollbackQuietly(client);

      if (attempt < maxRetries && isRetryable(error)) {
        continue;
      }

      throw error;
    } finally {
      client.release();
    }
  }

  throw new Error("Transaction exhausted all retries.");
}

module.exports = {
  withTransaction,
};
