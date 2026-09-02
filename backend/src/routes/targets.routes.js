import { Router } from 'express';
import { query, withTransaction, t } from '../db/index.js';
import { ApiError, ah } from '../utils/http.js';
import { requireAuth, requireRole, resolveScope, deptFilter, assertPeriodEditable } from '../middlewares/auth.js';
import { isTargetOpen, targetLockDate, monthName } from '../utils/period.js';

const router = Router();

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

/* Simpan target tahunan satu departemen: { department_id, rows: [{month, amount}] } */
router.put('/:year/:departmentId', requireAuth, requireRole('USER', 'MR'), ah(async (req, res) => {
  const year = Number(req.params.year);
  if (year < 2000 || year > 2100) throw new ApiError(400, 'Tahun tidak valid');

  let departmentId = req.params.departmentId ? String(req.params.departmentId).trim() : '';
  if (req.user.role === 'USER') {
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

  res.json({ message: `Target tahunan ${deptRows[0].name} tersimpan` });
}));

export default router;
