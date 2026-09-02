"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  GraduationCap,
  History,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UsersRound,
  X,
  HelpCircle,
} from "lucide-react";
import { OpenRouterLogo } from "@/components/OpenRouterLogo";
import {
  appendActionLog,
  deleteApplication,
  saveApplication,
  syncApplicationsWithResult,
  updateApplicationStatus,
  updateLORRequests,
  updateMaterials,
} from "@/lib/github-backend";
import { Application, ApplicationStatus } from "@/types/application";
import {
  MATERIAL_TYPES,
  MaterialItem,
  MaterialSource,
  MaterialStatus,
  MaterialType,
  MaterialsModal,
} from "@/components/MaterialsModal";
import {
  LORModal,
  LORRequest,
  LORStatus,
} from "@/components/LORModal";
import {
  ActionHistoryModal,
  ActionLogEntry,
} from "@/components/ActionHistoryModal";
import { requestProgramAutofill } from "@/lib/autofill";

const WORKFLOW_STEPS = ["Researching", "In Progress", "Submitted", "Interview", "Decision"] as const;
type WorkflowStatus = (typeof WORKFLOW_STEPS)[number];
type FilterStatus = "ALL" | WorkflowStatus | "Waitlisted" | "Rejected";
type ModalName = "materials" | "lors" | "history" | "details" | null;
type SortKey = "deadline" | "university" | "programName" | "status";
type SortDirection = "asc" | "desc";

export const ALL_APPLICATION_STATUSES: ApplicationStatus[] = [
  "Researching",
  "In Progress",
  "Submitted",
  "Interview Offered",
  "Accepted",
  "Waitlisted",
  "Rejected",
];

const FILTER_STATUSES: FilterStatus[] = [
  "ALL",
  "Researching",
  "In Progress",
  "Submitted",
  "Interview",
  "Decision",
  "Waitlisted",
  "Rejected",
];

const STATUS_COLORS: Record<string, string> = {
  Researching:
    "border-[#d0d7de] bg-[#f6f8fa] text-[#57606a] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#768390]",
  "In Progress":
    "border-[#0969da]/30 bg-[#ddf4ff] text-[#0969da] dark:border-[#539bf5]/40 dark:bg-[#1f3b53] dark:text-[#539bf5]",
  Submitted:
    "border-[#bf8700]/30 bg-[#fff8c5] text-[#9a6700] dark:border-[#d29922]/40 dark:bg-[#3b2f18] dark:text-[#d29922]",
  Interview:
    "border-[#8250df]/30 bg-[#fbefff] text-[#8250df] dark:border-[#dcbdfb]/35 dark:bg-[#35234f] dark:text-[#dcbdfb]",
  "Interview Offered":
    "border-[#8250df]/30 bg-[#fbefff] text-[#8250df] dark:border-[#dcbdfb]/35 dark:bg-[#35234f] dark:text-[#dcbdfb]",
  Decision:
    "border-[#1f883d]/30 bg-[#dafbe1] text-[#1f883d] dark:border-[#46954a]/40 dark:bg-[#1f3b2b] dark:text-[#56d364]",
  Accepted:
    "border-[#1f883d]/30 bg-[#dafbe1] text-[#1f883d] dark:border-[#46954a]/40 dark:bg-[#1f3b2b] dark:text-[#56d364]",
  Waitlisted:
    "border-[#bf8700]/30 bg-[#fff8c5] text-[#9a6700] dark:border-[#d29922]/40 dark:bg-[#3b2f18] dark:text-[#d29922]",
  Rejected:
    "border-[#cf222e]/30 bg-[#ffebe9] text-[#cf222e] dark:border-[#f47067]/40 dark:bg-[#3b1d22] dark:text-[#f47067]",
};

const STORAGE_PREFIXES = {
  materials: "smp-tracker:materials:",
  lors: "smp-tracker:lors:",
  history: "smp-tracker:history:",
} as const;

interface Props {
  initialApplications: Application[];
  source: "google_sheets" | "local_fallback";
}

interface ApplicationEditorProps {
  editingApp: Application | null;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (data: FormData) => Promise<void>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeMaterialType(value: unknown): MaterialType {
  const candidate = typeof value === "string" ? value : "";
  return MATERIAL_TYPES.includes(candidate as MaterialType)
    ? (candidate as MaterialType)
    : "Personal Statement";
}

function normalizeMaterialStatus(value: unknown): MaterialStatus {
  if (value === "Ready" || value === "Draft" || value === "Submitted") {
    return value;
  }
  return "Ready";
}

function normalizeMaterialSource(value: unknown): MaterialSource {
  if (value === "upload" || value === "link" || value === "text") {
    return value;
  }
  return "link";
}

function normalizeLORStatus(value: unknown): LORStatus {
  if (
    value === "Not requested" ||
    value === "Requested" ||
    value === "Follow-up needed" ||
    value === "Received"
  ) {
    return value;
  }
  return "Not requested";
}

function normalizeMaterials(value: unknown): MaterialItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    const record = asRecord(entry);
    if (!record) return [];
    const name = String(record.name ?? record.title ?? "").trim();
    if (!name) return [];
    return [{
      id: String(record.id ?? `material-${index}`),
      name,
      type: normalizeMaterialType(record.type),
      source: normalizeMaterialSource(record.source),
      url: typeof record.url === "string" ? record.url : undefined,
      content: typeof record.content === "string" ? record.content : undefined,
      fileName: typeof record.fileName === "string" ? record.fileName : undefined,
      status: normalizeMaterialStatus(record.status),
      notes: typeof record.notes === "string" ? record.notes : undefined,
      updatedAt: String(record.updatedAt ?? ""),
    }];
  });
}

function normalizeRequests(value: unknown): LORRequest[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    const record = asRecord(entry);
    if (!record) return [];
    const recommenderName = String(record.recommenderName ?? record.professor ?? record.name ?? "").trim();
    if (!recommenderName) return [];
    return [{
      id: String(record.id ?? `lor-${index}`),
      recommenderName,
      institution: typeof record.institution === "string" ? record.institution : undefined,
      relationship: typeof record.relationship === "string" ? record.relationship : undefined,
      letterType: typeof record.letterType === "string" ? record.letterType : undefined,
      status: normalizeLORStatus(record.status),
      email: typeof record.email === "string" ? record.email : undefined,
      submissionDate: typeof record.submissionDate === "string" ? record.submissionDate : undefined,
      waivedRights: Boolean(record.waivedRights ?? record.waived),
      confirmedReceipt: Boolean(record.confirmedReceipt ?? record.received),
      notes: typeof record.notes === "string" ? record.notes : undefined,
      updatedAt: String(record.updatedAt ?? ""),
    }];
  });
}

function normalizeHistory(value: unknown): ActionLogEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    const record = asRecord(entry);
    if (!record) return [];
    const action = String(record.action ?? record.type ?? "Application updated").trim();
    if (!action) return [];
    return [{
      id: String(record.id ?? `action-${index}`),
      action,
      description: typeof record.description === "string"
        ? record.description
        : typeof record.details === "string"
          ? record.details
          : undefined,
      timestamp: String(record.timestamp ?? record.createdAt ?? ""),
    }];
  });
}

function workflowStatus(status: string): WorkflowStatus {
  if (status === "Interview Offered") return "Interview";
  if (status === "Accepted" || status === "Waitlisted" || status === "Rejected") return "Decision";
  if (WORKFLOW_STEPS.includes(status as WorkflowStatus)) return status as WorkflowStatus;
  return "Researching";
}

function persistedStatus(status: WorkflowStatus): ApplicationStatus {
  if (status === "Interview") return "Interview Offered";
  if (status === "Decision") return "Accepted";
  return status as ApplicationStatus;
}

function nextWorkflowStatus(status: string): WorkflowStatus | null {
  const current = workflowStatus(status);
  const index = WORKFLOW_STEPS.indexOf(current);
  if (index < 0 || index === WORKFLOW_STEPS.length - 1) return null;
  return WORKFLOW_STEPS[index + 1];
}

function statusLabel(status: string): FilterStatus {
  if (status === "Waitlisted" || status === "Rejected") return status;
  return workflowStatus(status);
}

