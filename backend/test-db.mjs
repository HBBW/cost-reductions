import mssql from 'mssql';
import { config } from './src/config.js';

async function testConnection() {
  console.log('Testing SQL Server connection...');
  console.log('Host:', config.mssql.server);
  console.log('Port:', config.mssql.port);
  console.log('User:', config.mssql.user);
  console.log('Database:', config.mssql.database);
  console.log('Encrypt:', config.mssql.options.encrypt);
  console.log('---');

  try {
    const pool = await new mssql.ConnectionPool({
      server: config.mssql.server,
      port: config.mssql.port,
      user: config.mssql.user,
      password: config.mssql.password,
      database: config.mssql.database,
      options: config.mssql.options
    }).connect();

    console.log('✅ Koneksi BERHASIL!');

    // Test pre-flight: cek tabel HRIS
    const req = pool.request();
    const result = await req.query(`
      SELECT name FROM sys.tables 
      WHERE name IN ('hris_Employee', 'MASCOSTCENTER')
    `);

    const tables = result.recordset.map(r => r.name);
    console.log('Tabel HRIS ditemukan:', tables.join(', ') || 'NONE');

    if (tables.includes('hris_Employee') && tables.includes('MASCOSTCENTER')) {
      console.log('✅ Pre-flight OK: tabel HRIS required sudah ada');
    } else {
      console.log('❌ Pre-flight GAGAL: tabel HRIS tidak lengkap');
    }

    // Test collision check
    const collisionReq = pool.request();
    const collisionResult = await collisionReq.query(`
      SELECT name FROM sys.objects 
      WHERE name LIKE 'CR[_]%' AND type IN ('U','V')
    `);
    const existing = collisionResult.recordset.map(r => r.name);
    console.log('Objek CR_* existing:', existing.length > 0 ? existing.join(', ') : 'tidak ada');

    await pool.close();
    console.log('---');
    console.log('Test selesai ✅');
  } catch (err) {
    console.error('❌ Koneksi GAGAL:', err.message);
    if (err.code === 'ETIMEOUT' || err.code === 'ESOCKET') {
      console.log('→ Cek firewall SQL Server / port 1433 / TCP/IP enabled');
    } else if (err.code === 'ELOGIN') {
      console.log('→ Cek user/password (sa password kosong?)');
    }
    process.exit(1);
  }
}

testConnection();
