// Form-side shape for the tracker category builder. Differs from the wire
// format (`TrackerCategoryCreateInput`) in that sections have stable
// client-side IDs and task lists reference sections by that ID. We translate
// to name-based wire format on submit and back on load.

import type { Frequency } from '@/lib/tracker.types';

export interface TrackerFormSection {
  id: string;
  name: string;
}

export interface TrackerFormTaskList {
  id: string;
  name: string;
  /** Stable id of the parent section, never the section name. */
  section_id: string;
}

export interface TrackerFormValues {
  name: string;
  description?: string | null;
  frequency: Frequency;
  sections: TrackerFormSection[];
  task_lists: TrackerFormTaskList[];
}
