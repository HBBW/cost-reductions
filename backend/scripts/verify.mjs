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
  const rows = await pool.request().query(`
    SELECT i.id, i.name, i.budget, i.potential_cr,
           COUNT(im.month) AS rows_count,
           SUM(CASE WHEN im.budget <> 0 OR im.actual_cost <> 0 THEN 1 ELSE 0 END) AS filled_now
    FROM dbo.${P}ideas i LEFT JOIN dbo.${P}idea_monthly im ON im.idea_id = i.id
    WHERE i.id = 10 GROUP BY i.id, i.name, i.budget, i.potential_cr`);
  console.table(rows.recordset);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
