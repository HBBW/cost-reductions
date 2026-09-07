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
  
  // Test 1: Check departments table
  const depts = await pool.request().query(`SELECT id, name FROM dbo.${P}departments WHERE is_active = 1`);
  console.log('=== Active Departments ===');
  console.table(depts.recordset);

  // Test 2: Check ideas for dept 0800
  const ideas = await pool.request()
    .input('year', sql.Int, 2026)
    .query(`SELECT id, name, department_id, potential_cr, budget FROM dbo.${P}ideas WHERE department_id = '0800' AND year = @year`);
  console.log('=== Ideas in dept 0800 (2026) ===');
  console.table(ideas.recordset);

  // Test 3: Check idea_potential_monthly
  const pot = await pool.request()
    .input('year', sql.Int, 2026)
    .query(`
      SELECT i.department_id, SUM(pm.potential_amount) AS potential_total
      FROM dbo.${P}idea_potential_monthly pm
      JOIN dbo.${P}ideas i ON i.id = pm.idea_id
      WHERE i.year = @year
      GROUP BY i.department_id
    `);
  console.log('=== Potential Monthly by Dept ===');
  console.table(pot.recordset);

  // Test 4: Check idea_monthly
  const im = await pool.request()
    .input('year', sql.Int, 2026)
    .query(`
      SELECT i.department_id,
             SUM(im.budget) AS budget_monthly_total,
             SUM(im.actual_cost) AS actual_cost_total,
             SUM(im.budget - im.actual_cost) AS actual_cr
      FROM dbo.${P}idea_monthly im
      JOIN dbo.${P}ideas i ON i.id = im.idea_id
      WHERE i.year = @year
      GROUP BY i.department_id
    `);
  console.log('=== Monthly Actual by Dept ===');
  console.table(im.recordset);

  await pool.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
