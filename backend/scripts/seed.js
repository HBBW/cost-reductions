import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import mssql from 'mssql';
import { config } from '../src/config.js';

/**
 * Seed database:
 * - MYSQL  : buat skema lengkap (departments, users, ideas, idea_monthly,
 *            department_targets) + akun demo. Untuk development lokal.
 * - MSSQL  : JANGAN menyentuh tabel HRIS existing (hris_employee, mascoscenter).
 *            Hanya membuat objek BARU ber-prefix CR_:
 *              5 tabel : CR_ideas, CR_idea_monthly, CR_department_targets,
 *                        CR_user_credentials, CR_user_roles
 *              2 view  : CR_users, CR_departments (translasi HRIS)
 *            + bootstrap password bcrypt(BirthDate 'YYYY-MM-DD') untuk semua
 *              karyawan aktif ke CR_user_credentials.
 *
 * Aman dijalankan berulang (idempotent) dan tidak pernah DROP data.
 */

const MYSQL_DDL = [
  `CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_active TINYINT NOT NULL DEFAULT 1
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role ENUM('USER','FA','MR') NOT NULL,
    department_id INT NULL,
    is_active TINYINT NOT NULL DEFAULT 1,
    CONSTRAINT fk_users_dept FOREIGN KEY (department_id) REFERENCES departments(id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS ideas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year SMALLINT NOT NULL,
    department_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    remark TEXT NULL,
    created_by INT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS idea_monthly (
    id INT AUTO_INCREMENT PRIMARY KEY,
    idea_id INT NOT NULL,
    month TINYINT NOT NULL,
    potential_cr DECIMAL(18,2) NOT NULL DEFAULT 0,
    budget DECIMAL(18,2) NOT NULL DEFAULT 0,
    actual_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_idea_month (idea_id, month),
    CONSTRAINT fk_im_idea FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS department_targets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year SMALLINT NOT NULL,
    department_id INT NOT NULL,
    month TINYINT NOT NULL,
    target_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_target (year, department_id, month),
    CONSTRAINT fk_tgt_dept FOREIGN KEY (department_id) REFERENCES departments(id)
  ) ENGINE=InnoDB`
];

const DEPARTMENTS = ['Produksi', 'Maintenance', 'Engineering', 'Quality Assurance', 'Logistics', 'HRD & GA'];

/* ============================================================
 * ======================== MSSQL PATH ========================
 * ============================================================ */

const P = config.tablePrefix || 'CR_';

/** Objek yang akan dibuat — dipakai untuk collision & pre-flight check. */
const MSSQL_OBJECTS = {
  tables: [
    `${P}user_credentials`,
    `${P}user_roles`,
    `${P}ideas`,
    `${P}idea_monthly`,
    `${P}department_targets`
  ],
  views: [`${P}users`, `${P}departments`],
  requiredExisting: ['hris_Employee', 'MASCOSTCENTER']
};

const MSSQL_TABLE_DDL = {
  [`${P}user_credentials`]: `IF OBJECT_ID('dbo.${P}user_credentials','U') IS NULL CREATE TABLE dbo.${P}user_credentials (
    employee_id INT NOT NULL PRIMARY KEY,
    password_hash NVARCHAR(255) NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT GETDATE())`,
  [`${P}user_roles`]: `IF OBJECT_ID('dbo.${P}user_roles','U') IS NULL CREATE TABLE dbo.${P}user_roles (
    employee_id INT NOT NULL PRIMARY KEY,
    role VARCHAR(10) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','FA','MR')))`,
  [`${P}ideas`]: `IF OBJECT_ID('dbo.${P}ideas','U') IS NULL CREATE TABLE dbo.${P}ideas (
    id INT IDENTITY(1,1) PRIMARY KEY,
    year SMALLINT NOT NULL,
    department_id VARCHAR(6) NOT NULL,
    name NVARCHAR(200) NOT NULL,
    budget DECIMAL(18,2) NOT NULL DEFAULT 0,
    potential_cr DECIMAL(18,2) NOT NULL DEFAULT 0,
    remark NVARCHAR(MAX) NULL,
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME NOT NULL DEFAULT GETDATE())`,
  [`${P}idea_monthly`]: `IF OBJECT_ID('dbo.${P}idea_monthly','U') IS NULL CREATE TABLE dbo.${P}idea_monthly (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idea_id INT NOT NULL,
    month TINYINT NOT NULL,
    potential_cr DECIMAL(18,2) NOT NULL DEFAULT 0,
    budget DECIMAL(18,2) NOT NULL DEFAULT 0,
    actual_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT ${P ? P.replace(/_/g, '') : 'CR'}_uq_idea_month UNIQUE (idea_id, month))`,
  [`${P}department_targets`]: `IF OBJECT_ID('dbo.${P}department_targets','U') IS NULL CREATE TABLE dbo.${P}department_targets (
    id INT IDENTITY(1,1) PRIMARY KEY,
    year SMALLINT NOT NULL,
    department_id VARCHAR(6) NOT NULL,
    month TINYINT NOT NULL,
    target_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT ${P ? P.replace(/_/g, '') : 'CR'}_uq_target UNIQUE (year, department_id, month))`
};

