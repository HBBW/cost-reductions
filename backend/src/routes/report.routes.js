import { Router } from 'express';
import ExcelJS from 'exceljs';
import { query, t } from '../db/index.js';
import { ah } from '../utils/http.js';
import { requireAuth, requireRole, resolveScope, deptFilter } from '../middlewares/auth.js';
import { monthName } from '../utils/period.js';

const router = Router();

async function fetchDetail(year, deptIds) {
  const params = [year, ...deptFilter('i.department_id', deptIds).params];
  let sql = `
    SELECT d.name AS department_name, i.id AS idea_id, i.name AS idea_name,
           i.potential_cr, i.remark,
           im.month, im.budget, im.actual_cost
    FROM ${t('ideas')} i
    JOIN ${t('departments')} d ON d.id = i.department_id
    LEFT JOIN ${t('idea_monthly')} im ON im.idea_id = i.id
    WHERE i.year = ?${deptFilter('i.department_id', deptIds).sql}`;
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
    // Potential YTD = potential per bulan × jumlah bulan terisi, sejajar dengan actual (sum bulan terisi)
    potential: Math.round((i.potentialCr * i.months.length) * 100) / 100,
    actual: Math.round(i.actual * 100) / 100
  }));
}

router.get('/report/detail', requireAuth, ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scope = await resolveScope(req, req.query.department_id);
  res.json({ year, ideas: await fetchDetail(year, scope.deptIds) });
}));

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

