/**
 * Aturan periode input:
 * - Data bulanan bulan M : dapat diisi/direvisi pada
 *     **tanggal 18 bulan M sampai tanggal 18 bulan M+1**
 *   (satu jendela per bulan, berurutan; tidak tumpang tindih).
 *   Setelah keluar jendela, terkunci untuk USER; MR tetap dapat mengoreksi.
 *   Contoh: data Agustus terbuka 18 Agust → 18 Sep.
 * - Target tahunan Y     : terbuka s/d 18 Februari Y.
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

/** Mulai jendela input bulan M: tanggal 18 bulan M. */
export function monthlyOpenStart(year, month) {
  return new Date(year, month - 1, 18, 0, 0, 0, 0);
}

/** Akhir jendela input bulan M: tanggal 18 bulan M+1 (handle Des -> Jan). */
export function monthlyLockDate(year, month) {
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  return endOfDay(endYear, endMonth, 18);
}

export function monthlyDeadlineLabel(year, month) {
  const d = monthlyLockDate(year, month);
  return `18 ${monthName(d.getMonth() + 1)} ${d.getFullYear()}`;
}

export function targetLockDate(year) {
  return endOfDay(year, 2, 18);
}

export function isMonthlyOpen(year, month, now = new Date()) {
  const t = now.getTime();
  return t >= monthlyOpenStart(year, month).getTime() && t <= monthlyLockDate(year, month).getTime();
}

export function isTargetOpen(year, now = new Date()) {
  return now.getTime() <= targetLockDate(year).getTime();
}

/** Idea baru/edit terbuka sampai 18 Feb tahun Y. Setelah itu hanya MR. */
export function isIdeaOpen(year, now = new Date()) {
  return now.getTime() <= targetLockDate(year).getTime();
}
