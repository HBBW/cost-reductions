import { Router } from 'express';
import { query, t } from '../db/index.js';
import { ah } from '../utils/http.js';
import { requireAuth, resolveDepartmentScope } from '../middlewares/auth.js';
import { isMonthlyOpen } from '../utils/period.js';

const router = Router();

/**
 * Ringkasan per departemen untuk satu tahun:
 * potential (YTD semua bulan terisi), actual, sisa, jml idea, target tahunan.
 */
router.get('/dashboard/summary', requireAuth, ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scopedDept = resolveDepartmentScope(req, req.query.department_id);

  let sql = `
    SELECT d.id AS department_id, d.name AS department_name,
           COALESCE(idea_agg.potential, 0) AS potential,
           COALESCE(idea_agg.budget_total, 0) AS budget_total,
           COALESCE(idea_agg.actual_cost_total, 0) AS actual_cost_total,
           COALESCE(idea_agg.ideas_count, 0) AS ideas_count
    FROM ${t('departments')} d
    LEFT JOIN (
      SELECT i.department_id,
             SUM(i.potential_cr) AS potential,
             SUM(i.budget) AS budget_total,
             COALESCE(SUM(im.actual_cost), 0) AS actual_cost_total,
             COUNT(DISTINCT i.id) AS ideas_count
      FROM ${t('ideas')} i
      LEFT JOIN ${t('idea_monthly')} im ON im.idea_id = i.id
      WHERE i.year = ?
      GROUP BY i.department_id
    ) idea_agg ON idea_agg.department_id = d.id
    WHERE d.is_active = 1
    ORDER BY d.name`;

  const params = [year];
  if (scopedDept) { sql = sql.replace('WHERE d.is_active = 1', 'WHERE d.is_active = 1 AND d.id = ?'); params.push(scopedDept); }
  const rows = await query(sql, params);
  const tgtParams = [year];
  let tgtSql = `SELECT department_id, SUM(target_amount) AS total FROM ${t('department_targets')} WHERE year = ?`;
  if (scopedDept) { tgtSql += ' AND department_id = ?'; tgtParams.push(scopedDept); }
  tgtSql += ' GROUP BY department_id';
  const tgtRows = await query(tgtSql, tgtParams);
  const tgtMap = new Map(tgtRows.map((r) => [String(r.department_id), Number(r.total)]));

  const departments = rows.map((r) => {
    const potential = Number(r.potential);
    const budgetTotal = Number(r.budget_total);
    const actualCostTotal = Number(r.actual_cost_total);
    const actual = budgetTotal - actualCostTotal;
    const deptId = String(r.department_id);
    return {
      departmentId: deptId,
      departmentName: r.department_name,
      ideasCount: Number(r.ideas_count),
      budget: budgetTotal,
      potential,
      actualCost: actualCostTotal,
      actual,
      remaining: Math.round((potential - actualCostTotal) * 100) / 100,
      achievementPct: potential > 0 ? Math.round((actual / potential) * 1000) / 10 : null,
      target: tgtMap.get(deptId) || 0
    };
  });

  const totals = departments.reduce(
    (acc, d) => ({
      budget: acc.budget + d.budget,
      potential: acc.potential + d.potential,
      actualCost: acc.actualCost + d.actualCost,
      actual: acc.actual + d.actual,
      remaining: acc.remaining + d.remaining,
      target: acc.target + d.target,
      ideasCount: acc.ideasCount + d.ideasCount
    }),
    { budget: 0, potential: 0, actualCost: 0, actual: 0, remaining: 0, target: 0, ideasCount: 0 }
  );
  totals.achievementPct = totals.potential > 0 ? Math.round((totals.actual / totals.potential) * 1000) / 10 : null;

  res.json({ year, totals, departments });
}));

