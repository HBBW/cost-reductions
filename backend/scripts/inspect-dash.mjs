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
  console.log('=== ideas: potential_cr & budget & jumlah idea per dept ===');
  const ideas = await pool.request().query(`
    SELECT i.department_id, COUNT(*) AS n, SUM(i.potential_cr) AS potential, SUM(i.budget) AS budget
    FROM dbo.${P}ideas i GROUP BY i.department_id`);
  console.table(ideas.recordset);
  console.log('=== idea_monthly: ada berapa baris, dan isinya diisi? ===');
  const im = await pool.request().query(`
    SELECT i.department_id, COUNT(*) AS rows_n,
           SUM(im.budget) AS budget_sum, SUM(im.actual_cost) AS actual_sum,
           SUM(im.budget - im.actual_cost) AS actual_cr
    FROM dbo.${P}idea_monthly im JOIN dbo.${P}ideas i ON i.id = im.idea_id
    GROUP BY i.department_id`);
  console.table(im.recordset);
  console.log('=== idea_potential_monthly ===');
  const pm = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.${P}idea_potential_monthly`);
  console.table(pm.recordset);
  console.log('=== year idea ===');
  const y = await pool.request().query(`SELECT year, COUNT(*) AS n FROM dbo.${P}ideas GROUP BY year`);
  console.table(y.recordset);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