const MSSQL_VIEW_DDL = {
  [`${P}departments`]: `CREATE OR ALTER VIEW dbo.${P}departments AS
SELECT RTRIM(mc.DepartID) AS id,
       RTRIM(mc.NamaDepartemen) AS name,
       CASE WHEN mc.TidakAktif = 'Y' THEN 0 ELSE 1 END AS is_active
FROM dbo.MASCOSTCENTER mc
WHERE RTRIM(mc.LevelDepartemen) = 'Departemen';`,
  [`${P}users`]: `CREATE OR ALTER VIEW dbo.${P}users AS
SELECT e.Id_Employee AS id,
       RTRIM(e.NIP) AS username,
       RTRIM(e.Name) AS name,
       ISNULL(r.role, 'USER') AS role,
       c.password_hash,
       CASE WHEN e.is_Active = '1' THEN 1 ELSE 0 END AS is_active,
       RTRIM(e.DepartID) AS department_id
FROM dbo.hris_Employee e
LEFT JOIN dbo.${P}user_roles r ON r.employee_id = e.Id_Employee
LEFT JOIN dbo.${P}user_credentials c ON c.employee_id = e.Id_Employee;`
};

async function ensureDatabaseMysql() {
  const conn = await mysql.createConnection({
    host: config.mysql.host, port: config.mysql.port,
    user: config.mysql.user, password: config.mysql.password
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.mysql.database}\` CHARACTER SET utf8mb4`);
  await conn.end();
}

async function seedMssql() {
  const pool = await new mssql.ConnectionPool({ ...config.mssql }).connect();
  const exec = async (sql, params = []) => {
    const req = pool.request();
    params.forEach((p, i) => req.input(`p${i + 1}`, p));
    let i = 0;
    await req.query(sql.replace(/\?/g, () => `@p${++i}`));
  };
  const rows = async (sql, params = []) => {
    const req = pool.request();
    params.forEach((p, i) => req.input(`p${i + 1}`, p));
    let i = 0;
    const res = await req.query(sql.replace(/\?/g, () => `@p${++i}`));
    return res.recordset || [];
  };

  /* ---- Pre-flight: tabel HRIS wajib ada ---- */
  for (const tbl of MSSQL_OBJECTS.requiredExisting) {
    const found = await rows(
      `SELECT name FROM sys.tables WHERE name = @p1`, [tbl]
    );
    if (!found.length) {
      throw new Error(`Pre-flight GAGAL: tabel '${tbl}' tidak ditemukan di database '${config.mssql.database}'. Seed dibatalkan — tidak ada perubahan.`);
    }
  }
  console.log(`Pre-flight OK: ${MSSQL_OBJECTS.requiredExisting.join(', ')} ditemukan (tidak akan disentuh).`);

  /* ---- Collision check ---- */
  const allObjects = [...MSSQL_OBJECTS.tables, ...MSSQL_OBJECTS.views];
  const collisions = [];
  for (const obj of allObjects) {
    const type = MSSQL_OBJECTS.views.includes(obj) ? 'V' : 'U';
    const found = await rows(
      `SELECT name FROM sys.objects WHERE name = @p1 AND schema_name(schema_id) = 'dbo' AND type = @p2`, [obj, type]
    );
    if (found.length) collisions.push(obj);
  }
  if (collisions.length === allObjects.length) {
    console.log('Objek CR_* sudah ada sebelumnya — skip pembuatan, lanjut bootstrap password.');
  } else if (collisions.length > 0) {
    throw new Error(`Collision GAGAL: sebagian objek sudah ada → ${collisions.join(', ')}. Hapus manual atau sesuaikan prefix lalu ulangi.`);
  } else {
    console.log('Collision OK: tidak ada objek CR_* bentrok.');
  }

  /* ---- Buat 5 tabel baru (hanya yang belum ada) ---- */
  for (const name of MSSQL_OBJECTS.tables) {
    if (!collisions.includes(name)) {
      await exec(MSSQL_TABLE_DDL[name]);
      console.log(`  tabel  + ${name}`);
    }
  }

  /* ---- Buat / perbarui 2 view (selalu refresh definisi) ---- */
  for (const name of MSSQL_OBJECTS.views) {
    await exec(`IF OBJECT_ID('dbo.${name}','V') IS NOT NULL EXEC('DROP VIEW dbo.${name}')`);
    await exec(MSSQL_VIEW_DDL[name]);
    console.log(`  view   ~ ${name} (definisi diperbarui)`);
  }

  /* ---- Bootstrap password bcrypt(BirthDate YYYY-MM-DD) ---- */
  const employees = await rows(`
    SELECT Id_Employee, CONVERT(varchar(10), BirthDate, 23) AS birthdate
    FROM hris_Employee
    WHERE is_Active = '1' AND BirthDate IS NOT NULL`);
  let bootstrapped = 0;
  for (const emp of employees) {
    const hash = await bcrypt.hash(emp.birthdate, 10);
    await exec(
      `IF NOT EXISTS (SELECT 1 FROM dbo.${P}user_credentials WHERE employee_id = @p1)
       INSERT INTO dbo.${P}user_credentials (employee_id, password_hash, updated_at)
       VALUES (@p1, @p2, GETDATE())`,
      [emp.Id_Employee, hash]
    );
    bootstrapped++;
  }
  console.log(`Bootstrap password (BirthDate): ${bootstrapped} karyawan aktif.`);

  /* ---- Role awal: KOSONG (semua USER). MR/FA diatur manual, contoh: ----
     INSERT INTO dbo.CR_user_roles (employee_id, role) VALUES (123, 'MR');
     INSERT INTO dbo.CR_user_roles (employee_id, role) VALUES (456, 'FA'); */

  await pool.close();
  console.log('\nCatatan role: semua user default USER. Set MR/FA manual, contoh:');
  console.log(`  INSERT INTO dbo.${P}user_roles (employee_id, role) VALUES (<Id_Employee>, 'MR');`);
  console.log(`  INSERT INTO dbo.${P}user_roles (employee_id, role) VALUES (<Id_Employee>, 'FA');\n`);
}

