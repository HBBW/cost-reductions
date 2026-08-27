import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, t } from '../db/index.js';
import { ApiError, ah } from '../utils/http.js';
import { requireAuth, signToken } from '../middlewares/auth.js';

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000
};

router.post('/login', ah(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new ApiError(400, 'Username dan password wajib diisi');

  const rows = await query(
    `SELECT id, username, password_hash, name, role, department_id FROM ${t('users')} WHERE username = ? AND is_active = 1`,
    [String(username).trim()]
  );
  const user = rows[0];
  if (!user || !user.password_hash || !(await bcrypt.compare(String(password), user.password_hash))) {
    throw new ApiError(401, 'Username atau password salah');
  }

  const payload = {
    ...user,
    id: Number(user.id),
    department_id: user.department_id != null ? String(user.department_id) : null
  };
  delete payload.password_hash;
  const tokenUser = { ...payload };
  const token = signToken(tokenUser);
  res.cookie('cr_token', token, COOKIE_OPTS);
  res.json({ token, user: payload });
}));

router.post('/logout', (req, res) => {
  res.clearCookie('cr_token', { path: '/' });
  res.json({ message: 'Logout berhasil' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
