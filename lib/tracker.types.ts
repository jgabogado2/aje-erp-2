// Tracker-system constants and shared types. Kept separate from auth.types
// so non-auth files can import without dragging session deps.

export const FREQUENCIES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
  'BIR',
  'CUSTOM',
] as const;

export type Frequency = (typeof FREQUENCIES)[number];

// Sections are universally available across all frequencies and always
// optional — task lists either group under a section, or attach directly
// to the tracker. The decision is per-category, not per-frequency.

export const TASK_STATUSES = ['NOT_DONE', 'ONGOING', 'DONE', 'DONE_LATE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const BIR_STATUSES = [
  'NO_SUBMISSION',
  'SUBMITTED_TO_FRG',
  'APPROVED_FOR_FILING',
  'FILED_FOR_PAYMENT',
  'FILED_AND_PAID',
  'FILED_NO_PAYMENT',
] as const;
export type BirStatus = (typeof BIR_STATUSES)[number];