/* ============================================================
 * ========================= MYSQL PATH =======================
 * ============================================================ */

async function seedMysql() {
  await ensureDatabaseMysql();

  const pool = await mysql.createPool({ ...config.mysql, dateStrings: true });
  for (const stmt of MYSQL_DDL) await pool.query(stmt);
  console.log('Tabel siap.');

  for (const name of DEPARTMENTS) {
    await pool.query(
      'INSERT INTO departments (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = ?)',
      [name, name]
    );
  }
  const [deptRows] = await pool.query('SELECT id, name FROM departments');
  const deptMap = Object.fromEntries(deptRows.map((r) => [r.name, r.id]));
  console.log('Departemen:', deptRows.map((d) => d.name).join(', '));

  const hash = await bcrypt.hash('cr123456', 10);
  const accounts = [
    { username: 'mr', name: 'MR Admin', role: 'MR', dept: null },
    { username: 'fa', name: 'FA Monitor', role: 'FA', dept: null },
    { username: 'produksi', name: 'User Produksi', role: 'USER', dept: 'Produksi' },
    { username: 'maintenance', name: 'User Maintenance', role: 'USER', dept: 'Maintenance' },
    { username: 'engineering', name: 'User Engineering', role: 'USER', dept: 'Engineering' }
  ];
  for (const acc of accounts) {
    const deptId = acc.dept ? deptMap[acc.dept] : null;
    await pool.query(
      'INSERT INTO users (username, password_hash, name, role, department_id) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = ?)',
      [acc.username, hash, acc.name, acc.role, deptId, acc.username]
    );
  }
  console.log('\nAkun awal (password semua: cr123456):');
  for (const a of accounts) console.log(`  ${a.role.padEnd(5)} | ${a.username.padEnd(12)} | ${a.name}`);

  await pool.end();
}

/* ============================================================ */

function ensureDatabaseMssqlInfo() {
  // MSSQL: database HARUS sudah ada (DB HRIS existing) — tidak pernah create/drop.
  console.log(`Target DB: ${config.mssql.database} (existing — tidak dibuat/dihapus)`);
}

async function main() {
  console.log(`DB client: ${config.dbClient}`);

  if (config.dbClient === 'mysql') {
    await seedMysql();
  } else {
    ensureDatabaseMssqlInfo();
    await seedMssql();
  }
  console.log('\nSeed selesai.');
}

main().catch((err) => { console.error('\n' + (err.message || err)); process.exit(1); });
