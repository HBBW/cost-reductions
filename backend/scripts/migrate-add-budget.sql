-- ============================================================
-- MIGRASI: Tambah kolom budget ke CR_ideas
-- Jalankan sebagai 'sa' di SSMS (sekali saja)
-- ============================================================
USE [BMC];
GO

-- 1. Tambah kolom budget jika belum ada
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'CR_ideas' AND COLUMN_NAME = 'budget'
)
BEGIN
  ALTER TABLE dbo.CR_ideas ADD budget DECIMAL(18,2) NOT NULL DEFAULT 0;
  PRINT '✅ Kolom budget ditambahkan ke CR_ideas';
END
ELSE
  PRINT 'ℹ️ Kolom budget sudah ada';
GO

-- 2. Verifikasi
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'CR_ideas'
ORDER BY ORDINAL_POSITION;
GO
