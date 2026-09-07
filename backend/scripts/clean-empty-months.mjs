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
  const del = await pool.request().query(`DELETE FROM dbo.${P}idea_monthly WHERE budget = 0 AND actual_cost = 0`);
  const upd = await pool.request().query(`
    UPDATE i SET budget = m.total
    FROM dbo.${P}ideas i
    JOIN (SELECT idea_id, SUM(budget) AS total FROM dbo.${P}idea_monthly GROUP BY idea_id) m ON m.idea_id = i.id`);
  console.log('empty rows deleted:', del.rowsAffected[0]);
  console.log('ideas budget synced:', upd.rowsAffected[0]);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
