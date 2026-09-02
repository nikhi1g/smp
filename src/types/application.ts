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

export const MaterialTypeEnum = z.enum([
  "Personal Statement",
  "Transcripts",
  "CV / Resume",
  "CASPer Score",
  "Secondary Essay",
  "Other",
]);

export type MaterialType = z.infer<typeof MaterialTypeEnum>;

export const MaterialStatusEnum = z.enum([
  "Not Started",
  "In Progress",
  "Complete",
  "Submitted",
  "Not Applicable",
]);

export type MaterialStatus = z.infer<typeof MaterialStatusEnum>;

export const MaterialItemSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1).default("Other"),
  name: z.string().min(1),
  status: z.string().min(1).default("Not Started"),
  source: z.string().optional().default(""),
  fileName: z.string().optional().default(""),
  url: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  submittedAt: z.string().optional().default(""),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type MaterialItem = z.infer<typeof MaterialItemSchema>;


export const LORStatusEnum = z.enum([
  "Not Requested",
  "Not requested",
  "Requested",
  "In Progress",
  "Follow-up needed",
  "Submitted",
  "Received",
  "Declined",
]);

export type LORStatus = z.infer<typeof LORStatusEnum>;

export const LetterTypeEnum = z.enum([
  "Individual",
  "Committee",
  "Academic",
  "Professional",
  "Other",
]);

export type LetterType = z.infer<typeof LetterTypeEnum>;

export const LORRequestSchema = z.object({
  id: z.string().min(1),
  recommenderName: z.string().min(1),
  institution: z.string().optional().default(""),
  relationship: z.string().optional().default(""),
  status: z.string().min(1).default("Not Requested"),
  letterType: z.string().optional().default("Individual"),
  submissionDate: z.string().optional().default(""),
  email: z.string().optional().default(""),
  waivedRights: z.boolean().default(false),
  confirmedReceipt: z.boolean().default(false),
  notes: z.string().optional().default(""),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type LORRequest = z.infer<typeof LORRequestSchema>;

export const ActionLogEntrySchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  description: z.string().optional().default(""),
  timestamp: z.string().default(() => new Date().toISOString()),
  metadata: z.record(z.string()).optional().default({}),
});

export type ActionLogEntry = z.infer<typeof ActionLogEntrySchema>;

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
  materials: z.array(MaterialItemSchema).default([]),
  lorRequests: z.array(LORRequestSchema).default([]),
  actionLog: z.array(ActionLogEntrySchema).default([]),
  notes: z.string().optional().default(""),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

type ParsedApplication = z.infer<typeof ApplicationSchema>;
export type Application = Omit<ParsedApplication, "materials" | "lorRequests" | "actionLog"> & {
  materials?: MaterialItem[];
  lorRequests?: LORRequest[];
  actionLog?: ActionLogEntry[];
};

export const ApplicationInputSchema = ApplicationSchema.omit({
  id: true,
  updatedAt: true,
}).extend({
  id: z.string().optional(),
});

type ParsedApplicationInput = z.infer<typeof ApplicationInputSchema>;
export type ApplicationInput = Omit<
  ParsedApplicationInput,
  "materials" | "lorRequests" | "actionLog"
> & {
  materials?: MaterialItem[];
  lorRequests?: LORRequest[];
  actionLog?: ActionLogEntry[];
};
