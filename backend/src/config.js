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
  }
};
