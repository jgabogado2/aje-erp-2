// Shared status chips for every tracker layout (grid + annual list).

import { statusTone, birStatusTone } from '@/lib/tracker-view';
import type { BirStatus, TaskStatus } from '@/lib/tracker.types';

export const STATUS_SHORT: Record<TaskStatus, string> = {
  DONE: 'Done',
  DONE_LATE: 'Late',
  ONGOING: 'Ongoing',
  NOT_DONE: 'Open',
};

export const BIR_SHORT: Record<BirStatus, string> = {
  NO_SUBMISSION: 'No sub.',
  SUBMITTED_TO_FRG: 'To FRG',
  APPROVED_FOR_FILING: 'Approved',
  FILED_FOR_PAYMENT: 'For pmt.',
  FILED_AND_PAID: 'Filed+Paid',
  FILED_NO_PAYMENT: 'No pmt.',
};

export function StatusChip({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${statusTone(status)}`}
    >
      {STATUS_SHORT[status]}
    </span>
  );
}

export function BirChip({ status }: { status: BirStatus | null }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${birStatusTone(status)}`}
    >
      {BIR_SHORT[status ?? 'NO_SUBMISSION']}
    </span>
  );
}
