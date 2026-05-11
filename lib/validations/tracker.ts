import { z } from 'zod';
import { FREQUENCIES } from '@/lib/tracker.types';

// Template shapes stored as JSONB on tracker_categories.

export const sectionTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  order: z.number().int().min(0).max(999),
});

export const taskListTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  order: z.number().int().min(0).max(999),
  // Every task list belongs to a section (referenced by name). Sections are
  // now the structural primitive of a tracker category.
  section: z.string().trim().min(1).max(120),
});

export const trackerCategoryCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    frequency: z.enum(FREQUENCIES),
    // At least one section is required. Task lists nest under sections.
    section_templates: z
      .array(sectionTemplateSchema)
      .min(1, 'Add at least one section')
      .max(50),
    task_list_templates: z.array(taskListTemplateSchema).max(200),
  })
  .superRefine((val, ctx) => {
    // Section names must be unique within a category — otherwise the section
    // reference on a task list is ambiguous.
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
    // Every task list's section must reference an existing section.
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
export type TaskListTemplate = z.infer<typeof taskListTemplateSchema>;
export type TrackerCategoryCreateInput = z.infer<typeof trackerCategoryCreateSchema>;
export type TrackerCategoryUpdateInput = z.infer<typeof trackerCategoryUpdateSchema>;
export type SiteTrackerAssignInput = z.infer<typeof siteTrackerAssignSchema>;
export type SiteTrackerUpdateInput = z.infer<typeof siteTrackerUpdateSchema>;
