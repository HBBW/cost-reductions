import nodemailer from 'nodemailer';
import { query, t } from '../db/index.js';
import { config } from '../config.js';
import { isMonthlyOpen, monthlyLockDate, monthName } from '../utils/period.js';
import { resolveRole } from '../utils/roles.js';

const ADMIN_ROLES = new Set(['MR', 'FA', 'FA_READONLY', 'FA_INPUT']);

/** Cari periode (tahun, bulan) yang jendela inputnya sedang terbuka. */
export function findOpenPeriod(now = new Date()) {
  for (const offset of [0, -1]) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    if (isMonthlyOpen(year, month, now)) return { year, month };
  }
  return null;
}

/**
 * Rekap kelengkapan data bulanan untuk periode yang sedang terbuka:
 * berapa idea per departemen yang sudah diisi (budget/actual tidak nol).
 */
export async function buildRecap(now = new Date()) {
  const period = findOpenPeriod(now);
  if (!period) return null;
  const { year, month } = period;

  const depts = await query(
    `SELECT id, name FROM ${t('departments')} WHERE is_active = 1 ORDER BY name`
  );
  const ideas = await query(
    `SELECT id, department_id, name FROM ${t('ideas')} WHERE year = ? ORDER BY id`,
    [year]
  );
  const filled = await query(
    `SELECT im.idea_id FROM ${t('idea_monthly')} im
     JOIN ${t('ideas')} i ON i.id = im.idea_id
     WHERE i.year = ? AND im.month = ? AND (im.budget <> 0 OR im.actual_cost <> 0)`,
    [year, month]
  );
  const filledSet = new Set(filled.map((r) => Number(r.idea_id)));

  const departments = [];
  for (const d of depts) {
    const deptIdeas = ideas.filter((i) => String(i.department_id) === String(d.id));
    if (!deptIdeas.length) continue;
    const missing = deptIdeas.filter((i) => !filledSet.has(Number(i.id))).map((i) => i.name);
    departments.push({
      name: d.name,
      total: deptIdeas.length,
      filled: deptIdeas.length - missing.length,
      missing
    });
  }

  const deadline = monthlyLockDate(year, month);
  return {
    year,
    month,
    monthLabel: monthName(month),
    deadlineLabel: `${deadline.getDate()} ${monthName(deadline.getMonth() + 1)} ${deadline.getFullYear()}`,
    departments,
    incomplete: departments.filter((d) => d.missing.length > 0),
    complete: departments.filter((d) => d.missing.length === 0)
  };
}

/** Email admin: prioritas email dari aplikasi (CR_user_emails) > email HRIS > REMINDER_TO. */
export async function getAdminEmails() {
  const build = (withAppEmail, withHrisEmail) => `
    SELECT u.role, u.department_id,
           ${withAppEmail && withHrisEmail ? 'COALESCE(e.email, u.email)' : withAppEmail ? 'e.email' : withHrisEmail ? 'u.email' : 'NULL'} AS email
    FROM ${t('users')} u${withAppEmail ? `
    LEFT JOIN ${t('user_emails')} e ON e.employee_id = u.id` : ''}
    WHERE u.is_active = 1`;

  const variants = [build(true, true), build(true, false), build(false, true), build(false, false)];
  let fromUsers = [];
  let lastReason = '';
  for (const sql of variants) {
    try {
      const rows = await query(sql, []);
      fromUsers = rows
        .filter((r) => ADMIN_ROLES.has(resolveRole({ role: r.role, department_id: r.department_id })))
        .map((r) => (r.email != null ? String(r.email).trim() : ''))
        .filter(Boolean);
      lastReason = '';
      break;
    } catch (err) {
      lastReason = err.message;
    }
  }
  if (lastReason) console.warn(`[reminder] tidak bisa membaca email dari database (${lastReason}) — pakai REMINDER_TO saja.`);
  return [...new Set([...fromUsers, ...config.reminder.to])];
}

