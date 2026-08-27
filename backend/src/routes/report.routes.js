import { Router } from 'express';
import ExcelJS from 'exceljs';
import { query, t } from '../db/index.js';
import { ah } from '../utils/http.js';
import { requireAuth, requireRole, resolveDepartmentScope } from '../middlewares/auth.js';
import { monthName } from '../utils/period.js';

const router = Router();

async function fetchDetail(year, scopedDept) {
  const params = [year];
  let sql = `
    SELECT d.name AS department_name, i.id AS idea_id, i.name AS idea_name,
           i.potential_cr, i.remark,
           im.month, im.budget, im.actual_cost
    FROM ${t('ideas')} i
    JOIN ${t('departments')} d ON d.id = i.department_id
    LEFT JOIN ${t('idea_monthly')} im ON im.idea_id = i.id
    WHERE i.year = ?`;
  if (scopedDept) { sql += ' AND i.department_id = ?'; params.push(scopedDept); }
  sql += ' ORDER BY d.name, i.name, im.month';

  const rows = await query(sql, params);
  const ideasMap = new Map();
  for (const r of rows) {
    const id = Number(r.idea_id);
    if (!ideasMap.has(id)) {
      ideasMap.set(id, {
        departmentName: r.department_name,
        name: r.idea_name,
        remark: r.remark,
        potentialCr: Number(r.potential_cr),
        months: [],
        actual: 0
      });
    }
    const idea = ideasMap.get(id);
    if (r.month != null) {
      const budget = Number(r.budget);
      const cost = Number(r.actual_cost);
      const actualCr = Math.round((budget - cost) * 100) / 100;
      idea.months.push({ month: Number(r.month), potential: idea.potentialCr, budget, actualCost: cost, actualCr });
      idea.actual += actualCr;
    }
  }
  return [...ideasMap.values()].map((i) => ({
    ...i,
    actual: Math.round(i.actual * 100) / 100
  }));
}

router.get('/report/detail', requireAuth, ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scopedDept = resolveDepartmentScope(req, req.query.department_id);
  res.json({ year, ideas: await fetchDetail(year, scopedDept) });
}));

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

router.get('/report/export/csv', requireAuth, requireRole('FA', 'MR'), ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scopedDept = resolveDepartmentScope(req, req.query.department_id);
  const ideas = await fetchDetail(year, scopedDept);

  const header = ['Departemen', 'Idea', 'Remark', 'Bulan', 'Potential CR', 'Budget', 'Actual Biaya', 'Actual CR'];
  const lines = [header.map(csvEscape).join(';')];
  for (const idea of ideas) {
    if (!idea.months.length) {
      lines.push([idea.departmentName, idea.name, idea.remark, '-', 0, 0, 0, 0].map(csvEscape).join(';'));
    }
    for (const m of idea.months) {
      lines.push([
        idea.departmentName, idea.name, idea.remark,
        monthName(m.month), m.potential, m.budget, m.actualCost, m.actualCr
      ].map(csvEscape).join(';'));
    }
  }
  const csv = '\uFEFF' + lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan-CR-${year}.csv"`);
  res.send(csv);
}));

router.get('/report/export/excel', requireAuth, requireRole('FA', 'MR'), ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scopedDept = resolveDepartmentScope(req, req.query.department_id);
  const ideas = await fetchDetail(year, scopedDept);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CR Monitor';
  wb.created = new Date();

  /* Sheet 1: Detail Idea */
  const ws = wb.addWorksheet('Detail Idea');
  ws.columns = [
    { header: 'Departemen', key: 'dept', width: 22 },
    { header: 'Nama Idea', key: 'idea', width: 38 },
    { header: 'Bulan', key: 'bulan', width: 12 },
    { header: 'Potential CR', key: 'pot', width: 15 },
    { header: 'Budget', key: 'bud', width: 15 },
    { header: 'Actual Biaya', key: 'cost', width: 15 },
    { header: 'Actual CR', key: 'acr', width: 15 },
    { header: 'Remark', key: 'rem', width: 40 }
  ];
  for (const idea of ideas) {
    if (!idea.months.length) {
      ws.addRow({ dept: idea.departmentName, idea: idea.name, bulan: '-', pot: 0, bud: 0, cost: 0, acr: 0, rem: idea.remark || '' });
    }
    for (const m of idea.months) {
      ws.addRow({ dept: idea.departmentName, idea: idea.name, bulan: monthName(m.month), pot: m.potential, bud: m.budget, cost: m.actualCost, acr: m.actualCr, rem: idea.remark || '' });
    }
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF175E4C' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ['pot', 'bud', 'cost', 'acr'].forEach((k) => {
    ws.getColumn(k).numFmt = '#,##0.00';
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'H1' };

  /* Sheet 2: Rekap per Idea */
  const ws2 = wb.addWorksheet('Rekap Idea');
  ws2.columns = [
    { header: 'Departemen', key: 'dept', width: 22 },
    { header: 'Nama Idea', key: 'idea', width: 38 },
    { header: 'Potential CR/Tahun', key: 'pot', width: 18 },
    { header: 'Actual CR/Tahun', key: 'acr', width: 18 },
    { header: 'Sisa Potential', key: 'sisa', width: 16 },
    { header: 'Remark', key: 'rem', width: 40 }
  ];
  for (const idea of ideas) {
    ws2.addRow({
      dept: idea.departmentName, idea: idea.name,
      pot: idea.potentialCr, acr: idea.actual,
      sisa: Math.round((idea.potentialCr - idea.actual) * 100) / 100, rem: idea.remark || ''
    });
  }
  ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF175E4C' } };
  ['pot', 'acr', 'sisa'].forEach((k) => { ws2.getColumn(k).numFmt = '#,##0.00'; });
  ws2.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan-CR-${year}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

export default router;
