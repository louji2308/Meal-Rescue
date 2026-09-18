const { Sequelize } = require('sequelize');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('No DATABASE_URL found');
    process.exit(1);
  }
  const sequelize = new Sequelize(url, { dialect: 'postgres', logging: false });
  const [results] = await sequelize.query("DELETE FROM users WHERE email = 'test@mealrescue.app'");
  console.log('Deleted rows:', results.rowCount);
  await sequelize.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
