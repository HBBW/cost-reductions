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
    SELECT u.id, u.username, u.name, c.password_hash
    FROM dbo.${P}users u
    JOIN dbo.${P}user_credentials c ON c.employee_id = u.id
    WHERE u.username = '5614'
  `);
  console.table(rows.recordset);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
