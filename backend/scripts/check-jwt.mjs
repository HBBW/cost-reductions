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
  // cek user login
  const rows = await pool.request().query(`
    SELECT id, username, RTRIM(password_hash) AS hash, name, role, department_id
    FROM dbo.${P}users WHERE username = '5614'
  `);
  const u = rows.recordset[0];
  console.log('User:', u);
  
  // Generate token like backend
  const payload = { id: u.id, username: u.username, name: u.name, role: u.role, departmentId: u.department_id };
  const token = jwt.sign(payload, 'cr-monitor-dev-secret', { expiresIn: '8h' });
  console.log('\nJWT Token:', token);
  console.log('\nDecoded:', jwt.decode(token));
  
  // Verify query params for dashboard summary
  console.log('\n--- Params for deptFilter ---');
  console.log('deptIds for USER role:', [u.department_id]);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