/** Tren bulanan: actual CR per bulan, target per bulan, kumulatif YTD. */
router.get('/dashboard/trend', requireAuth, ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scopedDept = resolveDepartmentScope(req, req.query.department_id);

  const buildFilter = (alias, params) => {
    let f = ` AND ${alias}.year = ?`;
    params.push(year);
    if (scopedDept) { f += ` AND ${alias}.department_id = ?`; params.push(scopedDept); }
    return f;
  };

  const actParams = [];
  const actSql = `
    SELECT im.month, SUM(im.budget - im.actual_cost) AS actual
    FROM ${t('idea_monthly')} im JOIN ${t('ideas')} i ON i.id = im.idea_id
    WHERE 1=1${buildFilter('i', actParams)}
    GROUP BY im.month`;
  const actRows = await query(actSql, actParams);
  const actMap = new Map(actRows.map((r) => [Number(r.month), Number(r.actual)]));

  const tgtParams = [];
  const tgtSql = `
    SELECT month, SUM(target_amount) AS target
    FROM ${t('department_targets')} t
    WHERE 1=1${buildFilter('t', tgtParams)}
    GROUP BY month`;
  const tgtRows = await query(tgtSql, tgtParams);
  const tgtMap = new Map(tgtRows.map((r) => [Number(r.month), Number(r.target)]));

  let cumulative = 0;
  const nowMonth = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 13;
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const actual = actMap.get(m) || 0;
    cumulative += actual;
    months.push({
      month: m,
      target: tgtMap.get(m) || 0,
      actual,
      cumulative: Math.round(cumulative * 100) / 100,
      future: m > nowMonth
    });
  }
  res.json({ year, months });
}));

/**
 * Matriks kelengkapan input: departemen x 12 bulan.
 * Status: OK | MISSING | CURRENT | UPCOMING (+ratio saat berjalan).
 */
router.get('/dashboard/completeness', requireAuth, ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scopedDept = resolveDepartmentScope(req, req.query.department_id);

  let deptSql = `SELECT id, name FROM ${t('departments')} WHERE is_active = 1`;
  const deptParams = [];
  if (scopedDept) { deptSql += ' AND id = ?'; deptParams.push(scopedDept); }
  deptSql += ' ORDER BY name';
  const depts = await query(deptSql, deptParams);

  const ideaParams = [year];
  let ideaSql = `SELECT id, department_id, name FROM ${t('ideas')} WHERE year = ?`;
  if (scopedDept) { ideaSql += ' AND department_id = ?'; ideaParams.push(scopedDept); }
  const ideas = await query(ideaSql, ideaParams);

  const filledParams = [year];
  let filledSql = `
    SELECT im.idea_id, im.month FROM ${t('idea_monthly')} im
    JOIN ${t('ideas')} i ON i.id = im.idea_id
    WHERE i.year = ?`;
  if (scopedDept) { filledSql += ' AND i.department_id = ?'; filledParams.push(scopedDept); }
  const filled = await query(filledSql, filledParams);

  const tgtRows = await query(
    `SELECT department_id, COUNT(*) AS c FROM ${t('department_targets')} WHERE year = ?${scopedDept ? ' AND department_id = ?' : ''} GROUP BY department_id`,
    scopedDept ? [year, scopedDept] : [year]
  );
  const tgtCount = new Map(tgtRows.map((r) => [String(r.department_id), Number(r.c)]));

  const ideasByDept = new Map();
  for (const i of ideas) {
    const dept = String(i.department_id);
    if (!ideasByDept.has(dept)) ideasByDept.set(dept, []);
    ideasByDept.get(dept).push({ id: Number(i.id), name: i.name });
  }
  const filledSet = new Set(filled.map((f) => `${Number(f.idea_id)}-${Number(f.month)}`));

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;

  const departments = depts.map((d) => {
    const deptId = String(d.id);
    const deptIdeas = ideasByDept.get(deptId) || [];
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const missing = deptIdeas.filter((idea) => !filledSet.has(`${idea.id}-${m}`));
      const filledCount = deptIdeas.length - missing.length;
      let status;
      if (deptIdeas.length === 0) status = 'NO_IDEA';
      else if (filledCount === deptIdeas.length) status = 'OK';
      else {
        const notStarted = year > nowYear || (year === nowYear && m > nowMonth);
        const isOpen = isMonthlyOpen(year, m);
        if (notStarted) status = 'UPCOMING';
        else if (!isOpen) status = 'MISSING';
        else status = 'CURRENT';
      }
      months.push({
        month: m,
        status,
        filled: filledCount,
        total: deptIdeas.length,
        missingIdeas: status === 'OK' ? [] : missing.map((mi) => mi.name)
      });
    }
    return {
      departmentId: deptId,
      departmentName: d.name,
      ideasCount: deptIdeas.length,
      targetEntered: (tgtCount.get(deptId) || 0) >= 12,
      months
    };
  });

  res.json({ year, currentMonth: year === nowYear ? nowMonth : null, departments });
}));

export default router;
