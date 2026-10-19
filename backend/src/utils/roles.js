/**
 * Departemen yang secara otomatis menjadi role khusus, kecuali sudah ditunjuk
 * eksplisit via CR_user_roles (MR > FA > FA_INPUT > FA_READONLY > USER).
 * -> MR (admin full: lihat/edit/hapus/monitoring semua departemen & tahun):
 *      0200 (Management Representative QHSE), 0130 (Corporate Plan)
 * -> FA_READONLY (hanya monitoring/laporan, tanpa input data):
 *      0118 (Group Head Finance Accounting)
 * -> FA_INPUT (bisa input data untuk departemen sendiri + monitoring/laporan):
 *      0500 (Finance & Accounting)
 */

export const MR_DEPARTMENTS = new Set(['0200', '0130']);
export const FA_INPUT_DEPARTMENTS = new Set(['0500']);
export const FA_READONLY_DEPARTMENTS = new Set(['0118']);

/** Role efektif pemakai berdasarkan role tersimpan + departemennya. */
export function resolveRole(user) {
  const stored = user?.role;
  const dept = user?.department_id != null ? String(user.department_id).trim() : '';
  if (stored === 'MR' || MR_DEPARTMENTS.has(dept)) return 'MR';
  if (stored === 'FA_INPUT' || FA_INPUT_DEPARTMENTS.has(dept)) return 'FA_INPUT';
  if (stored === 'FA_READONLY' || FA_READONLY_DEPARTMENTS.has(dept)) return 'FA_READONLY';
  return 'USER';
}
