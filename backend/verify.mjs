import mssql from 'mssql';

async function main() {
  const pool = await new mssql.ConnectionPool({
    server: '10.19.25.27',
    port: 1433,
    user: 'sa',
    password: '$ilver13oy',
    database: 'BMC',
    options: { encrypt: false }
  }).connect();

  const users = await pool.request().query('SELECT TOP 5 id, username, name, role, is_active, department_id FROM dbo.CR_users');
  console.log('=== SAMPLE USERS (VIEW CR_users) ===');
  users.recordset.forEach(u => console.log('  ', JSON.stringify(u)));

  const depts = await pool.request().query('SELECT TOP 8 id, name, is_active FROM dbo.CR_departments ORDER BY name');
  console.log('=== SAMPLE DEPARTMENTS (VIEW CR_departments) ===');
  depts.recordset.forEach(d => console.log('  ', JSON.stringify(d)));

  const counts = await pool.request().query(`
    SELECT 
      (SELECT COUNT(*) FROM dbo.CR_users) AS total_users,
      (SELECT COUNT(*) FROM dbo.CR_users WHERE is_active = 1) AS active_users,
      (SELECT COUNT(*) FROM dbo.CR_users WHERE password_hash IS NOT NULL) AS has_password,
      (SELECT COUNT(*) FROM dbo.CR_departments) AS total_depts,
      (SELECT COUNT(*) FROM dbo.CR_departments WHERE is_active = 1) AS active_depts
  `);
  const c = counts.recordset[0];
  console.log('=== TOTALS ===');
  console.log('  Users:', c.total_users, '(aktif:', c.active_users, '| punya password:', c.has_password + ')');
  console.log('  Departments:', c.total_depts, '(aktif:', c.active_depts + ')');

  await pool.close();
}

main().catch(e => { console.error(e); process.exit(1); });
