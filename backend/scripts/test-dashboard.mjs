import 'dotenv/config';
import sql from 'mssql';
import jwt from 'jsonwebtoken';

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
  
  // Get user
  const rows = await pool.request().query(`
    SELECT u.id, u.username, u.name, u.role, c.password_hash, u.department_id
    FROM dbo.${P}users u
    JOIN dbo.${P}user_credentials c ON c.employee_id = u.id
    WHERE u.username = '5614'
  `);
  const u = rows.recordset[0];
  console.log('User:', u);
  
  // Generate token
  const payload = { id: u.id, username: u.username, name: u.name, role: u.role, departmentId: u.department_id };
  const token = jwt.sign(payload, 'cr-monitor-dev-secret', { expiresIn: '8h' });
  console.log('\nToken:', token);
  
  // Test dashboard endpoint
  const fetch = (await import('node-fetch')).default;
  const res = await fetch('http://localhost:3000/api/dashboard/summary?year=2026', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log('\nDashboard Response:', JSON.stringify(data, null, 2));
  
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
