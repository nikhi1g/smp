import { z } from "zod";

export const StatusEnum = z.enum([
  "Researching",
  "In Progress",
  "Submitted",
  "Interview Offered",
  "Accepted",
  "Waitlisted",
  "Rejected",
]);

export type ApplicationStatus = z.infer<typeof StatusEnum>;

export const ApplicationSchema = z.object({
  id: z.string().min(1),
  programName: z.string().min(1, "Program name is required"),
  university: z.string().min(1, "University is required"),
  deadline: z.string().min(1, "Deadline is required"),
  status: StatusEnum.default("Researching"),
  portalUrl: z.string().optional().default(""),
  degreeType: z.string().default("MS / SMP"),
  gpaRequirement: z.string().optional().default(""),
  mcatRequirement: z.string().optional().default(""),
  appFee: z.string().optional().default(""),
  transcriptsSent: z.boolean().default(false),
  lorsRequested: z.boolean().default(false),
  essayCompleted: z.boolean().default(false),
  notes: z.string().optional().default(""),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type Application = z.infer<typeof ApplicationSchema>;

export const ApplicationInputSchema = ApplicationSchema.omit({
  id: true,
  updatedAt: true,
}).extend({
  id: z.string().optional(),
});

export type ApplicationInput = z.infer<typeof ApplicationInputSchema>;
