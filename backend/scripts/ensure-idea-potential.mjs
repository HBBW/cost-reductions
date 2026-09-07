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
const table = `${P}idea_potential_monthly`;

async function main() {
  const pool = await sql.connect(cfg);
  const ddl = `IF OBJECT_ID('dbo.${table}','U') IS NULL CREATE TABLE dbo.${table} (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idea_id INT NOT NULL,
    month TINYINT NOT NULL,
    potential_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT ${P ? P.replace(/_/g, '') : 'CR'}_uq_idea_potential UNIQUE (idea_id, month))`;
  await pool.request().query(ddl);
  const chk = await pool.request().query(`SELECT name FROM sys.tables WHERE name = '${table}'`);
  console.log('Table ensured:', chk.recordset);
  await pool.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
