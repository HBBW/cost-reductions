import 'dotenv/config';
import sql from 'mssql';
const cfg = {
  server: process.env.MSSQL_HOST,
  port: Number(process.env.MSSQL_PORT),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: process.env.MSSQL_ENCRYPT === 'true', trustServerCertificate: true }
};
const P = process.env.DB_TABLE_PREFIX || '';
async function main() {
  const pool = await sql.connect(cfg);
  const upd = await pool.request().query(`UPDATE dbo.${P}ideas SET budget = 0`);
  console.log('ideas budget zeroed:', upd.rowsAffected[0]);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
