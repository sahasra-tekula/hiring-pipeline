require("dotenv").config();

const app = require("./app");
const config = require("./config");
const { pool } = require("./db/pool");
const { startWorker } = require("./workers/reconciliationWorker");

const server = app.listen(config.port, () => {
  console.log(`Hiring pipeline API listening on port ${config.port}`);
});

const stopWorker = startWorker();

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully.`);
  stopWorker();

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error("Graceful shutdown failed", error);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error("Graceful shutdown failed", error);
    process.exit(1);
  });
});