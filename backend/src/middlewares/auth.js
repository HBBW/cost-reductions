import jwt from 'jsonwebtoken';
import { config } from '../config.js';
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
 * USER hanya boleh mengakses data departemennya sendiri.
 * FA/MR boleh semua departemen. Mengembalikan department_id efektif.
 */
export function resolveDepartmentScope(req, requestedDeptId) {
  if (req.user.role === 'USER') {
    if (!req.user.departmentId) throw new ApiError(403, 'Akun Anda belum terhubung ke departemen');
    return req.user.departmentId;
  }
  const dept = Number(requestedDeptId) || null;
  return dept; // null = semua departemen
}

/** MR boleh lewati lock periode. */
export function assertPeriodEditable(isOpen, req) {
  if (isOpen || (req.user && req.user.role === 'MR')) return;
  throw new ApiError(403, 'Periode sudah terkunci. Hubungi MR untuk koreksi data.');
}
