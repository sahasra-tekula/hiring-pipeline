require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { pool } = require("./pool");

async function main() {
  const migrationPath = path.join(__dirname, "../../sql/001_init.sql");
  const sql = await fs.readFile(migrationPath, "utf8");

  await pool.query(sql);
  console.log("Migration applied successfully.");
}

main()
  .catch((error) => {
    console.error("Migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
