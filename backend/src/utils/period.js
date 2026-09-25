/**
 * Aturan periode input:
 * - Data bulanan bulan M dapat diisi mulai tanggal 20 bulan sebelumnya
 *   sampai tanggal 19 bulan M.
 *   Setelah deadline, terkunci untuk USER; MR tetap dapat mengoreksi.
 * - Target tahunan Y     : terbuka s/d 19 Februari Y.
 */

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function monthName(m) {
  return MONTH_NAMES[m - 1] || '';
}

function endOfDay(y, m, d) {
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

/** Input bulan M dibuka mulai tanggal 20 bulan sebelumnya. */
export function monthlyOpenStart(year, month) {
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  return new Date(previousYear, previousMonth - 1, 20, 0, 0, 0, 0);
}

/** Akhir input bulan M: tanggal 19 pada bulan yang sama. */
export function monthlyLockDate(year, month) {
  return endOfDay(year, month, 19);
}

export function monthlyDeadlineLabel(year, month) {
  const d = monthlyLockDate(year, month);
  return `19 ${monthName(d.getMonth() + 1)} ${d.getFullYear()}`;
}

export function targetLockDate(year) {
  return endOfDay(year, 2, 19);
}

export function isMonthlyOpen(year, month, now = new Date()) {
  const t = now.getTime();
  return t >= monthlyOpenStart(year, month).getTime() && t <= monthlyLockDate(year, month).getTime();
}

export function isMonthInEffectivity(year, month, start, end) {
  if (!start || !end) return true;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T23:59:59.999`);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  return monthEnd >= startDate && monthStart <= endDate;
}

export function isTargetOpen(year, now = new Date()) {
  return now.getTime() <= targetLockDate(year).getTime();
}

/** Idea baru/edit terbuka sampai 19 Feb tahun Y. Setelah itu hanya MR. */
export function isIdeaOpen(year, now = new Date()) {
  return now.getTime() <= targetLockDate(year).getTime();
}
