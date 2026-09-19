const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5433, database: 'meal_rescue_dev', user: 'meal_rescue', password: 'local_password' });

async function main() {
  const res = await pool.query("SELECT id, email FROM users WHERE id = '49c69623-5fe8-4012-b6da-a29c9663ac53'");
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
