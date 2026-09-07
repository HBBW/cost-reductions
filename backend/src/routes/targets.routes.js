import { Router } from 'express';
import { query, withTransaction, t } from '../db/index.js';
import { ApiError, ah } from '../utils/http.js';
import { requireAuth, requireRole, resolveScope, deptFilter, assertPeriodEditable } from '../middlewares/auth.js';
import { isTargetOpen, targetLockDate, monthName } from '../utils/period.js';

const router = Router();

/* =====================================================================
 * Target Potential CR per IDEA per bulan (diisi di halaman Target Tahunan)
 * ===================================================================== */

/* GET daftar idea + potential CR 12 bulan per idea */
router.get('/ideas', requireAuth, ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scope = await resolveScope(req, req.query.department_id);
  const deptF = deptFilter('i.department_id', scope.deptIds);

  const ideaRows = await query(
    `SELECT i.id, i.department_id, d.name AS department_name, i.name
     FROM ${t('ideas')} i JOIN ${t('departments')} d ON d.id = i.department_id
     WHERE i.year = ?${deptF.sql}
     ORDER BY d.name, i.id`,
    [year, ...deptF.params]
  );

  const ids = ideaRows.map((r) => Number(r.id));
  const byIdea = new Map();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const monthlyRows = await query(
      `SELECT idea_id, month, potential_amount FROM ${t('idea_potential_monthly')} WHERE idea_id IN (${ph})`,
      ids
    );
    for (const m of monthlyRows) {
      const id = Number(m.idea_id);
      if (!byIdea.has(id)) byIdea.set(id, {});
      byIdea.get(id)[Number(m.month)] = Number(m.potential_amount);
    }
  }

  const ideas = ideaRows.map((r) => {
    const id = Number(r.id);
    const months = {};
    for (let m = 1; m <= 12; m++) months[m] = byIdea.get(id)?.[m] || 0;
    return {
      id,
      departmentId: String(r.department_id),
      departmentName: r.department_name,
      name: r.name,
      months
    };
  });

  res.json({ year, open: isTargetOpen(year), lockDate: targetLockDate(year).toISOString(), ideas });
}));

/* PUT simpan potential CR per bulan untuk satu idea: { rows: [{month, amount}] } */
router.put('/ideas/:id', requireAuth, requireRole('USER', 'FA_INPUT', 'MR'), ah(async (req, res) => {
  const ideaId = Number(req.params.id);
  const ideaRows = await query(
    `SELECT id, year, department_id FROM ${t('ideas')} WHERE id = ?`,
    [ideaId]
  );
  if (!ideaRows[0]) throw new ApiError(404, 'Idea tidak ditemukan');
  const idea = ideaRows[0];
  const year = Number(idea.year);
  if (year < 2000 || year > 2100) throw new ApiError(400, 'Tahun tidak valid');

  await resolveScope(req, String(idea.department_id));
  assertPeriodEditable(isTargetOpen(year), req);

  const incoming = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!incoming.length) throw new ApiError(400, 'Tidak ada data yang dikirim');

  const cleaned = incoming.map((row) => {
    const month = Number(row.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new ApiError(400, 'Bulan harus 1-12');
    const amount = row.amount == null || row.amount === '' ? 0 : Number(row.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new ApiError(400, `Target ${monthName(month)} tidak valid`);
    return { month, amount: Math.round(amount * 100) / 100 };
  });

  await withTransaction(async ({ q, r }) => {
    for (const row of cleaned) {
      const existing = await q(
        `SELECT id FROM ${t('idea_potential_monthly')} WHERE idea_id = ? AND month = ?`,
        [ideaId, row.month]
      );
      if (existing[0]) {
        await r(`UPDATE ${t('idea_potential_monthly')} SET potential_amount = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
          [row.amount, req.user.id, new Date(), Number(existing[0].id)]);
      } else {
        await r(
          `INSERT INTO ${t('idea_potential_monthly')} (idea_id, month, potential_amount, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [ideaId, row.month, row.amount, req.user.id, new Date()]
        );
      }
    }

    // Sinkron ideas.potential_cr = jumlah 12 bulan (tetap dipakai dashboard/report sebagai angka tahunan)
    const sumRows = await q(
      `SELECT COALESCE(SUM(potential_amount), 0) AS total FROM ${t('idea_potential_monthly')} WHERE idea_id = ?`,
      [ideaId]
    );
    const total = Number(sumRows[0]?.total) || 0;
    await r(`UPDATE ${t('ideas')} SET potential_cr = ?, updated_at = ? WHERE id = ?`,
      [Math.round(total * 100) / 100, new Date(), ideaId]);
  });

  res.json({ message: 'Target potential CR tersimpan' });
}));

/* =====================================================================
 * Target per DEPARTEMEN per bulan (dipakai dashboard trend & completeness)
 * ===================================================================== */

/* GET target potensial CR per departemen per bulan */
router.get('/', requireAuth, ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scope = await resolveScope(req, req.query.department_id);
  const deptF = deptFilter('t.department_id', scope.deptIds);

  const sql = `SELECT t.department_id, d.name AS department_name, t.month, t.target_amount
               FROM ${t('department_targets')} t JOIN ${t('departments')} d ON d.id = t.department_id
               WHERE t.year = ?${deptF.sql}
               ORDER BY d.name, t.month`;
  const rows = await query(sql, [year, ...deptF.params]);
  const byDept = new Map();
  for (const r of rows) {
    const dept = String(r.department_id);
    if (!byDept.has(dept)) byDept.set(dept, { departmentId: dept, departmentName: r.department_name, months: {} });
    byDept.get(dept).months[Number(r.month)] = Number(r.target_amount);
  }
  res.json({ year, open: isTargetOpen(year), lockDate: targetLockDate(year).toISOString(), departments: [...byDept.values()] });
}));

