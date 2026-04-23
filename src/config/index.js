const parseNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }

  return value === "true";
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseNumber(process.env.PORT, 3000),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/hiring_pipeline",
  reconciler: {
    enabled: parseBoolean(process.env.RECONCILER_ENABLED, true),
    intervalMs: parseNumber(process.env.RECONCILER_INTERVAL_MS, 5000),
    batchSize: parseNumber(process.env.RECONCILER_BATCH_SIZE, 50),
  },
};
