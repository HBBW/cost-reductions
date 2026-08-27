import { Router } from 'express';
import { query, t } from '../db/index.js';
import { ah } from '../utils/http.js';
import { requireAuth } from '../middlewares/auth.js';
import { monthlyDeadlineLabel } from '../utils/period.js';

const router = Router();

router.get('/meta', requireAuth, ah(async (req, res) => {
  const year = new Date().getFullYear();
  const ideaYears = await query(`SELECT DISTINCT year FROM ${t('ideas')} ORDER BY year DESC`);
  const targetYears = await query(`SELECT DISTINCT year FROM ${t('department_targets')} ORDER BY year DESC`);
  const years = [...new Set([
    year,
    ...ideaYears.map((r) => Number(r.year)),
    ...targetYears.map((r) => Number(r.year))
  ])].sort((a, b) => b - a);

  res.json({
    currentYear: year,
    years,
    today: new Date().toISOString().slice(0, 10),
    deadline: {
      monthlyInfo: 'Data bulan berjalan dapat diisi sampai tanggal 18 bulan berikutnya',
      exampleLabel: monthlyDeadlineLabel(year, new Date().getMonth() + 1),
      targetLabel: `18 Februari ${year}`
    }
  });
}));

router.get('/departments', requireAuth, ah(async (_req, res) => {
  const rows = await query(`SELECT id, name FROM ${t('departments')} WHERE is_active = 1 ORDER BY name`);
  res.json(rows.map((r) => ({ id: String(r.id), name: r.name })));
}));

export default router;