/* Simpan target potensial CR per bulan per departemen: { department_id, rows: [{month, amount}] } */
router.put('/:year/:departmentId', requireAuth, requireRole('USER', 'FA_INPUT', 'MR'), ah(async (req, res) => {
  const year = Number(req.params.year);
  if (year < 2000 || year > 2100) throw new ApiError(400, 'Tahun tidak valid');

  let departmentId = req.params.departmentId ? String(req.params.departmentId).trim() : '';
  if (req.user.role === 'USER' || req.user.role === 'FA_INPUT') {
    if (!req.user.departmentId) throw new ApiError(403, 'Akun Anda belum terhubung ke departemen');
    departmentId = req.user.departmentId;
  }

  await resolveScope(req, departmentId);
  const deptRows = await query(`SELECT id, name FROM ${t('departments')} WHERE id = ? AND is_active = 1`, [departmentId]);
  if (!deptRows[0]) throw new ApiError(400, 'Departemen tidak ditemukan / tidak aktif');

  const incoming = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!incoming.length) throw new ApiError(400, 'Tidak ada data yang dikirim');
  if (incoming.length !== 12) throw new ApiError(400, 'Target harus untuk 12 bulan sekaligus');

  const cleaned = incoming.map((row) => {
    const month = Number(row.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new ApiError(400, 'Bulan harus 1-12');
    const amount = row.amount == null || row.amount === '' ? 0 : Number(row.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new ApiError(400, `Target ${monthName(month)} tidak valid`);
    return { month, amount: Math.round(amount * 100) / 100 };
  });

  assertPeriodEditable(isTargetOpen(year), req);

  await withTransaction(async ({ q, r }) => {
    for (const row of cleaned) {
      const existing = await q(
        `SELECT id FROM ${t('department_targets')} WHERE year = ? AND department_id = ? AND month = ?`,
        [year, departmentId, row.month]
      );
      if (existing[0]) {
        await r(`UPDATE ${t('department_targets')} SET target_amount = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
          [row.amount, req.user.id, new Date(), Number(existing[0].id)]);
      } else {
        await r(
          `INSERT INTO ${t('department_targets')} (year, department_id, month, target_amount, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [year, departmentId, row.month, row.amount, req.user.id, new Date()]
        );
      }
    }
  });

  res.json({ message: `Target potensial CR tahunan ${deptRows[0].name} tersimpan` });
}));

export default router;