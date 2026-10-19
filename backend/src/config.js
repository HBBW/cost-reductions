import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'cr-monitor-dev-secret',
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  dbClient: (process.env.DB_CLIENT || 'mysql').toLowerCase(),
  tablePrefix: process.env.DB_TABLE_PREFIX ?? '',
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'cr_dashboard'
  },
  mssql: {
    server: process.env.MSSQL_HOST || 'localhost',
    port: Number(process.env.MSSQL_PORT || 1433),
    user: process.env.MSSQL_USER || 'sa',
    password: process.env.MSSQL_PASSWORD || '',
    database: process.env.MSSQL_DATABASE || 'cr_dashboard',
    options: {
      encrypt: (process.env.MSSQL_ENCRYPT || 'false') === 'true',
      trustServerCertificate: true
    }
  },
  /** Nama kolom email pada tabel hris_Employee (untuk pengingat admin). */
  hrisEmailColumn: (process.env.HRIS_EMAIL_COLUMN || 'Email').replace(/[^A-Za-z0-9_]/g, '') || 'Email',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: (process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'CR Monitor <no-reply@bmc.co.id>'
  },
  reminder: {
    /** Daftar email tambahan (fallback) selain email admin dari HRIS. */
    to: (process.env.REMINDER_TO || '').split(',').map((s) => s.trim()).filter(Boolean),
    appUrl: process.env.REMINDER_APP_URL || 'https://costreduction.bmc.co.id',
    /** Default: pukul 08:00 tanggal 12 setiap bulan (zona Asia/Jakarta). */
    cron: process.env.REMINDER_CRON || '0 8 12 * *',
    timezone: process.env.TZ || 'Asia/Jakarta'
  }
};
