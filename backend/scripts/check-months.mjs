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
    SELECT month, budget, actual_cost, potential_cr FROM dbo.${P}idea_monthly WHERE idea_id = 10 ORDER BY month
  `);
  console.table(rows.recordset);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
