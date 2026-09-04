import { Router } from 'express';
import { query, run, withTransaction, t } from '../db/index.js';
import { ApiError, ah } from '../utils/http.js';
import { requireAuth, requireRole, resolveScope, deptFilter, assertPeriodEditable } from '../middlewares/auth.js';
import { isMonthlyOpen, isIdeaOpen } from '../utils/period.js';

const router = Router();

const num = (v) => (v == null || v === '' ? null : Number(v));
const numField = (v, label, { max = 1e15 } = {}) => {
  const n = num(v);
  if (n == null) return 0;
  if (!Number.isFinite(n) || n < 0 || n > max) throw new ApiError(400, `${label} tidak valid`);
  return Math.round(n * 100) / 100;
};
const strField = (v, label, maxLen) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > maxLen) throw new ApiError(400, `${label} maksimal ${maxLen} karakter`);
  return s;
};

async function getIdeaOr404(id) {
  const rows = await query(
    `SELECT i.id, i.year, i.department_id, d.name AS department_name, i.name, i.budget, i.potential_cr, i.remark
     FROM ${t('ideas')} i JOIN ${t('departments')} d ON d.id = i.department_id WHERE i.id = ?`,
    [Number(id)]
  );
  if (!rows[0]) throw new ApiError(404, 'Idea tidak ditemukan');
  return rows[0];
}

function assertCanAccessAsync(req, idea) {
  return resolveScope(req, String(idea.department_id));
}

/* ---------- List ideas + agregat ---------- */
router.get('/ideas', requireAuth, ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scope = await resolveScope(req, req.query.department_id);
  const deptF = deptFilter('i.department_id', scope.deptIds);

  let sql = `
    SELECT i.id, i.year, i.department_id, d.name AS department_name, i.name,
           i.budget, i.potential_cr, i.remark,
           COALESCE(SUM(im.budget - im.actual_cost), 0) AS actual,
           COALESCE(COUNT(im.month), 0) AS months_filled
    FROM ${t('ideas')} i
    JOIN ${t('departments')} d ON d.id = i.department_id
    LEFT JOIN ${t('idea_monthly')} im ON im.idea_id = i.id
    WHERE i.year = ?${deptF.sql}`;
  const params = [year, ...deptF.params];
  sql += ' GROUP BY i.id, i.year, i.department_id, d.name, i.name, i.budget, i.potential_cr, i.remark';
  sql += ' ORDER BY d.name, i.name';

  const rows = await query(sql, params);
  res.json(rows.map((r) => ({
    id: Number(r.id),
    year: Number(r.year),
    departmentId: r.department_id != null ? String(r.department_id) : null,
    departmentName: r.department_name,
    name: r.name,
    budget: Number(r.budget),
    potentialCr: Number(r.potential_cr),
    actual: Number(r.actual),
    remark: r.remark,
    monthsFilled: Number(r.months_filled)
  })));
}));

