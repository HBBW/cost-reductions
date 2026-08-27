-- ============================================================
-- HARDEN PERMISSIONS — Jalankan SEBAGAI 'sa' setelah seed selesai
-- Database: BMC
-- ============================================================

USE [BMC];
GO

-- 1. Buat role khusus runtime aplikasi
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'cr_app_runtime' AND type = 'R')
  CREATE ROLE cr_app_runtime;
GO

-- 2. Beri hak SELECT/INSERT/UPDATE/DELETE ke semua objek dbo
GRANT SELECT        ON SCHEMA::dbo TO cr_app_runtime;
GRANT INSERT        ON SCHEMA::dbo TO cr_app_runtime;
GRANT UPDATE        ON SCHEMA::dbo TO cr_app_runtime;
GRANT DELETE        ON SCHEMA::dbo TO cr_app_runtime;
GO

-- 3. DENY akses langsung ke tabel HRIS (hanya boleh via VIEW)
DENY SELECT ON dbo.hris_Employee   TO cr_app_runtime;
DENY SELECT ON dbo.MASCOSTCENTER   TO cr_app_runtime;
-- Jaga-jaga kalau ada tabel HRIS lain yang kebuka
DENY SELECT ON dbo.hris_Division   TO cr_app_runtime;
DENY SELECT ON dbo.hris_DeptCode   TO cr_app_runtime;
DENY SELECT ON dbo.hris_user_login TO cr_app_runtime;
GO

-- 4. Tambahkan cr_app ke role cr_app_runtime
ALTER ROLE cr_app_runtime ADD MEMBER cr_app;
GO

-- 5. Cabut hak create (seharusnya sudah hilang setelah seed, tapi pastikan)
REVOKE CREATE TABLE FROM cr_app;
REVOKE CREATE VIEW  FROM cr_app;
GO

-- 6. (Opsional) Cabut db_datareader/db_datawriter agar tidak terbuka lebar
--    Uncomment jika sudah yakin aplikasi hanya pakai cr_app_runtime
-- ALTER ROLE db_datareader DROP MEMBER cr_app;
-- ALTER ROLE db_datawriter DROP MEMBER cr_app;
-- GO

-- ============================================================
-- VERIFIKASI — Jalankan di akhir untuk pastikan aman
-- ============================================================
PRINT '=== VERIFIKASI ===';

-- Test 1: cr_app harus BISA baca via VIEW
BEGIN TRY
    EXECUTE AS USER = 'cr_app';
    SELECT TOP 1 id, username, name FROM dbo.CR_users;
    REVERT;
    PRINT '✅ [OK] cr_app bisa baca CR_users (via VIEW)';
END TRY
BEGIN CATCH
    REVERT;
    PRINT '❌ [GAGAL] cr_app tidak bisa baca CR_users';
END CATCH
GO

-- Test 2: cr_app harus GAGAL baca tabel HRIS langsung
BEGIN TRY
    EXECUTE AS USER = 'cr_app';
    SELECT TOP 1 * FROM dbo.hris_Employee;
    REVERT;
    PRINT '❌ [GAGAL] cr_app bisa baca hris_Employee langsung — HARUSNYA DENIED!';
END TRY
BEGIN CATCH
    REVERT;
    PRINT '✅ [OK] cr_app diblokir akses langsung ke hris_Employee';
END CATCH
GO

-- Test 3: cr_app harus BISA tulis ke tabel CR_*
BEGIN TRY
    EXECUTE AS USER = 'cr_app';
    SELECT TOP 1 employee_id FROM dbo.CR_user_roles;
    REVERT;
    PRINT '✅ [OK] cr_app bisa baca CR_user_roles';
END TRY
BEGIN CATCH
    REVERT;
    PRINT '❌ [GAGAL] cr_app tidak bisa baca CR_user_roles';
END CATCH
GO

PRINT '=== SELESAI ===';