router.get('/report/export/csv', requireAuth, requireRole('FA', 'MR'), ah(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const scope = await resolveScope(req, req.query.department_id);
  const ideas = await fetchDetail(year, scope.deptIds);

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
  const scope = await resolveScope(req, req.query.department_id);
  const ideas = await fetchDetail(year, scope.deptIds);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CR Monitor';
  wb.created = new Date();

  /* ==========================================
   * Sheet 1: Detail Idea (Custom Matrix View)
   * ========================================== */
  const ws = wb.addWorksheet('Detail Idea');

  // Palette warna & border style
  const baseBorder = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } }
  };

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }; // Soft Blue / Gray
  const yellowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }; // Light Yellow
  const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } }; // Light Green
  const redFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4C7C3' } }; // Soft Red (Minus)

  // 1. Definisi Lebar Kolom
  const monthNames = Array.from({ length: 12 }, (_, i) => monthName(i + 1));
  ws.columns = [
    { key: 'sub_dept', width: 14 },
    { key: 'total_no', width: 8 },
    { key: 'dept_no', width: 8 },
    { key: 'idea_name', width: 45 },
    { key: 'pot_cr_yr', width: 18 },
    { key: 'act_cr_yr', width: 18 },
    { key: 'ctrl_month', width: 18 },
    ...monthNames.map(() => ({ width: 16 }))
  ];

  // 2. Buat Multi-Level Header (Baris 1 & Baris 2)
  const headerRow1 = [
    'Sub.\nDept', 'Total\nNo.', 'Dept\nNo.', 'IDEA CR',
    'Cost Merit per Year ( IDR)', null, 'Control/\nMonth',
    ...monthNames
  ];
  const headerRow2 = [
    null, null, null, null,
    'Potential CR', 'Actual CR', null,
    ...monthNames.map(() => null)
  ];

  const r1 = ws.addRow(headerRow1);
  const r2 = ws.addRow(headerRow2);
  r1.height = 28;
  r2.height = 20;

  // Format Header
  [r1, r2].forEach((row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, size: 10, name: 'Calibri' };
      cell.fill = headerFill;
      cell.border = baseBorder;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
  });

  // Merge Cell Header
  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:B2');
  ws.mergeCells('C1:C2');
  ws.mergeCells('D1:D2');
  ws.mergeCells('E1:F1');
  ws.mergeCells('G1:G2');

  monthNames.forEach((_, idx) => {
    const colLetter = ws.getColumn(8 + idx).letter;
    ws.mergeCells(`${colLetter}1:${colLetter}2`);
  });

  // 3. Grouping Data per Departemen
  const deptsMap = new Map();
  ideas.forEach((i) => {
    if (!deptsMap.has(i.departmentName)) {
      deptsMap.set(i.departmentName, []);
    }
    deptsMap.get(i.departmentName).push(i);
  });

  let globalTotalNo = 1;
  let currentRowIdx = 3;

  deptsMap.forEach((deptIdeas, deptName) => {
    const startDeptRow = currentRowIdx;
    let deptTotalPotYr = 0;
    let deptTotalActYr = 0;
    const deptMonthlyPot = Array(12).fill(0);
    const deptMonthlyAct = Array(12).fill(0);

    deptIdeas.forEach((idea, deptIdx) => {
      const ideaStartRow = currentRowIdx;
      const deptNo = deptIdx + 1;
      const totalNo = globalTotalNo++;

      // Susun data 12 bulan
      const mData = Array.from({ length: 12 }, (_, mIdx) => {
        const monthObj = idea.months.find((m) => Number(m.month) === mIdx + 1);
        return {
          budget: monthObj ? monthObj.budget : 0,
          cost: monthObj ? monthObj.actualCost : 0,
          pot: monthObj ? monthObj.potential : 0,
          actCr: monthObj ? monthObj.actualCr : 0,
          hasData: !!monthObj
        };
      });

      // Hitung jumlah bulan yang sudah diisi untuk idea ini
      const filledMonthsCount = mData.filter(m => m.hasData).length;
      const potentialCrPerYear = idea.potentialCr * filledMonthsCount;

      deptTotalPotYr += potentialCrPerYear;
      deptTotalActYr += idea.actual;

      // Akumulasi total bulanan departemen
      mData.forEach((m, idx) => {
        deptMonthlyPot[idx] += m.pot;
        deptMonthlyAct[idx] += m.actCr;
      });

      // 4 Sub-baris per Idea: Budget, Actual Biaya, Potential CR, Actual CR
      const subRows = [
        { ctrl: 'Budget', key: 'budget', bg: null, bold: false },
        { ctrl: 'Actual Biaya', key: 'cost', bg: null, bold: false },
        { ctrl: 'Potential CR', key: 'pot', bg: yellowFill, bold: false },
        { ctrl: 'Actual CR', key: 'actCr', bg: yellowFill, bold: true }
      ];

      subRows.forEach((sub, sIdx) => {
        const rowVal = [
          null,
          sIdx === 0 ? totalNo : null,
          sIdx === 0 ? deptNo : null,
          sIdx === 0 ? idea.name : null,
          sIdx === 0 ? potentialCrPerYear : null,
          sIdx === 0 ? idea.actual : null,
          sub.ctrl,
          ...mData.map((m) => m[sub.key])
        ];

        const addedRow = ws.addRow(rowVal);
        addedRow.height = 18;

        addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = baseBorder;
          cell.font = { size: 9, name: 'Calibri', bold: sub.bold };

          if (colNumber >= 8) {
            // Kolom Bulan
            cell.numFmt = '#,##0';
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            if (sub.bg) cell.fill = sub.bg;

            // Highlight merah jika Actual CR minus/ada kendala
            if (sub.ctrl === 'Actual CR') {
              const mVal = mData[colNumber - 8].actCr;
              const hasData = mData[colNumber - 8].hasData;
              if (hasData && mVal <= 0) {
                cell.fill = redFill;
                cell.font = { size: 9, name: 'Calibri', bold: true, color: { argb: 'FF9C0006' } };
              } else {
                cell.font = { size: 9, name: 'Calibri', bold: true, color: { argb: 'FF002060' } };
              }
            }
          } else if (colNumber === 7) {
            // Kolom Control / Month
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            if (sub.bold) cell.font = { size: 9, name: 'Calibri', bold: true, color: { argb: 'FF002060' } };
          }
        });

        currentRowIdx++;
      });

      // Merge vertical sel untuk Idea ini
      const endIdeaRow = currentRowIdx - 1;
      ws.mergeCells(`B${ideaStartRow}:B${endIdeaRow}`);
      ws.mergeCells(`C${ideaStartRow}:C${endIdeaRow}`);
      ws.mergeCells(`D${ideaStartRow}:D${endIdeaRow}`);
      ws.mergeCells(`E${ideaStartRow}:E${endIdeaRow}`);
      ws.mergeCells(`F${ideaStartRow}:F${endIdeaRow}`);

      ws.getCell(`B${ideaStartRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(`C${ideaStartRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(`D${ideaStartRow}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

      ['E', 'F'].forEach((col) => {
        const cell = ws.getCell(`${col}${ideaStartRow}`);
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0';
        cell.font = { size: 10, name: 'Calibri', bold: true };
      });
    });

    // Baris TOTAL per Departemen (2 sub-baris: Total Potential CR & Total Actual CR)
    const totRow1Idx = currentRowIdx;
    const totRow2Idx = currentRowIdx + 1;

    const totRow1 = ws.addRow([null, null, null, 'TOTAL', deptTotalPotYr, deptTotalActYr, 'Total Potential CR', ...deptMonthlyPot]);
    const totRow2 = ws.addRow([null, null, null, null, null, null, 'Total Actual CR', ...deptMonthlyAct]);

    [totRow1, totRow2].forEach((row, idx) => {
      row.height = 20;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = baseBorder;
        cell.fill = totalFill;
        cell.font = { size: 9, name: 'Calibri', bold: true };

        if (colNumber >= 8) {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          if (idx === 1) cell.font = { size: 9, name: 'Calibri', bold: true, color: { argb: 'FF002060' } };
        } else if (colNumber === 7) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          if (idx === 1) cell.font = { size: 9, name: 'Calibri', bold: true, color: { argb: 'FF002060' } };
        }
      });
    });

    ws.mergeCells(`D${totRow1Idx}:D${totRow2Idx}`);
    ws.mergeCells(`E${totRow1Idx}:E${totRow2Idx}`);
    ws.mergeCells(`F${totRow1Idx}:F${totRow2Idx}`);

    ws.getCell(`D${totRow1Idx}`).alignment = { horizontal: 'center', vertical: 'middle' };
    ['E', 'F'].forEach((col) => {
      const cell = ws.getCell(`${col}${totRow1Idx}`);
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.numFmt = '#,##0';
    });

    currentRowIdx += 2;

    // Merge Kolom A (Sub Dept) untuk seluruh baris dalam departemen ini
    const endDeptRow = currentRowIdx - 1;
    ws.mergeCells(`A${startDeptRow}:A${endDeptRow}`);
    const deptCell = ws.getCell(`A${startDeptRow}`);
    deptCell.value = deptName;
    deptCell.alignment = { horizontal: 'center', vertical: 'middle', textRotation: -90, wrapText: true };
    deptCell.font = { size: 11, name: 'Calibri', bold: true };
  });

  // Freeze Header & Left Columns
  ws.views = [{ state: 'frozen', xSplit: 7, ySplit: 2 }];

  /* ==========================================
   * Sheet 2: Rekap per Idea (Tetap Dipertahankan)
   * ========================================== */
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
    const filledMonthsCount = idea.months.length;
    const potentialCrPerYear = idea.potentialCr * filledMonthsCount;
    const sisa = Math.round((potentialCrPerYear - idea.actual) * 100) / 100;

    ws2.addRow({
      dept: idea.departmentName,
      idea: idea.name,
      pot: potentialCrPerYear,
      acr: idea.actual,
      sisa: sisa,
      rem: idea.remark || ''
    });
  }

  ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF175E4C' } };
  ['pot', 'acr', 'sisa'].forEach((k) => { ws2.getColumn(k).numFmt = '#,##0.00'; });
  ws2.views = [{ state: 'frozen', ySplit: 1 }];

  // Output Response
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan-CR-${year}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

export default router;
