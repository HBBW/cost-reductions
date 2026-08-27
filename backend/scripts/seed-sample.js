import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

/**
 * Data contoh untuk demo (HANYA MySQL). Menambahkan idea + data bulanan
 * untuk tahun berjalan pada 3 departemen pertama.
 */

let s = 42;
const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const between = (min, max) => Math.round((min + rand() * (max - min)) * 100) / 100;

const IDEA_NAMES = [
  ['Efisiensi kompresor udara line A', 'Efisiensi energi listrik dengan VSD', 'Reduksi scrap material PP rekondisi'],
  ['Perbaikan power factor panel utama', 'Optimasi jadwal PM mesin kritikal', 'Reuse packing kayu internal'],
  ['Standardisasi setelan mould (reduksi trial)', 'Klakson LED pengganti lampu sorot', 'Rekondisi filter hydraulic']
];
async function main() {
  if (config.dbClient !== 'mysql') {
    console.error('Seed sample hanya untuk DB_CLIENT=mysql'); process.exit(1);
  }
  const pool = await mysql.createPool({ ...config.mysql, dateStrings: true });

  const [depts] = await pool.query('SELECT id FROM departments ORDER BY id LIMIT 3');
  const [[mrUser]] = await pool.query("SELECT id FROM users WHERE role='MR' LIMIT 1");
  const year = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;

  for (let di = 0; di < depts.length; di++) {
    const deptId = depts[di].id;

    /* Target tahunan */
    for (let m = 1; m <= 12; m++) {
      await pool.query(
        `INSERT INTO department_targets (year, department_id, month, target_amount, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE target_amount = VALUES(target_amount)`,
        [year, deptId, m, between(18, 35) * 1e6, mrUser.id]
      );
    }

    /* Ideas */
    for (let ii = 0; ii < 3; ii++) {
      const name = IDEA_NAMES[di][ii];
      await pool.query('DELETE im FROM idea_monthly im JOIN ideas i ON i.id = im.idea_id WHERE i.department_id=? AND i.name=? AND i.year=?', [deptId, name, year]);
      await pool.query('DELETE FROM ideas WHERE department_id=? AND name=? AND year=?', [deptId, name, year]);
      const [res] = await pool.query(
        `INSERT INTO ideas (year, department_id, name, remark, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [year, deptId, name, null, mrUser.id]
      );
      const ideaId = res.insertId;

      /* Data bulanan sampai bulan lalu (bulan berjalan belum lengkap agar status terlihat) */
      const untilMonth = Math.max(0, nowMonth - 1);
      for (let m = 1; m <= untilMonth; m++) {
        const budget = between(80, 130) * 1e6;
        const cost = budget * between(0.78, 1.02);
        await pool.query(
          `INSERT INTO idea_monthly (idea_id, month, potential_cr, budget, actual_cost, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [ideaId, m, between(5, 14) * 1e6, Math.round(budget), Math.round(cost), mrUser.id]
        );
      }
    }
  }

  await pool.end();
  console.log(`Sample data ${year} dibuat untuk ${depts.length} departemen (data bulanan s/d bulan ke-${Math.max(0, nowMonth - 1)}).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
