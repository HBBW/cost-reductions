import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/index.js';
import { ApiError, ah } from '../utils/http.js';

export function readToken(req) {
  if (req.cookies && req.cookies.cr_token) return req.cookies.cr_token;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role, departmentId: user.department_id },
    config.jwtSecret,
    { expiresIn: config.jwtExpires }
  );
}

export function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ message: 'Belum login' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: payload.id,
      username: payload.username,
      name: payload.name,
      role: payload.role,
      departmentId: payload.departmentId ?? null
    };
    next();
  } catch {
    return res.status(401).json({ message: 'Sesi berakhir, silakan login ulang' });
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Akses ditolak untuk role Anda' });
  }
  next();
};

/**
 * Resolusi akses departemen -> { deptIds: string[] | null }.
 *   USER : [department_id sendiri]
 *   FA/MR: null (semua departemen) — MR admin full-akses
 * Jika `requestedDeptId` diisi, dibatasi ke id tsb.
 */
export async function resolveScope(req, requestedDeptId) {
  const role = req.user ? req.user.role : 'FA';
  const reqId = requestedDeptId ? String(requestedDeptId).trim() : null;

  if (role === 'USER') {
    if (!req.user.departmentId) throw new ApiError(403, 'Akun Anda belum terhubung ke departemen');
    return { deptIds: [req.user.departmentId] };
  }

  return { deptIds: reqId ? [reqId] : null };
}

/**
 * Bangun fragmen filter for sebuah kolom department_id.
 *   deptIds === null  -> semua (tanpa filter)
 *   deptIds === []    -> tidak ada hasil
 *   deptIds = [...]   -> IN (...)
 */
export function deptFilter(column, deptIds) {
  if (deptIds === null) return { sql: '', params: [] };
  if (deptIds.length === 0) return { sql: ` AND 1 = 0`, params: [] };
  const ph = deptIds.map(() => '?').join(',');
  return { sql: ` AND ${column} IN (${ph})`, params: [...deptIds] };
}

/** MR boleh lewati lock periode. */
export function assertPeriodEditable(isOpen, req) {
  if (isOpen || (req.user && req.user.role === 'MR')) return;
  throw new ApiError(403, 'Periode sudah terkunci. Hubungi MR untuk koreksi data.');
}
