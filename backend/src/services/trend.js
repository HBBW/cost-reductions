import { query, t } from '../db/index.js';
import { deptFilter } from '../middlewares/auth.js';

/** Tren bulanan: actual CR, potential, target, dan kumulatif YTD per bulan. */
export async function fetchTrend(year, deptIds) {
  const actF = deptFilter('i.department_id', deptIds);
  const actRows = await query(
    `SELECT im.month, SUM(im.budget - im.actual_cost) AS actual
     FROM ${t('idea_monthly')} im JOIN ${t('ideas')} i ON i.id = im.idea_id
     WHERE i.year = ?${actF.sql}
     GROUP BY im.month`,
    [year, ...actF.params]
  );
  const actMap = new Map(actRows.map((r) => [Number(r.month), Number(r.actual)]));

  const tgtF = deptFilter('t.department_id', deptIds);
  const tgtRows = await query(
    `SELECT month, SUM(target_amount) AS target
     FROM ${t('department_targets')} t
     WHERE t.year = ?${tgtF.sql}
     GROUP BY month`,
    [year, ...tgtF.params]
  );
  const tgtMap = new Map(tgtRows.map((r) => [Number(r.month), Number(r.target)]));

  const potF = deptFilter('i.department_id', deptIds);
  const potRows = await query(
    `SELECT pm.month, SUM(pm.potential_amount) AS potential
     FROM ${t('idea_potential_monthly')} pm JOIN ${t('ideas')} i ON i.id = pm.idea_id
     WHERE i.year = ?${potF.sql}
     GROUP BY pm.month`,
    [year, ...potF.params]
  );
  const potMap = new Map(potRows.map((r) => [Number(r.month), Number(r.potential)]));

  let cumulative = 0;
  const nowMonth = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 13;
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const actual = actMap.get(m) || 0;
    cumulative += actual;
    months.push({
      month: m,
      target: tgtMap.get(m) || 0,
      potential: potMap.get(m) || 0,
      actual,
      cumulative: Math.round(cumulative * 100) / 100,
      future: m > nowMonth
    });
  }
  return { year, months };
}
