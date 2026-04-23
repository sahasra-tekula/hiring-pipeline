const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect()
  .then(() => console.log("DB Connected ✅"))
  .catch(err => console.error("DB Error ❌", err));

module.exports = { pool };