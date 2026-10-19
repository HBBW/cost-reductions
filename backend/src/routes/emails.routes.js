import { Router } from 'express';
import { query, run, t } from '../db/index.js';
import { ApiError, ah } from '../utils/http.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { resolveRole } from '../utils/roles.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Daftar user + email efektif.
 * Prioritas email: tabel aplikasi (CR_user_emails) > kolom email HRIS di view.
 * Kolom email HRIS & tabel user_emails bersifat opsional — kalau belum ada
 * (mis. seed belum jalan), query fallback tanpa objek tersebut.
 */
export async function fetchUsersWithEmails() {
  const build = (withAppEmail, withHrisEmail) => `
    SELECT u.id, u.username, u.name, u.role, u.department_id,
           d.name AS department_name,
           ${withAppEmail ? 'e.email' : 'NULL'} AS app_email,
           ${withHrisEmail ? 'u.email' : 'NULL'} AS hris_email
    FROM ${t('users')} u
    LEFT JOIN ${t('departments')} d ON d.id = u.department_id${withAppEmail ? `
    LEFT JOIN ${t('user_emails')} e ON e.employee_id = u.id` : ''}
    WHERE u.is_active = 1
    ORDER BY u.name`;

  const variants = [build(true, true), build(true, false), build(false, true), build(false, false)];
  let lastErr;
  for (const sql of variants) {
    try {
      return await query(sql, []);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/* ---------- Daftar pegawai + email (khusus MR) ---------- */
router.get('/emails', requireAuth, requireRole('MR'), ah(async (_req, res) => {
  const rows = await fetchUsersWithEmails();
  res.json(rows.map((r) => {
    const appEmail = r.app_email != null ? String(r.app_email).trim() : '';
    const hrisEmail = r.hris_email != null ? String(r.hris_email).trim() : '';
    return {
      id: Number(r.id),
      username: r.username,
      name: r.name,
      role: resolveRole({ role: r.role, department_id: r.department_id }),
      departmentId: r.department_id != null ? String(r.department_id).trim() : null,
      departmentName: r.department_name ?? null,
      email: appEmail || hrisEmail || '',
      source: appEmail ? 'aplikasi' : hrisEmail ? 'hris' : null
    };
  }));
}));

/* ---------- Simpan/hapus email pegawai (khusus MR) ---------- */
router.put('/emails/:id', requireAuth, requireRole('MR'), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'ID pegawai tidak valid');

  const email = req.body?.email == null ? '' : String(req.body.email).trim();
  if (email && !EMAIL_RE.test(email)) throw new ApiError(400, 'Format email tidak valid');
  if (email.length > 200) throw new ApiError(400, 'Email maksimal 200 karakter');

  const users = await query(`SELECT id FROM ${t('users')} WHERE id = ?`, [id]);
  if (!users[0]) throw new ApiError(404, 'Pegawai tidak ditemukan');

  if (!email) {
    try {
      await run(`DELETE FROM ${t('user_emails')} WHERE employee_id = ?`, [id]);
    } catch {
      throw new ApiError(500, 'Tabel email belum tersedia — jalankan `npm run seed` dulu di server.');
    }
    return res.json({ message: 'Email dikosongkan (kembali ke email HRIS bila ada)' });
  }

  try {
    const updated = await run(
      `UPDATE ${t('user_emails')} SET email = ?, updated_by = ?, updated_at = ? WHERE employee_id = ?`,
      [email, req.user.id, new Date(), id]
    );
    if (!updated.affectedRows) {
      await run(
        `INSERT INTO ${t('user_emails')} (employee_id, email, updated_by, updated_at) VALUES (?, ?, ?, ?)`,
        [id, email, req.user.id, new Date()]
      );
    }
  } catch {
    throw new ApiError(500, 'Tabel email belum tersedia — jalankan `npm run seed` dulu di server.');
  }
  res.json({ message: 'Email tersimpan' });
}));

export default router;
