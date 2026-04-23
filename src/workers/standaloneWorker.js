require("dotenv").config();

const { pool } = require("../db/pool");
const { startWorker } = require("./reconciliationWorker");

const stopWorker = startWorker();

async function shutdown() {
  stopWorker();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Standalone reconciliation worker started.");