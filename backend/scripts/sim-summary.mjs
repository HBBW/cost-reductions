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
const year = 2026;
async function main() {
  const pool = await sql.connect(cfg);
  const sqlText = `
    SELECT d.id AS department_id, d.name AS department_name,
           COALESCE(pm_dept.potential_total, 0) AS potential,
           COALESCE(idea_agg.ideas_count, 0) AS ideas_count,
           COALESCE(month_agg.budget_monthly_total, 0) AS budget_monthly_total,
           COALESCE(month_agg.actual_cost_total, 0) AS actual_cost_total,
           COALESCE(month_agg.actual_cr, 0) AS actual_cr
    FROM dbo.${P}departments d
    LEFT JOIN (
      SELECT i.department_id, COUNT(DISTINCT i.id) AS ideas_count
      FROM dbo.${P}ideas i WHERE i.year = @p1 GROUP BY i.department_id
    ) idea_agg ON idea_agg.department_id = d.id
    LEFT JOIN (
      SELECT i.department_id, SUM(pm.potential_amount) AS potential_total
      FROM dbo.${P}idea_potential_monthly pm
      JOIN dbo.${P}ideas i ON i.id = pm.idea_id
      WHERE i.year = @p2 GROUP BY i.department_id
    ) pm_dept ON pm_dept.department_id = d.id
    LEFT JOIN (
      SELECT i.department_id,
             COALESCE(SUM(im.budget),0) AS budget_monthly_total,
             COALESCE(SUM(im.actual_cost),0) AS actual_cost_total,
             COALESCE(SUM(im.budget - im.actual_cost),0) AS actual_cr
      FROM dbo.${P}idea_monthly im
      JOIN dbo.${P}ideas i ON i.id = im.idea_id
      WHERE i.year = @p3 GROUP BY i.department_id
    ) month_agg ON month_agg.department_id = d.id
    WHERE d.is_active = 1 AND d.id IN ('0800')
    ORDER BY d.name`;
  const req = pool.request();
  req.input('p1', sql.Int, year); req.input('p2', sql.Int, year); req.input('p3', sql.Int, year);
  const rows = await req.query(sqlText);
  console.table(rows.recordset);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