export function renderEmail(recap) {
  const subject = `[CR Monitor] Data ${recap.monthLabel} ${recap.year} belum lengkap — deadline ${recap.deadlineLabel}`;

  const lines = [];
  lines.push(`Rekap kelengkapan data Cost Reduction bulan ${recap.monthLabel} ${recap.year}.`);
  lines.push(`Batas pengisian: ${recap.deadlineLabel}.`);
  lines.push('');
  if (!recap.incomplete.length) {
    lines.push('Semua departemen sudah lengkap. Terima kasih.');
  } else {
    lines.push(`Departemen belum lengkap (${recap.incomplete.length}):`);
    for (const d of recap.incomplete) {
      lines.push(`- ${d.name}: ${d.filled}/${d.total} idea terisi`);
      for (const nm of d.missing) lines.push(`    • ${nm}`);
    }
    lines.push('');
    lines.push(`Departemen sudah lengkap (${recap.complete.length}): ${recap.complete.map((d) => d.name).join(', ') || '-'}`);
  }
  lines.push('');
  lines.push(`Buka aplikasi: ${config.reminder.appUrl}`);
  const text = lines.join('\n');

  const rows = recap.departments.map((d) => {
    const ok = d.missing.length === 0;
    const missingHtml = ok ? '—' : d.missing.map((nm) => `<li>${escapeHtml(nm)}</li>`).join('');
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${escapeHtml(d.name)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${d.filled}/${d.total}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:${ok ? '#166534' : '#b91c1c'}">${ok ? 'Lengkap' : 'Belum lengkap'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb"><ul style="margin:0;padding-left:18px">${missingHtml}</ul></td>
    </tr>`;
  }).join('');

  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;color:#1c1917;max-width:760px">
    <h2 style="margin:0 0 4px">CR Monitor — Pengingat Pengisian Data</h2>
    <p style="margin:0 0 12px;color:#57534e">
      Rekap kelengkapan data <strong>${recap.monthLabel} ${recap.year}</strong>.
      Batas pengisian: <strong>${recap.deadlineLabel}</strong>.
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead>
        <tr style="background:#f3f6fb;text-align:left">
          <th style="padding:6px 10px;border-bottom:2px solid #94a3b8">Departemen</th>
          <th style="padding:6px 10px;border-bottom:2px solid #94a3b8;text-align:right">Terisi</th>
          <th style="padding:6px 10px;border-bottom:2px solid #94a3b8">Status</th>
          <th style="padding:6px 10px;border-bottom:2px solid #94a3b8">Idea belum diisi</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:16px 0">
      <a href="${config.reminder.appUrl}" style="background:#14532d;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">
        Buka CR Monitor
      </a>
    </p>
    <p style="color:#78716c;font-size:12px">Email otomatis dari CR Monitor tanggal 12 setiap bulan.</p>
  </div>`;

  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Kirim pengingat. Tanpa SMTP terkonfigurasi (atau dryRun), email tidak dikirim —
 * isi email tetap dicetak ke log sebagai pratinjau.
 */
export async function sendReminder({ dryRun = false, now = new Date() } = {}) {
  const recap = await buildRecap(now);
  if (!recap) return { sent: false, reason: 'Tidak ada periode input yang terbuka saat ini' };

  const recipients = await getAdminEmails();
  const { subject, text, html } = renderEmail(recap);

  if (dryRun || !config.smtp.host) {
    const reason = config.smtp.host ? 'dry-run' : 'SMTP belum dikonfigurasi (SMTP_HOST kosong)';
    console.log(`[reminder] ${reason} — email TIDAK dikirim.`);
    console.log(`[reminder] Penerima (${recipients.length}): ${recipients.join(', ') || '-'}`);
    console.log(`[reminder] Subjek: ${subject}`);
    console.log(text);
    return { sent: false, dryRun: true, reason, subject, recipients, preview: text };
  }

  if (!recipients.length) {
    return { sent: false, reason: 'Tidak ada email admin (HRIS kosong & REMINDER_TO belum diset)', subject, preview: text };
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
  });
  const info = await transporter.sendMail({
    from: config.smtp.from,
    to: recipients.join(', '),
    subject,
    text,
    html
  });
  return { sent: true, subject, recipients, messageId: info.messageId };
}
