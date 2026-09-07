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
  // Cari dept Information & Technology
  const depts = await pool.request().query(`SELECT id, name FROM dbo.${P}departments WHERE name LIKE '%Information%' OR name LIKE '%Technology%' OR name LIKE '%IT%'`);
  console.table(depts.recordset);
  
  // Cek idea untuk dept tersebut
  const ideas = await pool.request().query(`
    SELECT i.id, i.name, i.department_id, i.potential_cr, i.budget,
           COUNT(im.month) AS filled_months
    FROM dbo.${P}ideas i
    LEFT JOIN dbo.${P}idea_monthly im ON im.idea_id = i.id
    WHERE i.department_id = '0800' -- assuming
    GROUP BY i.id, i.name, i.department_id, i.potential_cr, i.budget
  `);
  console.log('=== ideas dept 0800 ===');
  console.table(ideas.recordset);
  
  // Cek potential monthly untuk dept 0800
  const pm = await pool.request().query(`
    SELECT pm.idea_id, SUM(pm.potential_amount) AS total_potential
    FROM dbo.${P}idea_potential_monthly pm
    JOIN dbo.${P}ideas i ON i.id = pm.idea_id
    WHERE i.department_id = '0800'
    GROUP BY pm.idea_id
  `);
  console.log('=== potential monthly dept 0800 ===');
  console.table(pm.recordset);
  
  // Cek user
  const users = await pool.request().query(`SELECT RTRIM(username) AS username, RTRIM(name) AS name, RTRIM(department_id) AS dept_id, role FROM dbo.${P}users WHERE name LIKE '%HABIBI%' OR name LIKE '%WIDAYANTO%'`);
  console.log('=== user HABIBI ===');
  console.table(users.recordset);
  
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
