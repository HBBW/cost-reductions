-- ============================================================
-- MIGRASI: Sync budget di idea_monthly dengan idea-level budget
-- Jalankan sebagai 'sa' di SSMS (sekali saja)
-- ============================================================
USE [BMC];
GO

-- 1. Sync budget di idea_monthly dengan idea-level budget
UPDATE im
SET im.budget = i.budget
FROM CR_idea_monthly im
JOIN CR_ideas i ON i.id = im.idea_id;
GO

-- 2. Verifikasi
SELECT TOP 10 
  i.id, i.name, i.budget, i.potential_cr,
  im.month, im.budget AS monthly_budget, im.actual_cost
FROM CR_ideas i
JOIN CR_idea_monthly im ON im.idea_id = i.id
ORDER BY i.id, im.month;
GO

PRINT '✅ Budget di idea_monthly sudah di-sync dengan idea-level budget';
