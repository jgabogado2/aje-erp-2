'use client';

import { Select } from '@/components/ui/select';
import {
  BIR_STATUSES,
  TASK_STATUSES,
  type BirStatus,
  type TaskStatus,
} from '@/lib/tracker.types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_DONE: 'Not done',
  ONGOING: 'Ongoing',
  DONE: 'Done',
  DONE_LATE: 'Done late',
};

export const BIR_LABEL: Record<BirStatus, string> = {
  NO_SUBMISSION: 'No submission',
  SUBMITTED_TO_FRG: 'Submitted to FRG',
  APPROVED_FOR_FILING: 'Approved for filing',
  FILED_FOR_PAYMENT: 'Filed for payment',
  FILED_AND_PAID: 'Filed and paid',
  FILED_NO_PAYMENT: 'Filed no payment',
};

export function TrackerStatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value as TaskStatus)}
      disabled={disabled}
      className="h-8 min-w-28 text-xs"
    >
      {TASK_STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABEL[status]}
        </option>
      ))}
    </Select>
  );
}

export function BirStatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: BirStatus | null;
  onChange: (status: BirStatus) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value ?? 'NO_SUBMISSION'}
      onChange={(event) => onChange(event.target.value as BirStatus)}
      disabled={disabled}
      className="h-8 min-w-36 text-xs"
    >
      {BIR_STATUSES.map((status) => (
        <option key={status} value={status}>
          {BIR_LABEL[status]}
        </option>
      ))}
    </Select>
  );
}