/* ---------- Create idea ---------- */
router.post('/ideas', requireAuth, requireRole('USER', 'FA_INPUT', 'MR'), ah(async (req, res) => {
  const body = req.body || {};
  const year = Number(body.year) || new Date().getFullYear();
  if (year < 2000 || year > 2100) throw new ApiError(400, 'Tahun tidak valid');

  let departmentId = (req.user.role === 'USER' || req.user.role === 'FA_INPUT')
    ? req.user.departmentId
    : (body.department_id != null ? String(body.department_id).trim() : '');
  if (!departmentId) throw new ApiError(400, 'Departemen wajib dipilih');

  await resolveScope(req, departmentId);
  const deptRows = await query(`SELECT id FROM ${t('departments')} WHERE id = ? AND is_active = 1`, [departmentId]);
  if (!deptRows[0]) throw new ApiError(400, 'Departemen tidak ditemukan / tidak aktif');

  const name = strField(body.name, 'Nama idea', 200);
  if (!name) throw new ApiError(400, 'Nama idea wajib diisi');
  const budget = numField(body.budget, 'Budget');
  const potentialCr = numField(body.potentialCr, 'Potential CR');
  const remark = strField(body.remark, 'Remark', 2000);

  const result = await run(
    `INSERT INTO ${t('ideas')} (year, department_id, name, budget, potential_cr, remark, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [year, departmentId, name, budget, potentialCr, remark, req.user.id, new Date(), new Date()]
  );
  res.status(201).json({ id: result.insertId });
}));

/* ---------- Update idea (meta) ---------- */
router.put('/ideas/:id', requireAuth, requireRole('USER', 'FA_INPUT', 'MR'), ah(async (req, res) => {
  const idea = await getIdeaOr404(req.params.id);
  await assertCanAccessAsync(req, idea);

  const body = req.body || {};
  const name = strField(body.name, 'Nama idea', 200);
  if (!name) throw new ApiError(400, 'Nama idea wajib diisi');
  const budget = numField(body.budget, 'Budget');
  const potentialCr = numField(body.potentialCr, 'Potential CR');
  const remark = strField(body.remark, 'Remark', 2000);

  // Lock Potential CR setelah 19 Feb (kecuali MR)
  // Budget TIDAK terkunci - bisa di-edit kapan saja
  if (req.user.role !== 'MR' && !isIdeaOpen(Number(idea.year))) {
    // Coba update budget saja (boleh), potentialCr diabaikan jika terkunci
    await run(
      `UPDATE ${t('ideas')} SET name = ?, budget = ?, remark = ?, updated_at = ? WHERE id = ?`,
      [name, budget, remark, new Date(), idea.id]
    );
    return res.json({ message: 'Idea diperbarui (Budget diperbarui, Potential CR terkunci setelah 19 Feb)' });
  }

  await run(
    `UPDATE ${t('ideas')} SET name = ?, budget = ?, potential_cr = ?, remark = ?, updated_at = ? WHERE id = ?`,
    [name, budget, potentialCr, remark, new Date(), idea.id]
  );
  res.json({ message: 'Idea diperbarui' });
}));

/* ---------- Delete idea (khusus MR) ---------- */
router.delete('/ideas/:id', requireAuth, requireRole('MR'), ah(async (req, res) => {
  const idea = await getIdeaOr404(req.params.id);
  await assertCanAccessAsync(req, idea);

  await withTransaction(async ({ r }) => {
    await r(`DELETE FROM ${t('idea_monthly')} WHERE idea_id = ?`, [idea.id]);
    await r(`DELETE FROM ${t('ideas')} WHERE id = ?`, [idea.id]);
  });
  res.json({ message: 'Idea dihapus' });
}));

/* ---------- Data bulanan per idea ---------- */
router.get('/ideas/:id/monthly', requireAuth, ah(async (req, res) => {
  const idea = await getIdeaOr404(req.params.id);
  await assertCanAccessAsync(req, idea);

  const rows = await query(
    `SELECT month, budget, actual_cost, updated_at FROM ${t('idea_monthly')} WHERE idea_id = ? ORDER BY month`,
    [idea.id]
  );
  const byMonth = new Map(rows.map((r) => [Number(r.month), r]));

  const ideaBudget = Number(idea.budget);
  const ideaPotentialCr = Number(idea.potential_cr);

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const r = byMonth.get(m);
    const cost = r ? Number(r.actual_cost) : 0;
    // Budget per bulan: pakai nilai bulanan jika sudah diisi, default Budget/Tahun
    const budget = r ? Number(r.budget) : ideaBudget;
    months.push({
      month: m,
      potentialCr: ideaPotentialCr,
      budget,
      actualCost: cost,
      actualCr: Math.round((budget - cost) * 100) / 100,
      filled: Boolean(r),
      updatedAt: r ? r.updated_at : null
    });
  }
  const totals = months.reduce(
    (acc, m) => ({
      potentialCr: acc.potentialCr + m.potentialCr,
      budget: acc.budget + m.budget,
      actualCost: acc.actualCost + m.actualCost,
      actualCr: acc.actualCr + m.actualCr
    }),
    { potentialCr: 0, budget: 0, actualCost: 0, actualCr: 0 }
  );

  res.json({
    idea: {
      id: Number(idea.id),
      year: Number(idea.year),
      department_id: String(idea.department_id),
      name: idea.name,
      budget: ideaBudget,
      potentialCr: ideaPotentialCr,
      remark: idea.remark,
      department_name: idea.department_name
    },
    months,
    totals,
    lockedMonths: months.map((m) => ({ month: m.month, open: isMonthlyOpen(Number(idea.year), m.month) }))
  });
}));

/* Simpan data bulanan - user isi budget & actual_cost per bulan, potential dari idea level */
router.put('/ideas/:id/monthly', requireAuth, requireRole('USER', 'FA_INPUT', 'MR'), ah(async (req, res) => {
  const idea = await getIdeaOr404(req.params.id);
  await assertCanAccessAsync(req, idea);
  const year = Number(idea.year);
  const ideaPotentialCr = Number(idea.potential_cr);

  const incoming = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!incoming.length) throw new ApiError(400, 'Tidak ada data yang dikirim');

  const cleaned = incoming.map((row) => {
    const month = Number(row.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new ApiError(400, 'Bulan harus 1-12');
    assertPeriodEditable(isMonthlyOpen(year, month), req);
    return {
      month,
      budget: numField(row.budget, `Budget bulan ${month}`),
      actualCost: numField(row.actualCost, `Actual biaya bulan ${month}`)
    };
  });

  await withTransaction(async ({ q, r }) => {
    for (const row of cleaned) {
      const existing = await q(`SELECT id FROM ${t('idea_monthly')} WHERE idea_id = ? AND month = ?`, [idea.id, row.month]);
      if (existing[0]) {
        await r(
          `UPDATE ${t('idea_monthly')} SET potential_cr = ?, budget = ?, actual_cost = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`,
          [ideaPotentialCr, row.budget, row.actualCost, req.user.id, new Date(), Number(existing[0].id)]
        );
      } else {
        await r(
          `INSERT INTO ${t('idea_monthly')} (idea_id, month, potential_cr, budget, actual_cost, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [idea.id, row.month, ideaPotentialCr, row.budget, row.actualCost, req.user.id, new Date()]
        );
      }
    }
  });

  res.json({ message: 'Data bulanan tersimpan' });
}));

export default router;
