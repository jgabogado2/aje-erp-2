import ExcelJS from 'exceljs';
import { STATUS_HEX, STATUS_LABEL, periodHeader, uniqueWorksheetName } from '@/lib/reports/format';
import type { TrackerReportData } from '@/lib/api/tracker-report-data';
import type { TrackerRow } from '@/lib/tracker-view';

export async function buildTrackerExcel(data: TrackerReportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hakbang';
  workbook.created = new Date();
  workbook.modified = new Date();

  const usedNames = new Set<string>();
  const rowsBySection = new Map<string, TrackerRow[]>();
  for (const row of data.rows) {
    const key = row.section?.id ?? 'ungrouped';
    if (!rowsBySection.has(key)) rowsBySection.set(key, []);
    rowsBySection.get(key)!.push(row);
  }

  const groups = [
    ...data.sections.map((section) => ({
      name: section.name,
      rows: rowsBySection.get(section.id) ?? [],
    })),
  ];
  const ungroupedRows = rowsBySection.get('ungrouped') ?? [];
  if (ungroupedRows.length || groups.length === 0) {
    groups.push({ name: 'Ungrouped', rows: ungroupedRows });
  }

  for (const group of groups) {
    const worksheet = workbook.addWorksheet(
      uniqueWorksheetName(group.name, usedNames, 'Section')
    );
    worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

    const header = [
      'Task item',
      'Frequency',
      'Assignee',
      ...data.columns.map((column) =>
        `${periodHeader(column, data.site_tracker.tracker_category.frequency)} (${column.dueDate})`
      ),
    ];
    worksheet.addRow(header);

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF111827' },
    };
    headerRow.alignment = { vertical: 'middle', wrapText: true };

    for (const row of group.rows) {
      const excelRow = worksheet.addRow([
        row.taskList.name,
        row.taskList.frequency,
        row.taskList.assignee?.name ?? row.taskList.assignee?.email ?? 'Unassigned',
        ...data.columns.map((column) => {
          const entry = row.entriesByColumn.get(column.key);
          return entry ? STATUS_LABEL[entry.status] : '';
        }),
      ]);

      for (let index = 0; index < data.columns.length; index += 1) {
        const entry = row.entriesByColumn.get(data.columns[index].key);
        if (!entry) continue;
        const cell = excelRow.getCell(index + 4);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${STATUS_HEX[entry.status]}` },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
    }

    worksheet.addRow([]);
    worksheet.addRow(['Summary']);
    worksheet.addRow(['Completion rate', `${data.summary.completion_rate}%`]);
    worksheet.addRow(['Overdue', data.summary.overdue]);
    worksheet.addRow(['Total entries', data.summary.total]);

    worksheet.getColumn(1).width = 36;
    worksheet.getColumn(2).width = 14;
    worksheet.getColumn(3).width = 28;
    for (let columnIndex = 4; columnIndex < header.length + 1; columnIndex += 1) {
      worksheet.getColumn(columnIndex).width = 16;
    }

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    });
  }

  return workbook.xlsx.writeBuffer();
}
