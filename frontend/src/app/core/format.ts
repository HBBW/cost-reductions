export const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  ON_PROGRESS: 'On Progress',
  DONE: 'Done',
  CANCEL: 'Cancel'
};

const nf0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfCompact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '-';
  return digits === 0 ? nf0.format(n) : new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '-';
  return nf0.format(n);
}

export function fmtMoney2(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '-';
  return nf2.format(n);
}

/** Untuk sumbu grafik: 1.250.000 -> "1,3 jt" */
export function fmtCompact(n: number): string {
  return nfCompact.format(n);
}

export function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '-';
  return `${fmtNum(n, 1)}%`;
}

/** Parsing input angka yang memungkinkan pemisah ribuan titik & desimal koma. */
export function parseRupiahInput(str: string): number {
  const cleaned = String(str || '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Format tampilan sel input: "90000000" -> "90.000.000" (kosong bila 0). */
export const rupiahFmt = new Intl.NumberFormat('id-ID');

