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
    SELECT i.id, i.name, COUNT(im.month) AS filled,
           SUM(CASE WHEN im.budget > 0 THEN 1 ELSE 0 END) AS budget_gt0,
           SUM(CASE WHEN im.actual_cost > 0 THEN 1 ELSE 0 END) AS actual_gt0,
           SUM(CASE WHEN im.budget = 0 AND im.actual_cost = 0 THEN 1 ELSE 0 END) AS both_zero
    FROM dbo.${P}ideas i
    LEFT JOIN dbo.${P}idea_monthly im ON im.idea_id = i.id
    GROUP BY i.id, i.name
    HAVING COUNT(im.month) > 0
    ORDER BY i.id
  `);
  console.table(rows.recordset);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
