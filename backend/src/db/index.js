import mysql from 'mysql2/promise';
import mssql from 'mssql';
import { config } from '../config.js';

let mysqlPool = null;
let mssqlPool = null;

export const isMysql = () => config.dbClient === 'mysql';

/** Nama tabel dengan prefix dari env (mis. DB_TABLE_PREFIX=CR_ -> t('users') = 'CR_users'). */
export const t = (name) => `${config.tablePrefix}${name}`;

function toMssqlSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `@p${++i}`);
}

function addParams(request, params) {
  params.forEach((p, i) => request.input(`p${i + 1}`, p));
}

async function getMysql() {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      dateStrings: true
    });
  }
  return mysqlPool;
}

async function getMssql() {
  if (!mssqlPool) {
    mssqlPool = await new mssql.ConnectionPool({
      server: config.mssql.server,
      port: config.mssql.port,
      user: config.mssql.user,
      password: config.mssql.password,
      database: config.mssql.database,
      options: config.mssql.options
    }).connect();
  }
  return mssqlPool;
}

/** Query SELECT -> array of row objects. Placeholder `?` untuk semua dialek. */
export async function query(sql, params = []) {
  if (isMysql()) {
    const pool = await getMysql();
    const [rows] = await pool.execute(sql, params);
    return rows;
  }
  const pool = await getMssql();
  const request = pool.request();
  addParams(request, params);
  const result = await request.query(toMssqlSql(sql));
  return result.recordset || [];
}

/** INSERT/UPDATE/DELETE -> { insertId, affectedRows }. */
export async function run(sql, params = []) {
  if (isMysql()) {
    const pool = await getMysql();
    const [result] = await pool.execute(sql, params);
    return { insertId: Number(result.insertId) || null, affectedRows: result.affectedRows || 0 };
  }
  const pool = await getMssql();
  const request = pool.request();
  addParams(request, params);
  const result = await request.query(`${toMssqlSql(sql)}; SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS id;`);
  const idRow = (result.recordset && result.recordset[0]) || {};
  return { insertId: idRow.id != null ? Number(idRow.id) : null, affectedRows: (result.rowsAffected && result.rowsAffected[0]) || 0 };
}

/**
 * Transaksi: fn menerima helper { q, r } yang sudah terikat koneksi transaksional.
 *   q(sql, params) -> rows   |   r(sql, params) -> { insertId, affectedRows }
 */
export async function withTransaction(fn) {
  if (isMysql()) {
    const pool = await getMysql();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const q = async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return rows;
      };
      const r = async (sql, params = []) => {
        const [result] = await conn.execute(sql, params);
        return { insertId: Number(result.insertId) || null, affectedRows: result.affectedRows || 0 };
      };
      const out = await fn({ q, r });
      await conn.commit();
      return out;
    } catch (err) {
      try { await conn.rollback(); } catch { /* noop */ }
      throw err;
    } finally {
      conn.release();
    }
  }

  const pool = await getMssql();
  const tx = new mssql.Transaction(pool);
  await tx.begin();
  try {
    const makeRequest = () => new mssql.Request(tx);
    const q = async (sqlText, params = []) => {
      const request = makeRequest();
      addParams(request, params);
      const result = await request.query(toMssqlSql(sqlText));
      return result.recordset || [];
    };
    const r = async (sqlText, params = []) => {
      const request = makeRequest();
      addParams(request, params);
      const result = await request.query(`${toMssqlSql(sqlText)}; SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS id;`);
      const idRow = (result.recordset && result.recordset[0]) || {};
      return { insertId: idRow.id != null ? Number(idRow.id) : null, affectedRows: (result.rowsAffected && result.rowsAffected[0]) || 0 };
    };
    const out = await fn({ q, r });
    await tx.commit();
    return out;
  } catch (err) {
    try { await tx.rollback(); } catch { /* noop */ }
    throw err;
  }
}

export async function closePools() {
  if (mysqlPool) { await mysqlPool.end(); mysqlPool = null; }
  if (mssqlPool) { await mssqlPool.close(); mssqlPool = null; }
}
