/**
 * Aturan periode input:
 * - Data bulanan bulan M dapat diisi mulai tanggal 20 bulan M
 *   sampai tanggal 20 bulan M+1 (satu bulan setelahnya).
 *   Jadi yang terbuka saat ini adalah bulan sebelumnya (mis. awal Oktober
 *   yang terbuka adalah September).
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

/**
 * Normalisasi nilai DATE dari DB menjadi 'YYYY-MM-DD'.
 * - MSSQL  : driver mengembalikan objek Date (UTC midnight) -> pakai komponen UTC.
 * - MySQL  : dateStrings=true sudah berupa string 'YYYY-MM-DD'.
 */
export function dateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  return s ? s.slice(0, 10) : null;
}

/** Input bulan M dibuka mulai tanggal 20 bulan M. */
export function monthlyOpenStart(year, month) {
  return new Date(year, month - 1, 20, 0, 0, 0, 0);
}

/** Akhir input bulan M: tanggal 20 bulan M+1. */
export function monthlyLockDate(year, month) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return endOfDay(nextYear, nextMonth, 20);
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
  const startStr = dateOnly(start);
  const endStr = dateOnly(end);
  if (!startStr || !endStr) return true;
  const startDate = new Date(`${startStr}T00:00:00`);
  const endDate = new Date(`${endStr}T23:59:59.999`);
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
