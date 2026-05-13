import { z } from 'zod';
import { FREQUENCIES } from '@/lib/tracker.types';

// Template shapes stored as JSONB on tracker_categories.
//
// Naming note: in the UI, "task list" is shown as "task item" and "task" is
// shown as "subtask". The DB / API field names keep the original
// task_list_templates / task / etc. to avoid a cascading rename. Treat the
// schemas below as "task item template" and "subtask template" conceptually.

export const sectionTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  order: z.number().int().min(0).max(999),
});

export const subtaskTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  order: z.number().int().min(0).max(999),
});

export const taskListTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  order: z.number().int().min(0).max(999),
  section: z.string().trim().min(1).max(120),
  // Drives entry generation per task item. Required at template time so
  // instances can be assigned without any post-hoc configuration.
  frequency: z.enum(FREQUENCIES),
  skip_weekends: z.boolean().optional(),
  skip_holidays: z.boolean().optional(),
  // Optional subtask names. Subtasks inherit the parent's frequency and
  // skip rules; they exist as a checklist inside each entry.
  subtasks: z.array(subtaskTemplateSchema).max(50).optional(),
});

export const trackerCategoryCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    // Category-level frequency is now informational: every task item picks
    // its own. We default the wizard's "add task item" UI to this value.
    frequency: z.enum(FREQUENCIES),
    section_templates: z
      .array(sectionTemplateSchema)
      .min(1, 'Add at least one section')
      .max(50),
    task_list_templates: z.array(taskListTemplateSchema).max(200),
  })
  .superRefine((val, ctx) => {
    const seen = new Map<string, number>();
    for (const [i, s] of val.section_templates.entries()) {
      const key = s.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['section_templates', i, 'name'],
          message: `Section name "${s.name}" is already used`,
        });
      } else {
        seen.set(key, i);
      }
    }
    const sectionNames = new Set(val.section_templates.map((s) => s.name));
    for (const [i, tl] of val.task_list_templates.entries()) {
      if (!sectionNames.has(tl.section)) {
        ctx.addIssue({
          code: 'custom',
          path: ['task_list_templates', i, 'section'],
          message: `Unknown section "${tl.section}"`,
        });
      }
    }
    const seenInSection = new Map<string, number>();
    for (const [i, tl] of val.task_list_templates.entries()) {
      const key = `${tl.section.toLowerCase()}::${tl.name.toLowerCase()}`;
      if (seenInSection.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['task_list_templates', i, 'name'],
          message: `Task item "${tl.name}" is already used in section "${tl.section}"`,
        });
      } else {
        seenInSection.set(key, i);
      }
    }
    // Subtask names must be unique within their parent task item.
    for (const [i, tl] of val.task_list_templates.entries()) {
      if (!tl.subtasks) continue;
      const seenSub = new Map<string, number>();
      for (const [j, st] of tl.subtasks.entries()) {
        const key = st.name.toLowerCase();
        if (seenSub.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['task_list_templates', i, 'subtasks', j, 'name'],
            message: `Subtask "${st.name}" is already used in this task item`,
          });
        } else {
          seenSub.set(key, j);
        }
      }
    }
  });

export const trackerCategoryUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    frequency: z.enum(FREQUENCIES).optional(),
    section_templates: z
      .array(sectionTemplateSchema)
      .min(1, 'Add at least one section')
      .max(50)
      .optional(),
    task_list_templates: z.array(taskListTemplateSchema).max(200).optional(),
    is_active: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.section_templates) {
      const seen = new Map<string, number>();
      for (const [i, s] of val.section_templates.entries()) {
        const key = s.name.toLowerCase();
        if (seen.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['section_templates', i, 'name'],
            message: `Section name "${s.name}" is already used`,
          });
        } else {
          seen.set(key, i);
        }
      }
    }
    if (val.section_templates && val.task_list_templates) {
      const sectionNames = new Set(val.section_templates.map((s) => s.name));
      for (const [i, tl] of val.task_list_templates.entries()) {
        if (!sectionNames.has(tl.section)) {
          ctx.addIssue({
            code: 'custom',
            path: ['task_list_templates', i, 'section'],
            message: `Unknown section "${tl.section}"`,
          });
        }
      }
      const seenInSection = new Map<string, number>();
      for (const [i, tl] of val.task_list_templates.entries()) {
        const key = `${tl.section.toLowerCase()}::${tl.name.toLowerCase()}`;
        if (seenInSection.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['task_list_templates', i, 'name'],
            message: `Task item "${tl.name}" is already used in section "${tl.section}"`,
          });
        } else {
          seenInSection.set(key, i);
        }
      }
    }
    if (val.task_list_templates) {
      for (const [i, tl] of val.task_list_templates.entries()) {
        if (!tl.subtasks) continue;
        const seenSub = new Map<string, number>();
        for (const [j, st] of tl.subtasks.entries()) {
          const key = st.name.toLowerCase();
          if (seenSub.has(key)) {
            ctx.addIssue({
              code: 'custom',
              path: ['task_list_templates', i, 'subtasks', j, 'name'],
              message: `Subtask "${st.name}" is already used in this task item`,
            });
          } else {
            seenSub.set(key, j);
          }
        }
      }
    }
  });

const currentYear = new Date().getFullYear();

export const siteTrackerAssignSchema = z.object({
  tracker_category_id: z.string().uuid('tracker_category_id must be a UUID'),
  year: z
    .number()
    .int()
    .min(currentYear - 5, `Year must be ${currentYear - 5} or later`)
    .max(currentYear + 5, `Year must be ${currentYear + 5} or earlier`),
});

export const siteTrackerUpdateSchema = z.object({
  is_active: z.boolean().optional(),
});

export type SectionTemplate = z.infer<typeof sectionTemplateSchema>;
export type SubtaskTemplate = z.infer<typeof subtaskTemplateSchema>;
export type TaskListTemplate = z.infer<typeof taskListTemplateSchema>;
export type TrackerCategoryCreateInput = z.infer<typeof trackerCategoryCreateSchema>;
export type TrackerCategoryUpdateInput = z.infer<typeof trackerCategoryUpdateSchema>;
export type SiteTrackerAssignInput = z.infer<typeof siteTrackerAssignSchema>;
export type SiteTrackerUpdateInput = z.infer<typeof siteTrackerUpdateSchema>;