function ApplicationEditor({
  editingApp,
  isPending,
  onCancel,
  onSubmit,
}: ApplicationEditorProps) {
  const [formState, setFormState] = useState({
    programName: editingApp?.programName ?? "",
    university: editingApp?.university ?? "",
    status: editingApp?.status ?? "Researching",
    deadline: editingApp?.deadline ?? "",
    degreeType: editingApp?.degreeType ?? "",
    gpaRequirement: editingApp?.gpaRequirement ?? "",
    mcatRequirement: editingApp?.mcatRequirement ?? "",
    appFee: editingApp?.appFee ?? "",
    portalUrl: editingApp?.portalUrl ?? "",
    transcriptsSent: editingApp?.transcriptsSent ?? false,
    lorsRequested: editingApp?.lorsRequested ?? false,
    essayCompleted: editingApp?.essayCompleted ?? false,
    notes: editingApp?.notes ?? "",
  });

  const [isAutofilling, setIsAutofilling] = useState(false);
  const [autofillError, setAutofillError] = useState<string | null>(null);
  const [showOpenRouterInfo, setShowOpenRouterInfo] = useState(false);
  const handleAutofill = async () => {
    const query = [
      ["Program name", formState.programName],
      ["University", formState.university],
      ["Degree type", formState.degreeType],
      ["Portal URL", formState.portalUrl],
      ["Notes", formState.notes],
    ]
      .filter(([, value]) => value.trim())
      .map(([label, value]) => `${label}: ${value.trim()}`)
      .join("\n");
    if (!query) {
      setAutofillError("Please enter at least a program name, university, portal URL, or notes to autofill.");
      return;
    }
    setIsAutofilling(true);
    setAutofillError(null);

    try {
      const result = await requestProgramAutofill(query);
      setFormState((prev) => ({
        ...prev,
        programName: result.programName || prev.programName,
        university: result.university || prev.university,
        degreeType: result.degreeType || prev.degreeType,
        deadline: result.deadline || prev.deadline,
        gpaRequirement: result.gpaRequirement || prev.gpaRequirement,
        mcatRequirement: result.mcatRequirement || prev.mcatRequirement,
        appFee: result.appFee || prev.appFee,
        portalUrl: result.portalUrl || prev.portalUrl,
        notes: result.notes ? (prev.notes ? `${prev.notes}\n${result.notes}` : result.notes) : prev.notes,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Autofill failed";
      setAutofillError(msg);
    } finally {
      setIsAutofilling(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await onSubmit(data);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#24292f]/60 px-4 py-8 backdrop-blur-xs dark:bg-black/70 sm:items-center"
      role="presentation"
    >
      <section
        aria-labelledby="application-editor-title"
        aria-modal="true"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-[#d0d7de] bg-white text-[#24292f] shadow-2xl dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-[#d8dee4] px-5 py-4 dark:border-[#444c56] sm:px-6">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#57606a] dark:text-[#768390]">Program details</p>
            <h2 id="application-editor-title" className="text-lg font-semibold tracking-tight">{editingApp ? "Edit program" : "Add program"}</h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close program dialog" className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:text-[#768390] dark:hover:bg-[#2d333b] dark:hover:text-[#adbac7]"><X className="h-5 w-5" /></button>
        </header>
        <form onSubmit={handleSubmit} className="max-h-[76vh] space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          {editingApp && <input type="hidden" name="id" value={editingApp.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold">Program name *
              <input
                type="text"
                name="programName"
                required
                value={formState.programName}
                onChange={(e) => setFormState({ ...formState, programName: e.target.value })}
                placeholder="e.g. M.S. in Physiology"
                className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
              />
            </label>
            <label className="text-xs font-semibold">University *
              <input
                type="text"
                name="university"
                required
                value={formState.university}
                onChange={(e) => setFormState({ ...formState, university: e.target.value })}
                placeholder="e.g. Georgetown University"
                className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-semibold">Status
              <select
                name="status"
                value={formState.status}
                onChange={(e) => setFormState({ ...formState, status: e.target.value as ApplicationStatus })}
                className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
              >
                <option>Researching</option>
                <option>In Progress</option>
                <option>Submitted</option>
                <option>Interview Offered</option>
                <option>Accepted</option>
                <option>Waitlisted</option>
                <option>Rejected</option>
              </select>
            </label>
            <label className="text-xs font-semibold">Deadline *
              <input
                type="date"
                name="deadline"
                required
                value={formState.deadline}
                onChange={(e) => setFormState({ ...formState, deadline: e.target.value })}
                className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
              />
            </label>
            <label className="text-xs font-semibold">Degree type
              <input
                type="text"
                name="degreeType"
                value={formState.degreeType}
                placeholder="e.g. Master of Science"
                onChange={(e) => setFormState({ ...formState, degreeType: e.target.value })}
                className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-semibold">GPA requirement
              <input
                type="text"
                name="gpaRequirement"
                value={formState.gpaRequirement}
                onChange={(e) => setFormState({ ...formState, gpaRequirement: e.target.value })}
                placeholder="3.0+"
                className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
              />
            </label>
            <label className="text-xs font-semibold">MCAT requirement
              <input
                type="text"
                name="mcatRequirement"
                value={formState.mcatRequirement}
                onChange={(e) => setFormState({ ...formState, mcatRequirement: e.target.value })}
                placeholder="500+"
                className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
              />
            </label>
            <label className="text-xs font-semibold">Application fee
              <input
                type="text"
                name="appFee"
                value={formState.appFee}
                onChange={(e) => setFormState({ ...formState, appFee: e.target.value })}
                placeholder="$80"
                className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
              />
            </label>
          </div>
          <label className="block text-xs font-semibold">Application portal URL
            <input
              type="url"
              name="portalUrl"
              value={formState.portalUrl}
              onChange={(e) => setFormState({ ...formState, portalUrl: e.target.value })}
              placeholder="https://..."
              className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
            />
          </label>
          <fieldset className="rounded-lg border border-[#d8dee4] bg-[#f6f8fa]/70 p-3 dark:border-[#444c56] dark:bg-[#2d333b]/55">
            <legend className="px-1 text-xs font-semibold">Requirement checklist</legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  name="transcriptsSent"
                  checked={formState.transcriptsSent}
                  onChange={(e) => setFormState({ ...formState, transcriptsSent: e.target.checked })}
                  className="rounded border-[#8c959f] text-[#0969da] focus:ring-[#0969da]"
                /> Transcripts sent
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  name="lorsRequested"
                  checked={formState.lorsRequested}
                  onChange={(e) => setFormState({ ...formState, lorsRequested: e.target.checked })}
                  className="rounded border-[#8c959f] text-[#0969da] focus:ring-[#0969da]"
                /> LORs requested
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  name="essayCompleted"
                  checked={formState.essayCompleted}
                  onChange={(e) => setFormState({ ...formState, essayCompleted: e.target.checked })}
                  className="rounded border-[#8c959f] text-[#0969da] focus:ring-[#0969da]"
                /> Essay completed
              </label>
            </div>
          </fieldset>
          <label className="block text-xs font-semibold">Notes
            <textarea
              name="notes"
              rows={3}
              value={formState.notes}
              onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
              placeholder="Linkage terms, committee letter deadlines, interview impressions..."
              className="mt-1.5 block w-full resize-y rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
            />
          </label>

          {autofillError && (
            <div className="rounded-md border border-[#cf222e]/40 bg-[#ffebe9] p-2.5 text-xs text-[#cf222e] dark:border-[#f47067]/40 dark:bg-[#3b2225] dark:text-[#f47067]">
              {autofillError}
            </div>
          )}

          <footer className="relative flex flex-wrap items-center justify-between gap-3 border-t border-[#d8dee4] pt-4 dark:border-[#444c56]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutofill}
                disabled={isAutofilling}
                className="inline-flex items-center gap-2 rounded-md border border-[#0969da]/30 bg-[#ddf4ff] px-3 py-2 text-xs font-semibold text-[#0969da] transition hover:bg-[#b6e3ff] focus:outline-none focus:ring-2 focus:ring-[#0969da] disabled:opacity-50 dark:border-[#539bf5]/40 dark:bg-[#1f3b53] dark:text-[#539bf5] dark:hover:bg-[#294c6b]"
                title="Autofill program details"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isAutofilling ? "Autofilling..." : "Autofill"}</span>
                <OpenRouterLogo className="h-3.5 w-3.5 opacity-80" />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowOpenRouterInfo(!showOpenRouterInfo)}
                  aria-label="What is OpenRouter?"
                  className="rounded-full p-1 text-[#57606a] hover:bg-[#f6f8fa] hover:text-[#24292f] dark:text-[#768390] dark:hover:bg-[#2d333b] dark:hover:text-[#adbac7] transition focus:outline-none"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>

                {showOpenRouterInfo && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border border-[#d0d7de] bg-white p-3 text-xs text-[#24292f] shadow-xl dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7] z-50">
                    <div className="flex items-center justify-between font-semibold border-b border-[#d8dee4] dark:border-[#444c56] pb-1.5 mb-1.5">
                      <span>OpenRouter Inference</span>
                      <button
                        type="button"
                        onClick={() => setShowOpenRouterInfo(false)}
                        className="text-[#57606a] dark:text-[#768390] hover:text-[#24292f] dark:hover:text-[#adbac7]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="leading-relaxed text-[#57606a] dark:text-[#768390]">
                      OpenRouter routes structured JSON queries to high-intelligence models (e.g. DeepSeek V4 Flash) to verify admissions requirements, GPA/MCAT cutoffs, and deadlines for your target program.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={onCancel} className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold text-[#24292f] transition hover:bg-[#f6f8fa] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7] dark:hover:bg-[#373e47]">Cancel</button>
              <button type="submit" disabled={isPending} className="inline-flex items-center gap-2 rounded-md bg-[#0969da] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#0860ca] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#539bf5] dark:text-[#0d1117] dark:hover:bg-[#6cb6ff]">
                {isPending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-[#0d1117]/30 dark:border-t-[#0d1117]" />}
                {isPending ? "Saving..." : editingApp ? "Save changes" : "Add program"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
export type ProgramTypeTag = "MD" | "DO" | "SMP" | "Post-Bacc" | "MS" | "Cert";

export function detectProgramType(degreeType?: string, programName?: string): ProgramTypeTag {
  const text = `${degreeType || ""} ${programName || ""}`.toLowerCase();

  if (/\bmd\b/.test(text) || text.includes("doctor of medicine") || text.includes("allopathic")) {
    if (!text.includes("smp") && !text.includes("master") && !text.includes("post-bacc") && !text.includes("postbacc")) {
      return "MD";
    }
  }

  if (/\bdo\b/.test(text) || text.includes("osteopathic") || text.includes("doctor of osteopath")) {
    if (!text.includes("smp") && !text.includes("master") && !text.includes("post-bacc") && !text.includes("postbacc")) {
      return "DO";
    }
  }

  if (
    /\bsmp\b/.test(text) ||
    text.includes("special master") ||
    text.includes("specialized master") ||
    text.includes("medical science") ||
    text.includes("biomedical science") ||
    text.includes("physiology")
  ) {
    return "SMP";
  }

  if (
    text.includes("post-bacc") ||
    text.includes("postbacc") ||
    text.includes("post-baccalaureate") ||
    text.includes("postbaccalaureate") ||
    text.includes("pre-med certificate")
  ) {
    return "Post-Bacc";
  }

  if (/\bms\b/.test(text) || /\bm\.s\.\b/.test(text) || text.includes("master") || text.includes("m.s.")) {
    return "MS";
  }

  if (text.includes("cert")) {
    return "Cert";
  }

  if (degreeType) {
    const upper = degreeType.toUpperCase();
    if (upper.includes("MD")) return "MD";
    if (upper.includes("DO")) return "DO";
    if (upper.includes("SMP")) return "SMP";
    if (upper.includes("POST")) return "Post-Bacc";
    if (upper.includes("MS")) return "MS";
  }

  return "MS";
}

const PROGRAM_TAG_STYLES: Record<ProgramTypeTag, { label: string; badge: string }> = {
  MD: {
    label: "MD",
    badge: "border-[#8250df]/35 bg-[#fbefff] text-[#8250df] dark:border-[#dcbdfb]/40 dark:bg-[#35234f] dark:text-[#dcbdfb]",
  },
  DO: {
    label: "DO",
    badge: "border-[#0969da]/35 bg-[#ddf4ff] text-[#0969da] dark:border-[#539bf5]/40 dark:bg-[#1f3b53] dark:text-[#79c0ff]",
  },
  SMP: {
    label: "SMP",
    badge: "border-[#1f883d]/35 bg-[#dafbe1] text-[#1a7f37] dark:border-[#46954a]/40 dark:bg-[#1f3b2b] dark:text-[#56d364]",
  },
  "Post-Bacc": {
    label: "Post-Bacc",
    badge: "border-[#bf8700]/35 bg-[#fff8c5] text-[#9a6700] dark:border-[#d29922]/40 dark:bg-[#3b2f18] dark:text-[#d29922]",
  },
  MS: {
    label: "MS",
    badge: "border-[#0969da]/25 bg-[#f0f6fc] text-[#0969da] dark:border-[#539bf5]/30 dark:bg-[#1c2128] dark:text-[#539bf5]",
  },
  Cert: {
    label: "Cert",
    badge: "border-[#6e7781]/30 bg-[#f6f8fa] text-[#57606a] dark:border-[#768390]/40 dark:bg-[#2d333b] dark:text-[#adbac7]",
  },
};

function formatDeadline(deadline: string): { label: string; isUrgent: boolean; isPast: boolean } {
  if (!deadline) {
    return { label: "TBD", isUrgent: false, isPast: false };
  }
  const date = new Date(deadline);
  if (isNaN(date.getTime())) {
    return { label: deadline, isUrgent: false, isPast: false };
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

  if (diffDays < 0) {
    return { label: `${formatted} (Passed)`, isUrgent: false, isPast: true };
  }
  if (diffDays === 0) {
    return { label: `${formatted} (Today)`, isUrgent: true, isPast: false };
  }
  if (diffDays <= 7) {
    return { label: `${formatted} (in ${diffDays}d)`, isUrgent: true, isPast: false };
  }
  if (diffDays <= 30) {
    return { label: `${formatted} (in ${diffDays}d)`, isUrgent: false, isPast: false };
  }
  return { label: formatted, isUrgent: false, isPast: false };
}

function SearchHighlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const q = query.trim();
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={index}
            className="rounded-xs bg-[#fff8c5] font-semibold text-[#24292f] dark:bg-[#6e4000]/70 dark:text-[#f0883e]"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

interface ApplicationDetailsModalProps {
  isOpen: boolean;
  application: Application;
  materials: MaterialItem[];
  lors: LORRequest[];
  history: ActionLogEntry[];
  onClose: () => void;
  onEdit: (app: Application) => void;
  onDelete: (id: string) => void;
  onOpenMaterials: () => void;
  onOpenLORs: () => void;
  onOpenHistory: () => void;
  onStatusChange: (status: ApplicationStatus) => void;
  onCopyPortalUrl: (url: string) => void;
  isCopied: boolean;
  isPendingStatus?: boolean;
}

function ApplicationDetailsModal({
  isOpen,
  application,
  materials,
  lors,
  history,
  onClose,
  onEdit,
  onDelete,
  onOpenMaterials,
  onOpenLORs,
  onOpenHistory,
  onStatusChange,
  onCopyPortalUrl,
  isCopied,
  isPendingStatus,
}: ApplicationDetailsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const programTag = detectProgramType(application.degreeType, application.programName);
  const tagStyle = PROGRAM_TAG_STYLES[programTag];
  const deadlineInfo = formatDeadline(application.deadline);

  const checklist = {
    transcripts:
      application.transcriptsSent || materials.some((m) => m.type === "Transcript"),
    lors:
      application.lorsRequested ||
      lors.some((r) => r.status !== "Not requested"),
    essays:
      application.essayCompleted ||
      materials.some(
        (m) => m.type === "Personal Statement" || m.type === "Essay Draft"
      ),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#24292f]/60 px-4 py-8 backdrop-blur-xs dark:bg-black/70 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="details-modal-title"
        aria-modal="true"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-[#d0d7de] bg-white text-[#24292f] shadow-2xl dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-[#d8dee4] px-5 py-4 dark:border-[#444c56] sm:px-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-md bg-[#f6f8fa] p-2 text-[#57606a] dark:bg-[#2d333b] dark:text-[#768390]">
              <GraduationCap className="h-5 w-5 text-[#0969da] dark:text-[#539bf5]" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${tagStyle.badge}`}
                >
                  {tagStyle.label}
                </span>
                <div className="relative inline-block">
                  <select
                    aria-label={`Change stage for ${application.programName}`}
                    value={application.status}
                    disabled={isPendingStatus}
                    onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
                    className={`cursor-pointer appearance-none rounded-md border py-1 pl-2.5 pr-6 text-xs font-semibold shadow-xs outline-none transition focus:ring-2 focus:ring-[#0969da] disabled:cursor-not-allowed disabled:opacity-50 ${
                      STATUS_COLORS[application.status] ?? STATUS_COLORS.Researching
                    }`}
                  >
                    {ALL_APPLICATION_STATUSES.map((status) => (
                      <option
                        key={status}
                        value={status}
                        className="bg-white text-[#24292f] dark:bg-[#22272e] dark:text-[#adbac7]"
                      >
                        {status}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" />
                </div>
              </div>
              <h2 id="details-modal-title" className="mt-1 text-xl font-bold tracking-tight">
                {application.programName}
              </h2>
              <p className="mt-0.5 text-sm font-medium text-[#57606a] dark:text-[#768390]">
                {application.university} {application.degreeType && `· ${application.degreeType}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details dialog"
            className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:text-[#768390] dark:hover:bg-[#2d333b] dark:hover:text-[#adbac7]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {application.portalUrl && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d0d7de] bg-[#f6f8fa] p-3 dark:border-[#444c56] dark:bg-[#2d333b]/60">
              <div className="flex min-w-0 items-center gap-2">
                <ExternalLink className="h-4 w-4 shrink-0 text-[#0969da] dark:text-[#539bf5]" />
                <span className="shrink-0 text-xs font-semibold text-[#57606a] dark:text-[#768390]">
                  Portal:
                </span>
                <a
                  href={application.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-mono text-xs text-[#0969da] hover:underline dark:text-[#539bf5]"
                >
                  {application.portalUrl}
                </a>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCopyPortalUrl(application.portalUrl)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-2.5 py-1 text-xs font-semibold text-[#24292f] shadow-xs transition hover:bg-[#f6f8fa] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:bg-[#2d333b]"
                >
                  {isCopied ? (
                    <Check className="h-3.5 w-3.5 text-[#1f883d] dark:text-[#56d364]" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {isCopied ? "Copied" : "Copy Link"}
                </button>
                <a
                  href={application.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#0969da] px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0860ca] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:bg-[#539bf5] dark:text-[#0d1117] dark:hover:bg-[#6cb6ff]"
                >
                  Open Portal
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[#d0d7de] bg-white p-3.5 dark:border-[#444c56] dark:bg-[#22272e]">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#57606a] dark:text-[#768390]">
                <Calendar className="h-3.5 w-3.5" />
                Deadline
              </div>
              <p
                className={`mt-1.5 text-sm font-semibold ${
                  deadlineInfo.isUrgent
                    ? "text-[#cf222e] dark:text-[#f47067]"
                    : deadlineInfo.isPast
                    ? "text-[#8c959f] dark:text-[#636e7b]"
                    : "text-[#24292f] dark:text-[#adbac7]"
                }`}
              >
                {deadlineInfo.label}
              </p>
            </div>

            <div className="rounded-lg border border-[#d0d7de] bg-white p-3.5 dark:border-[#444c56] dark:bg-[#22272e]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#57606a] dark:text-[#768390]">
                Requirements
              </p>
              <div className="mt-1.5 space-y-0.5 text-xs text-[#57606a] dark:text-[#768390]">
                <p>GPA: <span className="font-semibold text-[#24292f] dark:text-[#adbac7]">{application.gpaRequirement || "None"}</span></p>
                <p>MCAT: <span className="font-semibold text-[#24292f] dark:text-[#adbac7]">{application.mcatRequirement || "None"}</span></p>
                {application.appFee && <p>Fee: <span className="font-semibold text-[#24292f] dark:text-[#adbac7]">{application.appFee}</span></p>}
              </div>
            </div>

            <div className="rounded-lg border border-[#d0d7de] bg-white p-3.5 dark:border-[#444c56] dark:bg-[#22272e]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#57606a] dark:text-[#768390]">
                Checklist
              </p>
              <div className="mt-1.5 space-y-1 text-xs">
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    checklist.transcripts
                      ? "text-[#1f883d] dark:text-[#56d364]"
                      : "text-[#8c959f] dark:text-[#636e7b]"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Transcripts {checklist.transcripts ? "sent" : "pending"}
                </span>
                <br />
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    checklist.lors
                      ? "text-[#1f883d] dark:text-[#56d364]"
                      : "text-[#8c959f] dark:text-[#636e7b]"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  LORs {checklist.lors ? "in motion" : "pending"}
                </span>
                <br />
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    checklist.essays
                      ? "text-[#1f883d] dark:text-[#56d364]"
                      : "text-[#8c959f] dark:text-[#636e7b]"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Essays {checklist.essays ? "completed" : "pending"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[#d0d7de] bg-[#f6f8fa]/60 p-4 dark:border-[#444c56] dark:bg-[#2d333b]/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-[#8250df] dark:text-[#dcbdfb]" />
                  <h3 className="text-sm font-semibold">Materials</h3>
                </div>
                <span className="rounded-full bg-[#f6f8fa] px-2 py-0.5 text-xs font-semibold text-[#57606a] dark:bg-[#2d333b] dark:text-[#adbac7]">
                  {materials.length} {materials.length === 1 ? "item" : "items"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#57606a] dark:text-[#768390]">
                Essays, transcripts, personal statements, and supplementary documents.
              </p>
              <button
                type="button"
                onClick={onOpenMaterials}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0969da] shadow-xs transition hover:bg-[#ddf4ff] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#539bf5] dark:hover:bg-[#1f3b53]"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Manage Materials
              </button>
            </div>

            <div className="rounded-lg border border-[#d0d7de] bg-[#f6f8fa]/60 p-4 dark:border-[#444c56] dark:bg-[#2d333b]/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UsersRound className="h-4 w-4 text-[#0969da] dark:text-[#539bf5]" />
                  <h3 className="text-sm font-semibold">Letters of Rec</h3>
                </div>
                <span className="rounded-full bg-[#f6f8fa] px-2 py-0.5 text-xs font-semibold text-[#57606a] dark:bg-[#2d333b] dark:text-[#adbac7]">
                  {lors.length} {lors.length === 1 ? "request" : "requests"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#57606a] dark:text-[#768390]">
                Recommender contacts, request status, deadlines, and submission tracking.
              </p>
              <button
                type="button"
                onClick={onOpenLORs}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0969da] shadow-xs transition hover:bg-[#ddf4ff] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#539bf5] dark:hover:bg-[#1f3b53]"
              >
                <UsersRound className="h-3.5 w-3.5" />
                Manage LORs
              </button>
            </div>
          </div>

          {application.notes && (
            <div className="rounded-lg border border-[#d0d7de] bg-[#f6f8fa]/40 p-4 dark:border-[#444c56] dark:bg-[#2d333b]/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#57606a] dark:text-[#768390]">
                Notes &amp; Strategy
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-[#24292f] dark:text-[#adbac7]">
                {application.notes}
              </p>
            </div>
          )}

          <div className="rounded-lg border border-[#d0d7de] p-4 dark:border-[#444c56]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[#57606a] dark:text-[#768390]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#57606a] dark:text-[#768390]">
                  Recent Activity
                </h3>
              </div>
              <button
                type="button"
                onClick={onOpenHistory}
                className="text-xs font-semibold text-[#0969da] hover:underline dark:text-[#539bf5]"
              >
                View timeline ({history.length})
              </button>
            </div>
            {history.length === 0 ? (
              <p className="mt-2 text-xs italic text-[#57606a] dark:text-[#768390]">
                No recent changes recorded yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs text-[#57606a] dark:text-[#768390]">
                {history.slice(-2).reverse().map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0969da] dark:bg-[#539bf5]" />
                    <span className="font-semibold text-[#24292f] dark:text-[#adbac7]">
                      {entry.action}
                    </span>
                    {entry.description && <span>— {entry.description}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d8dee4] px-5 py-4 dark:border-[#444c56] sm:px-6">
          <button
            type="button"
            onClick={() => onDelete(application.id)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-[#cf222e] transition hover:bg-[#ffebe9] dark:text-[#f47067] dark:hover:bg-[#3b1d22]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete program
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(application)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-xs font-semibold text-[#24292f] shadow-xs transition hover:bg-[#f6f8fa] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7] dark:hover:bg-[#373e47]"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit program
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-[#24292f] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#32383f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:bg-[#373e47] dark:text-[#adbac7] dark:hover:bg-[#444c56]"
            >
              Done
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function TrackerDashboard({ initialApplications, source }: Props) {
  const [applications, setApplications] = useState<Application[]>(initialApplications);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("deadline");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeApplication, setActiveApplication] = useState<Application | null>(null);
  const [activeModal, setActiveModal] = useState<ModalName>(null);
  const [materialsByApp, setMaterialsByApp] = useState<Record<string, MaterialItem[]>>({});
  const [lorsByApp, setLorsByApp] = useState<Record<string, LORRequest[]>>({});
  const [historyByApp, setHistoryByApp] = useState<Record<string, ActionLogEntry[]>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isGithubSynced, setIsGithubSynced] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        const input = document.getElementById("search-applications-input");
        input?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadHydration() {
      const syncResult = await syncApplicationsWithResult();
      if (!isMounted) return;

      if (syncResult.applications.length > 0) {
        setApplications(syncResult.applications);
      }
      setIsGithubSynced(syncResult.source === "github");

      if (typeof window !== "undefined") {
        const nextMaterials: Record<string, MaterialItem[]> = {};
        const nextLors: Record<string, LORRequest[]> = {};
        const nextHistory: Record<string, ActionLogEntry[]> = {};

        syncResult.applications.forEach((app) => {
          try {
            const rawMat = localStorage.getItem(`${STORAGE_PREFIXES.materials}${app.id}`);
            if (rawMat) nextMaterials[app.id] = normalizeMaterials(JSON.parse(rawMat));

            const rawLor = localStorage.getItem(`${STORAGE_PREFIXES.lors}${app.id}`);
            if (rawLor) nextLors[app.id] = normalizeRequests(JSON.parse(rawLor));

            const rawHist = localStorage.getItem(`${STORAGE_PREFIXES.history}${app.id}`);
            if (rawHist) nextHistory[app.id] = normalizeHistory(JSON.parse(rawHist));
          } catch {
            // Ignore parse errors
          }
        });

        setMaterialsByApp(nextMaterials);
        setLorsByApp(nextLors);
        setHistoryByApp(nextHistory);
      }
    }

    loadHydration();

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const total = applications.length;
    const active = applications.filter(
      (app) => app.status === "In Progress" || app.status === "Interview Offered"
    ).length;
    const submitted = applications.filter((app) => app.status === "Submitted").length;
    const materials = Object.values(materialsByApp).reduce(
      (sum, items) => sum + items.length,
      0
    );

    return { total, active, submitted, materials };
  }, [applications, materialsByApp]);

  const filteredApps = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return applications.filter((app) => {
      const matchesStatus =
        filterStatus === "ALL"
          ? true
          : statusLabel(app.status) === filterStatus || app.status === filterStatus;

      const matchesSearch =
        !query ||
        app.programName.toLowerCase().includes(query) ||
        app.university.toLowerCase().includes(query) ||
        app.status.toLowerCase().includes(query) ||
        app.degreeType.toLowerCase().includes(query) ||
        (app.notes && app.notes.toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [applications, filterStatus, searchQuery]);

  const sortedApps = useMemo(() => {
    return [...filteredApps].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "deadline") {
        const timeA = a.deadline ? new Date(a.deadline).getTime() : NaN;
        const timeB = b.deadline ? new Date(b.deadline).getTime() : NaN;
        const validA = !isNaN(timeA);
        const validB = !isNaN(timeB);
        if (validA && validB) {
          cmp = timeA - timeB;
        } else if (validA) {
          cmp = -1;
        } else if (validB) {
          cmp = 1;
        } else {
          cmp = (a.deadline || "").localeCompare(b.deadline || "");
        }
      } else if (sortKey === "university") {
        cmp = a.university.localeCompare(b.university);
      } else if (sortKey === "programName") {
        cmp = a.programName.localeCompare(b.programName);
      } else if (sortKey === "status") {
        const stageOrder: Record<string, number> = {
          "Researching": 1,
          "In Progress": 2,
          "Submitted": 3,
          "Interview Offered": 4,
          "Accepted": 5,
          "Waitlisted": 6,
          "Rejected": 7,
        };
        const orderA = stageOrder[a.status] ?? 99;
        const orderB = stageOrder[b.status] ?? 99;
        cmp = orderA - orderB;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filteredApps, sortKey, sortDirection]);

  const handleSortToggle = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const handleOpenAdd = () => {
    setEditingApp(null);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (app: Application) => {
    setEditingApp(app);
    setIsEditorOpen(true);
  };

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleCopyPortalUrl = async (appId: string, url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedAppId(appId);
      showNotice("Portal link copied to clipboard");
      setTimeout(() => {
        setCopiedAppId((current) => (current === appId ? null : current));
      }, 2000);
    } catch {
      showNotice("Failed to copy link");
    }
  };

  const handleQuickStatusChange = async (appId: string, newStatus: ApplicationStatus) => {
    setPendingAction(`status:${appId}`);
    try {
      await updateApplicationStatus(appId, newStatus);

      setApplications((prev) =>
        prev.map((app) =>
          app.id === appId
            ? { ...app, status: newStatus, updatedAt: new Date().toISOString() }
            : app
        )
      );

      if (activeApplication && activeApplication.id === appId) {
        setActiveApplication((prev) =>
          prev ? { ...prev, status: newStatus, updatedAt: new Date().toISOString() } : null
        );
      }

      showNotice(`Stage updated to ${newStatus}`);
    } catch {
      showNotice("Could not update status");
    } finally {
      setPendingAction(null);
    }
  };

  const handleApplicationSubmit = async (formData: FormData) => {
    setPendingAction("application");
    try {
      const isEdit = Boolean(formData.get("id"));
      const appId = isEdit ? String(formData.get("id")) : `smp-${Date.now()}`;

      const updated: Application = {
        id: appId,
        programName: String(formData.get("programName") || "").trim(),
        university: String(formData.get("university") || "").trim(),
        status: (formData.get("status") || "Researching") as ApplicationStatus,
        deadline: String(formData.get("deadline") || "").trim(),
        degreeType: String(formData.get("degreeType") || "MS / SMP").trim(),
        gpaRequirement: String(formData.get("gpaRequirement") || "").trim(),
        mcatRequirement: String(formData.get("mcatRequirement") || "").trim(),
        appFee: String(formData.get("appFee") || "").trim(),
        portalUrl: String(formData.get("portalUrl") || "").trim(),
        transcriptsSent: formData.get("transcriptsSent") === "on",
        lorsRequested: formData.get("lorsRequested") === "on",
        essayCompleted: formData.get("essayCompleted") === "on",
        notes: String(formData.get("notes") || "").trim(),
        updatedAt: new Date().toISOString(),
      };

      await saveApplication(updated);

      setApplications((prev) => {
        const idx = prev.findIndex((a) => a.id === appId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [updated, ...prev];
      });

      setIsEditorOpen(false);
      setEditingApp(null);
      showNotice(isEdit ? "Program updated" : "Program added to pipeline");
    } finally {
      setPendingAction(null);
    }
  };

  const handleAdvanceStatus = async (application: Application) => {
    const next = nextWorkflowStatus(application.status);
    if (!next) return;

    setPendingAction(`advance:${application.id}`);
    try {
      const newStatus = persistedStatus(next);
      await updateApplicationStatus(application.id, newStatus);

      setApplications((prev) =>
        prev.map((app) =>
          app.id === application.id
            ? { ...app, status: newStatus, updatedAt: new Date().toISOString() }
            : app
        )
      );

      showNotice(`Advanced to ${next}`);
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this program?")) return;
    setPendingAction(`delete:${id}`);
    try {
      await deleteApplication(id);
      setApplications((prev) => prev.filter((a) => a.id !== id));
      if (activeApplication?.id === id) {
        closeModal();
      }
      showNotice("Program removed");
    } finally {
      setPendingAction(null);
    }
  };

  const openModal = (app: Application, modal: ModalName) => {
    setActiveApplication(app);
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveApplication(null);
    setActiveModal(null);
  };

  const materialsFor = (app: Application) => materialsByApp[app.id] || [];
  const lorsFor = (app: Application) => lorsByApp[app.id] || [];
  const historyFor = (app: Application) => historyByApp[app.id] || [];

  const handleMaterialsSave = (items: MaterialItem[]) => {
    if (!activeApplication) return;
    const appId = activeApplication.id;
    setMaterialsByApp((prev) => ({ ...prev, [appId]: items }));
    const payload = items.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      status: item.status,
      source: item.source,
      fileName: item.fileName || "",
      url: item.url || "",
      notes: item.notes || "",
      submittedAt: item.status === "Submitted" ? new Date().toISOString() : "",
      updatedAt: item.updatedAt || new Date().toISOString(),
    }));
    updateMaterials(appId, payload);
  };

  const handleLORSave = (items: LORRequest[]) => {
    if (!activeApplication) return;
    const appId = activeApplication.id;
    setLorsByApp((prev) => ({ ...prev, [appId]: items }));
    const payload = items.map((item) => ({
      id: item.id,
      recommenderName: item.recommenderName,
      institution: item.institution || "",
      relationship: item.relationship || "",
      letterType: item.letterType || "",
      status: item.status,
      email: item.email || "",
      submissionDate: item.submissionDate || "",
      waivedRights: Boolean(item.waivedRights),
      confirmedReceipt: Boolean(item.confirmedReceipt),
      notes: item.notes || "",
      updatedAt: item.updatedAt || new Date().toISOString(),
    }));
    updateLORRequests(appId, payload);
  };

  const handleHistoryClear = () => {
    if (!activeApplication) return;
    const appId = activeApplication.id;
    setHistoryByApp((prev) => ({ ...prev, [appId]: [] }));
    localStorage.removeItem(`${STORAGE_PREFIXES.history}${appId}`);
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-[#8c959f]/60 dark:text-[#636e7b]/60" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-[#0969da] dark:text-[#539bf5]" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-[#0969da] dark:text-[#539bf5]" />
    );
  };

  return (
    <div className="min-h-screen bg-white text-[#24292f] dark:bg-[#22272e] dark:text-[#adbac7]">
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-[#d8dee4] pb-6 dark:border-[#444c56] md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Admissions &amp; Programs Tracker
              </h1>
              {(isGithubSynced || source === "google_sheets") && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#1f883d]/30 bg-[#dafbe1] px-2 py-1 text-[11px] font-semibold text-[#1f883d] dark:border-[#46954a]/40 dark:bg-[#1f3b2b] dark:text-[#56d364]">
                  <Database className="h-3.5 w-3.5" />
                  {isGithubSynced ? "GitHub synced" : "Google Sheets connected"}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0969da] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#0860ca] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:ring-offset-2 dark:bg-[#539bf5] dark:text-[#0d1117] dark:hover:bg-[#6cb6ff]"
            >
              <Plus className="h-4 w-4" />
              Add program
            </button>
          </div>
        </header>

        <section
          aria-label="Application metrics"
          className="grid grid-cols-2 border-b border-[#d8dee4] dark:border-[#444c56] sm:grid-cols-4"
        >
          <div className="border-r border-[#d8dee4] py-5 pr-4 dark:border-[#444c56] sm:pr-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#57606a] dark:text-[#768390]">
              Tracked
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.total}</p>
          </div>
          <div className="border-b border-[#d8dee4] py-5 pl-4 dark:border-[#444c56] sm:border-b-0 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#57606a] dark:text-[#768390]">
              Active
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#0969da] dark:text-[#539bf5]">
              {stats.active}
            </p>
          </div>
          <div className="border-r border-[#d8dee4] py-5 pr-4 dark:border-[#444c56] sm:border-l sm:px-6 sm:pr-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#57606a] dark:text-[#768390]">
              Submitted
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#9a6700] dark:text-[#d29922]">
              {stats.submitted}
            </p>
          </div>
          <div className="py-5 pl-4 sm:pl-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#57606a] dark:text-[#768390]">
              Materials saved
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#8250df] dark:text-[#dcbdfb]">
              {stats.materials}
            </p>
          </div>
        </section>

        <section
          aria-label="Search and filters"
          className="flex flex-col gap-3 border-b border-[#d8dee4] py-5 dark:border-[#444c56] xl:flex-row xl:items-center xl:justify-between"
        >
          <div className="flex flex-1 flex-col gap-2.5 sm:flex-row sm:items-center">
            <label className="relative block max-w-xl flex-1">
              <span className="sr-only">Search applications</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c959f] dark:text-[#636e7b]" />
              <input
                id="search-applications-input"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by program, university, degree, or notes..."
                className="block w-full rounded-md border border-[#d0d7de] bg-white py-2 pl-9 pr-9 text-sm text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#8c959f] hover:text-[#24292f] dark:text-[#636e7b] dark:hover:text-[#adbac7]"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>

            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <span className="flex items-center gap-1 text-xs font-semibold text-[#57606a] dark:text-[#768390]">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Sort:
              </span>
              <select
                value={`${sortKey}-${sortDirection}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split("-") as [SortKey, SortDirection];
                  setSortKey(k);
                  setSortDirection(d);
                }}
                aria-label="Sort applications"
                className="cursor-pointer rounded-md border border-[#d0d7de] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#24292f] shadow-xs outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7]"
              >
                <option value="deadline-asc">Deadline (Earliest first)</option>
                <option value="deadline-desc">Deadline (Latest first)</option>
                <option value="university-asc">University (A–Z)</option>
                <option value="university-desc">University (Z–A)</option>
                <option value="programName-asc">Program Name (A–Z)</option>
                <option value="programName-desc">Program Name (Z–A)</option>
                <option value="status-asc">Status (Pipeline order)</option>
                <option value="status-desc">Status (Reverse pipeline)</option>
              </select>
            </div>
          </div>

          <div
            className="flex items-center gap-1.5 overflow-x-auto rounded-lg border border-[#d0d7de] bg-[#f6f8fa] p-1 dark:border-[#444c56] dark:bg-[#22272e]"
            role="tablist"
            aria-label="Application status filters"
          >
            {FILTER_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={filterStatus === status}
                onClick={() => setFilterStatus(status)}
                className={`shrink-0 select-none rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  filterStatus === status
                    ? "border border-[#d0d7de] bg-white text-[#0969da] shadow-xs dark:border-[#539bf5]/40 dark:bg-[#2d333b] dark:text-[#539bf5]"
                    : "border border-transparent text-[#57606a] hover:bg-white/60 hover:text-[#24292f] dark:text-[#768390] dark:hover:bg-[#2d333b]/60 dark:hover:text-[#adbac7]"
                }`}
              >
                {status === "ALL" ? "All" : status}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-[#57606a] dark:text-[#768390]">
            Showing <span className="font-semibold text-[#24292f] dark:text-[#adbac7]">{sortedApps.length}</span> of {applications.length} {applications.length === 1 ? "application" : "applications"}
            {searchQuery && <span> · Filtered by &ldquo;{searchQuery}&rdquo;</span>}
          </p>
          <p className="hidden items-center gap-1 text-xs text-[#57606a] dark:text-[#768390] sm:flex">
            <span className="inline-block h-2 w-2 rounded-full bg-[#1f883d]" /> Pipeline: Researching <ChevronRight className="h-3 w-3" /> In Progress <ChevronRight className="h-3 w-3" /> Submitted <ChevronRight className="h-3 w-3" /> Interview <ChevronRight className="h-3 w-3" /> Decision
          </p>
        </div>

        {/* Desktop Table View */}
        <div className="mt-3 hidden overflow-hidden rounded-lg border border-[#d0d7de] dark:border-[#444c56] lg:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b border-[#d8dee4] bg-[#f6f8fa] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#57606a] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#768390]">
                <tr>
                  <th
                    scope="col"
                    onClick={() => handleSortToggle("programName")}
                    className="cursor-pointer select-none px-5 py-3 transition hover:bg-[#eaeef2] dark:hover:bg-[#323943]"
                    aria-sort={sortKey === "programName" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Program</span>
                      {renderSortIcon("programName")}
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleSortToggle("university")}
                    className="cursor-pointer select-none px-4 py-3 transition hover:bg-[#eaeef2] dark:hover:bg-[#323943]"
                    aria-sort={sortKey === "university" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>University</span>
                      {renderSortIcon("university")}
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleSortToggle("status")}
                    className="cursor-pointer select-none px-4 py-3 transition hover:bg-[#eaeef2] dark:hover:bg-[#323943]"
                    aria-sort={sortKey === "status" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Status</span>
                      {renderSortIcon("status")}
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => handleSortToggle("deadline")}
                    className="cursor-pointer select-none px-4 py-3 transition hover:bg-[#eaeef2] dark:hover:bg-[#323943]"
                    aria-sort={sortKey === "deadline" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Deadline</span>
                      {renderSortIcon("deadline")}
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-3">Checklist</th>
                  <th scope="col" className="px-4 py-3">Requirements</th>
                  <th scope="col" className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d8dee4] dark:divide-[#444c56]">
                {sortedApps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center">
                      <FileText className="mx-auto h-6 w-6 text-[#8c959f] dark:text-[#636e7b]" />
                      <p className="mt-3 text-sm font-medium">
                        {applications.length === 0 ? "No programs yet" : "No matching programs"}
                      </p>
                      <p className="mt-1 text-xs text-[#57606a] dark:text-[#768390]">
                        {applications.length === 0
                          ? "Add a program to start your application pipeline."
                          : "Try a different search or status filter."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedApps.map((application) => {
                    const materials = materialsFor(application);
                    const requests = lorsFor(application);
                    const deadlineInfo = formatDeadline(application.deadline);
                    const programTag = detectProgramType(application.degreeType, application.programName);
                    const tagStyle = PROGRAM_TAG_STYLES[programTag];
                    const nextStatus = nextWorkflowStatus(application.status);
                    const isStatusPending = pendingAction === `status:${application.id}`;
                    const isCopied = copiedAppId === application.id;

                    const checklist = {
                      transcripts:
                        application.transcriptsSent ||
                        materials.some((m) => m.type === "Transcript"),
                      lors:
                        application.lorsRequested ||
                        requests.some((r) => r.status !== "Not requested"),
                      essays:
                        application.essayCompleted ||
                        materials.some(
                          (m) =>
                            m.type === "Personal Statement" ||
                            m.type === "Essay Draft"
                        ),
                    };

                    return (
                      <tr
                        key={application.id}
                        className="transition hover:bg-[#f6f8fa]/80 dark:hover:bg-[#2d333b]/70"
                      >
                        <td className="px-5 py-4 align-top">
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openModal(application, "details")}
                                className="text-left font-semibold hover:text-[#0969da] dark:hover:text-[#539bf5] transition"
                              >
                                <SearchHighlight text={application.programName} query={searchQuery} />
                              </button>
                              <span
                                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tagStyle.badge}`}
                              >
                                {tagStyle.label}
                              </span>
                            </div>
                            {application.notes && (
                              <p className="max-w-[32ch] truncate text-xs italic text-[#57606a] dark:text-[#768390]">
                                {application.notes}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="font-medium text-[#24292f] dark:text-[#adbac7]">
                            <SearchHighlight text={application.university} query={searchQuery} />
                          </p>
                          {application.degreeType && (
                            <p className="mt-0.5 text-xs text-[#57606a] dark:text-[#768390]">
                              {application.degreeType}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="relative inline-block">
                            <select
                              aria-label={`Change stage for ${application.programName}`}
                              value={application.status}
                              disabled={isStatusPending}
                              onChange={(e) =>
                                void handleQuickStatusChange(
                                  application.id,
                                  e.target.value as ApplicationStatus
                                )
                              }
                              className={`cursor-pointer appearance-none rounded-md border py-1 pl-2.5 pr-6 text-xs font-semibold shadow-xs outline-none transition focus:ring-2 focus:ring-[#0969da] disabled:cursor-not-allowed disabled:opacity-50 ${
                                STATUS_COLORS[application.status] ?? STATUS_COLORS.Researching
                              }`}
                            >
                              {ALL_APPLICATION_STATUSES.map((status) => (
                                <option
                                  key={status}
                                  value={status}
                                  className="bg-white text-[#24292f] dark:bg-[#22272e] dark:text-[#adbac7]"
                                >
                                  {status}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" />
                          </div>
                          <p className="mt-1 text-[11px] text-[#8c959f] dark:text-[#636e7b]">
                            {statusLabel(application.status)}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 align-top">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                              deadlineInfo.isUrgent
                                ? "font-semibold text-[#cf222e] dark:text-[#f47067]"
                                : deadlineInfo.isPast
                                ? "text-[#8c959f] dark:text-[#636e7b]"
                                : "text-[#57606a] dark:text-[#768390]"
                            }`}
                          >
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            {deadlineInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col gap-1 text-xs font-medium">
                            <span
                              className={`inline-flex items-center gap-1.5 ${
                                checklist.transcripts
                                  ? "text-[#1f883d] dark:text-[#56d364]"
                                  : "text-[#8c959f] dark:text-[#636e7b]"
                              }`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Transcripts
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 ${
                                checklist.lors
                                  ? "text-[#1f883d] dark:text-[#56d364]"
                                  : "text-[#8c959f] dark:text-[#636e7b]"
                              }`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              LORs ({requests.length})
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 ${
                                checklist.essays
                                  ? "text-[#1f883d] dark:text-[#56d364]"
                                  : "text-[#8c959f] dark:text-[#636e7b]"
                              }`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Essays
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-xs text-[#57606a] dark:text-[#768390]">
                          <p>GPA: <span className="text-[#24292f] dark:text-[#adbac7]">{application.gpaRequirement || "—"}</span></p>
                          <p className="mt-0.5">MCAT: <span className="text-[#24292f] dark:text-[#adbac7]">{application.mcatRequirement || "—"}</span></p>
                          {application.appFee && <p className="mt-0.5">Fee: <span className="text-[#24292f] dark:text-[#adbac7]">{application.appFee}</span></p>}
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex flex-wrap justify-end items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openModal(application, "details")}
                              title="View full program details"
                              className="inline-flex items-center gap-1 rounded-md border border-[#d0d7de] bg-white px-2 py-1.5 text-xs font-semibold text-[#57606a] transition hover:border-[#0969da] hover:bg-[#ddf4ff] hover:text-[#0969da] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#539bf5] dark:hover:bg-[#1f3b53] dark:hover:text-[#539bf5]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Details
                            </button>
                            <button
                              type="button"
                              onClick={() => openModal(application, "materials")}
                              title="Manage application materials"
                              className="inline-flex items-center gap-1 rounded-md border border-[#d0d7de] bg-white px-2 py-1.5 text-xs font-semibold text-[#57606a] transition hover:border-[#0969da] hover:bg-[#ddf4ff] hover:text-[#0969da] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#539bf5] dark:hover:bg-[#1f3b53] dark:hover:text-[#539bf5]"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              Materials ({materials.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => openModal(application, "lors")}
                              title="Manage letters of recommendation"
                              className="inline-flex items-center gap-1 rounded-md border border-[#d0d7de] bg-white px-2 py-1.5 text-xs font-semibold text-[#57606a] transition hover:border-[#0969da] hover:bg-[#ddf4ff] hover:text-[#0969da] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#539bf5] dark:hover:bg-[#1f3b53] dark:hover:text-[#539bf5]"
                            >
                              <UsersRound className="h-3.5 w-3.5" />
                              LORs ({requests.length})
                            </button>
                            {application.portalUrl && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleCopyPortalUrl(application.id, application.portalUrl)}
                                  title="Copy portal URL to clipboard"
                                  className="rounded-md border border-[#d0d7de] bg-white p-1.5 text-[#57606a] transition hover:border-[#0969da] hover:bg-[#ddf4ff] hover:text-[#0969da] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#539bf5] dark:hover:bg-[#1f3b53] dark:hover:text-[#539bf5]"
                                >
                                  {isCopied ? (
                                    <Check className="h-4 w-4 text-[#1f883d] dark:text-[#56d364]" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </button>
                                <a
                                  href={application.portalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open portal in new tab"
                                  className="rounded-md border border-[#d0d7de] bg-white p-1.5 text-[#57606a] transition hover:border-[#0969da] hover:bg-[#ddf4ff] hover:text-[#0969da] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#539bf5] dark:hover:bg-[#1f3b53] dark:hover:text-[#539bf5]"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(application)}
                              title="Edit program"
                              className="rounded-md border border-[#d0d7de] bg-white p-1.5 text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:bg-[#2d333b]"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(application.id)}
                              disabled={pendingAction === `delete:${application.id}`}
                              title="Delete program"
                              className="rounded-md border border-[#d0d7de] bg-white p-1.5 text-[#57606a] transition hover:border-[#cf222e] hover:bg-[#ffebe9] hover:text-[#cf222e] focus:outline-none focus:ring-2 focus:ring-[#cf222e] disabled:opacity-40 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#f47067] dark:hover:bg-[#3b1d22] dark:hover:text-[#f47067]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile / Tablet Responsive Cards Layout */}
        <div className="mt-3 flex flex-col gap-3 lg:hidden">
          {sortedApps.length === 0 ? (
            <div className="rounded-lg border border-[#d0d7de] bg-white p-8 text-center dark:border-[#444c56] dark:bg-[#22272e]">
              <FileText className="mx-auto h-6 w-6 text-[#8c959f] dark:text-[#636e7b]" />
              <p className="mt-3 text-sm font-medium">
                {applications.length === 0 ? "No programs yet" : "No matching programs"}
              </p>
              <p className="mt-1 text-xs text-[#57606a] dark:text-[#768390]">
                {applications.length === 0
                  ? "Add a program to start your application pipeline."
                  : "Try a different search or status filter."}
              </p>
            </div>
          ) : (
            sortedApps.map((application) => {
              const materials = materialsFor(application);
              const requests = lorsFor(application);
              const deadlineInfo = formatDeadline(application.deadline);
              const programTag = detectProgramType(application.degreeType, application.programName);
              const tagStyle = PROGRAM_TAG_STYLES[programTag];
              const isStatusPending = pendingAction === `status:${application.id}`;
              const isCopied = copiedAppId === application.id;

              const checklist = {
                transcripts:
                  application.transcriptsSent ||
                  materials.some((m) => m.type === "Transcript"),
                lors:
                  application.lorsRequested ||
                  requests.some((r) => r.status !== "Not requested"),
                essays:
                  application.essayCompleted ||
                  materials.some(
                    (m) =>
                      m.type === "Personal Statement" ||
                      m.type === "Essay Draft"
                  ),
              };

              return (
                <article
                  key={application.id}
                  className="rounded-lg border border-[#d0d7de] bg-white p-4 shadow-xs transition hover:border-[#0969da]/40 dark:border-[#444c56] dark:bg-[#2d333b]/70 dark:hover:border-[#539bf5]/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tagStyle.badge}`}
                      >
                        {tagStyle.label}
                      </span>
                      <div className="relative inline-block">
                        <select
                          aria-label={`Change stage for ${application.programName}`}
                          value={application.status}
                          disabled={isStatusPending}
                          onChange={(e) =>
                            void handleQuickStatusChange(
                              application.id,
                              e.target.value as ApplicationStatus
                            )
                          }
                          className={`cursor-pointer appearance-none rounded-md border py-0.5 pl-2 pr-5 text-xs font-semibold shadow-xs outline-none transition focus:ring-2 focus:ring-[#0969da] disabled:cursor-not-allowed disabled:opacity-50 ${
                            STATUS_COLORS[application.status] ?? STATUS_COLORS.Researching
                          }`}
                        >
                          {ALL_APPLICATION_STATUSES.map((status) => (
                            <option
                              key={status}
                              value={status}
                              className="bg-white text-[#24292f] dark:bg-[#22272e] dark:text-[#adbac7]"
                            >
                              {status}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" />
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-xs ${
                        deadlineInfo.isUrgent
                          ? "font-semibold text-[#cf222e] dark:text-[#f47067]"
                          : "text-[#57606a] dark:text-[#768390]"
                      }`}
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      {deadlineInfo.label}
                    </span>
                  </div>

                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={() => openModal(application, "details")}
                      className="text-left font-semibold text-base text-[#24292f] hover:text-[#0969da] dark:text-[#adbac7] dark:hover:text-[#539bf5] transition"
                    >
                      <SearchHighlight text={application.programName} query={searchQuery} />
                    </button>
                    <p className="mt-0.5 text-xs text-[#57606a] dark:text-[#768390]">
                      <SearchHighlight text={application.university} query={searchQuery} />
                      {application.degreeType && ` · ${application.degreeType}`}
                    </p>
                  </div>

                  {(application.gpaRequirement || application.mcatRequirement || application.appFee) && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#57606a] dark:text-[#768390]">
                      {application.gpaRequirement && (
                        <span className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-0.5 dark:border-[#444c56] dark:bg-[#22272e]">
                          GPA: <strong className="text-[#24292f] dark:text-[#adbac7]">{application.gpaRequirement}</strong>
                        </span>
                      )}
                      {application.mcatRequirement && (
                        <span className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-0.5 dark:border-[#444c56] dark:bg-[#22272e]">
                          MCAT: <strong className="text-[#24292f] dark:text-[#adbac7]">{application.mcatRequirement}</strong>
                        </span>
                      )}
                      {application.appFee && (
                        <span className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-0.5 dark:border-[#444c56] dark:bg-[#22272e]">
                          Fee: <strong className="text-[#24292f] dark:text-[#adbac7]">{application.appFee}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium border-t border-[#d8dee4] pt-2.5 dark:border-[#444c56]">
                    <span
                      className={`inline-flex items-center gap-1 ${
                        checklist.transcripts ? "text-[#1f883d] dark:text-[#56d364]" : "text-[#8c959f] dark:text-[#636e7b]"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Transcripts
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        checklist.lors ? "text-[#1f883d] dark:text-[#56d364]" : "text-[#8c959f] dark:text-[#636e7b]"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      LORs ({requests.length})
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        checklist.essays ? "text-[#1f883d] dark:text-[#56d364]" : "text-[#8c959f] dark:text-[#636e7b]"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Essays
                    </span>
                  </div>

                  {application.notes && (
                    <p className="mt-2 text-xs italic text-[#57606a] dark:text-[#768390] line-clamp-2">
                      &ldquo;{application.notes}&rdquo;
                    </p>
                  )}

                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#d8dee4] pt-3 dark:border-[#444c56]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openModal(application, "details")}
                        className="inline-flex items-center gap-1 rounded-md border border-[#d0d7de] bg-white px-2.5 py-1 text-xs font-semibold text-[#0969da] shadow-xs transition hover:bg-[#ddf4ff] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#539bf5] dark:hover:bg-[#1f3b53]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => openModal(application, "materials")}
                        className="inline-flex items-center gap-1 rounded-md border border-[#d0d7de] bg-white px-2 py-1 text-xs font-semibold text-[#57606a] shadow-xs transition hover:bg-[#f6f8fa] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:bg-[#2d333b]"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        Materials ({materials.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => openModal(application, "lors")}
                        className="inline-flex items-center gap-1 rounded-md border border-[#d0d7de] bg-white px-2 py-1 text-xs font-semibold text-[#57606a] shadow-xs transition hover:bg-[#f6f8fa] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:bg-[#2d333b]"
                      >
                        <UsersRound className="h-3.5 w-3.5" />
                        LORs ({requests.length})
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      {application.portalUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleCopyPortalUrl(application.id, application.portalUrl)}
                            title="Copy portal link"
                            className="rounded-md border border-[#d0d7de] bg-white p-1 text-[#57606a] transition hover:bg-[#f6f8fa] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:bg-[#2d333b]"
                          >
                            {isCopied ? (
                              <Check className="h-3.5 w-3.5 text-[#1f883d] dark:text-[#56d364]" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <a
                            href={application.portalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open portal"
                            className="rounded-md border border-[#d0d7de] bg-white p-1 text-[#57606a] transition hover:bg-[#f6f8fa] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:bg-[#2d333b]"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(application)}
                        title="Edit program"
                        className="rounded-md border border-[#d0d7de] bg-white p-1 text-[#57606a] transition hover:bg-[#f6f8fa] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:bg-[#2d333b]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(application.id)}
                        title="Delete program"
                        className="rounded-md border border-[#d0d7de] bg-white p-1 text-[#57606a] transition hover:border-[#cf222e] hover:bg-[#ffebe9] hover:text-[#cf222e] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#f47067] dark:hover:bg-[#3b1d22] dark:hover:text-[#f47067]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {notice && (
          <div
            role="status"
            className="fixed bottom-5 right-5 z-[80] max-w-sm rounded-md border border-[#d0d7de] bg-white px-4 py-3 text-sm font-medium text-[#24292f] shadow-lg dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7]"
          >
            {notice}
          </div>
        )}
      </div>

      {isEditorOpen && (
        <ApplicationEditor
          editingApp={editingApp}
          isPending={pendingAction === "application"}
          onCancel={() => {
            setIsEditorOpen(false);
            setEditingApp(null);
          }}
          onSubmit={handleApplicationSubmit}
        />
      )}

      {activeApplication && activeModal === "details" && (
        <ApplicationDetailsModal
          isOpen
          application={activeApplication}
          materials={materialsFor(activeApplication)}
          lors={lorsFor(activeApplication)}
          history={historyFor(activeApplication)}
          onClose={closeModal}
          onEdit={(app) => {
            closeModal();
            handleOpenEdit(app);
          }}
          onDelete={(id) => {
            closeModal();
            void handleDelete(id);
          }}
          onOpenMaterials={() => {
            setActiveModal("materials");
          }}
          onOpenLORs={() => {
            setActiveModal("lors");
          }}
          onOpenHistory={() => {
            setActiveModal("history");
          }}
          onStatusChange={(status) => {
            void handleQuickStatusChange(activeApplication.id, status);
          }}
          onCopyPortalUrl={(url) => {
            void handleCopyPortalUrl(activeApplication.id, url);
          }}
          isCopied={copiedAppId === activeApplication.id}
          isPendingStatus={pendingAction === `status:${activeApplication.id}`}
        />
      )}

      {activeApplication && activeModal === "materials" && (
        <MaterialsModal
          isOpen
          applicationId={activeApplication.id}
          programName={activeApplication.programName}
          initialMaterials={materialsFor(activeApplication)}
          onClose={closeModal}
          onSave={handleMaterialsSave}
        />
      )}

      {activeApplication && activeModal === "lors" && (
        <LORModal
          isOpen
          applicationId={activeApplication.id}
          programName={activeApplication.programName}
          initialRequests={lorsFor(activeApplication)}
          onClose={closeModal}
          onSave={handleLORSave}
        />
      )}

      {activeApplication && activeModal === "history" && (
        <ActionHistoryModal
          isOpen
          applicationId={activeApplication.id}
          programName={activeApplication.programName}
          initialEntries={historyFor(activeApplication)}
          onClose={closeModal}
          onClear={handleHistoryClear}
        />
      )}
    </div>
  );
}
