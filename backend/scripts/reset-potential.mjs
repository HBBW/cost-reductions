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
  const pot = await pool.request().query(`DELETE FROM dbo.${P}idea_potential_monthly`);
  const ideas = await pool.request().query(`UPDATE dbo.${P}ideas SET potential_cr = 0`);
  console.log('idea_potential_monthly deleted:', pot.rowsAffected[0]);
  console.log('ideas set potential_cr=0:', ideas.rowsAffected[0]);
  // verifikasi idea masih ada
  const chk = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.${P}ideas`);
  console.log('total ideas:', chk.recordset[0].n);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
