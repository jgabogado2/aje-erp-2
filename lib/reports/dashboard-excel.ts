import ExcelJS from 'exceljs';
import { STATUS_LABEL } from '@/lib/reports/format';
import type { DashboardSummary } from '@/types/domain';

export async function buildDashboardExcel(summary: DashboardSummary, year: number) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hakbang';
  workbook.created = new Date();
  workbook.modified = new Date();

  const overview = workbook.addWorksheet('Summary');
  overview.columns = [
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'Value', key: 'value', width: 18 },
  ];
  overview.addRows([
    { metric: 'Year', value: year },
    { metric: 'Sites', value: summary.sites_count },
    { metric: 'Members', value: summary.users_count },
    { metric: 'Entries', value: summary.entries_total },
    { metric: 'Completion rate', value: `${summary.completion_rate}%` },
    { metric: 'Overdue', value: summary.overdue_count },
    { metric: 'Due next 7 days', value: summary.due_next_7_days },
  ]);

  const byStatus = workbook.addWorksheet('Status');
  byStatus.columns = [
    { header: 'Status', key: 'status', width: 24 },
    { header: 'Count', key: 'count', width: 12 },
  ];
  byStatus.addRows(
    summary.by_status.map((row) => ({
      status: STATUS_LABEL[row.status],
      count: row.count,
    }))
  );

  const byAssignee = workbook.addWorksheet('Assignees');
  byAssignee.columns = [
    { header: 'Assignee', key: 'name', width: 32 },
    { header: 'Overdue', key: 'overdue_count', width: 12 },
    { header: 'Completion', key: 'completion_rate', width: 16 },
  ];
  byAssignee.addRows(
    summary.by_assignee.map((row) => ({
      ...row,
      completion_rate: `${row.completion_rate}%`,
    }))
  );

  const attention = workbook.addWorksheet('Attention');
  attention.columns = [
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Task item', key: 'task', width: 36 },
    { header: 'Period', key: 'period', width: 18 },
    { header: 'Due date', key: 'due', width: 16 },
    { header: 'Assignee', key: 'assignee', width: 28 },
  ];
  attention.addRows([
    ...summary.overdue_entries.map((entry) => ({
      type: 'Overdue',
      task: entry.task_list?.name ?? 'Task entry',
      period: entry.period_label,
      due: entry.due_date,
      assignee:
        entry.task_list?.assignee?.name ?? entry.task_list?.assignee?.email ?? 'Unassigned',
    })),
    ...summary.upcoming_entries.map((entry) => ({
      type: 'Upcoming',
      task: entry.task_list?.name ?? 'Task entry',
      period: entry.period_label,
      due: entry.due_date,
      assignee:
        entry.task_list?.assignee?.name ?? entry.task_list?.assignee?.email ?? 'Unassigned',
    })),
  ]);

  for (const worksheet of workbook.worksheets) {
    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF111827' },
    };
  }

  return workbook.xlsx.writeBuffer();
}
