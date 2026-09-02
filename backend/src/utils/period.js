/**
 * Aturan periode input:
 * - Data bulanan bulan M : dapat diisi/direvisi pada
 *     **tanggal 19 bulan M sampai tanggal 19 bulan M+1**
 *   (satu jendela per bulan, berurutan; tidak tumpang tindih).
 *   Setelah keluar jendela, terkunci untuk USER; MR tetap dapat mengoreksi.
 *   Contoh: data Agustus terbuka 19 Agust → 19 Sep.
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

/** Mulai jendela input bulan M: tanggal 19 bulan M. */
export function monthlyOpenStart(year, month) {
  return new Date(year, month - 1, 19, 0, 0, 0, 0);
}

/** Akhir jendela input bulan M: tanggal 19 bulan M+1 (handle Des -> Jan). */
export function monthlyLockDate(year, month) {
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  return endOfDay(endYear, endMonth, 19);
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

export function isTargetOpen(year, now = new Date()) {
  return now.getTime() <= targetLockDate(year).getTime();
}

/** Idea baru/edit terbuka sampai 19 Feb tahun Y. Setelah itu hanya MR. */
export function isIdeaOpen(year, now = new Date()) {
  return now.getTime() <= targetLockDate(year).getTime();
}
