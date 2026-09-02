"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Database,
  Edit3,
  ExternalLink,
  FileText,
  History,
  Key,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
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
import { ApiKeySettingsModal } from "@/components/ApiKeySettingsModal";
import { requestProgramAutofill } from "@/lib/autofill";

const WORKFLOW_STEPS = ["Researching", "In Progress", "Submitted", "Interview", "Decision"] as const;
type WorkflowStatus = (typeof WORKFLOW_STEPS)[number];
type FilterStatus = "ALL" | WorkflowStatus | "Waitlisted" | "Rejected";
type ModalName = "materials" | "lors" | "history" | null;

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
  Decision:
    "border-[#1f883d]/30 bg-[#dafbe1] text-[#1f883d] dark:border-[#46954a]/40 dark:bg-[#1f3b2b] dark:text-[#56d364]",
  Waitlisted:
    "border-[#bf8700]/30 bg-[#fff8c5] text-[#9a6700] dark:border-[#d29922]/40 dark:bg-[#3b2f18] dark:text-[#d29922]",
  Rejected:
    "border-[#cf222e]/30 bg-[#ffebe9] text-[#cf222e] dark:border-[#f47067]/40 dark:bg-[#3b2f18] dark:text-[#f47067]",
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
  onOpenSettings: () => void;
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
  onOpenSettings,
}: ApplicationEditorProps) {
  const [formState, setFormState] = useState({
    programName: editingApp?.programName ?? "",
    university: editingApp?.university ?? "",
    status: editingApp?.status ?? "Researching",
    deadline: editingApp?.deadline ?? "",
    degreeType: editingApp?.degreeType ?? "MS / SMP",
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

  const handleAutofill = async () => {
    const query = `${formState.university} ${formState.programName} ${formState.degreeType}`.trim();
    if (!query) {
      setAutofillError("Please enter at least a program name or university to autofill.");
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
            <h2 id="application-editor-title" className="text-lg font-semibold tracking-tight">{editingApp ? "Edit program" : "Add Special Master's program"}</h2>
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
            <div className="flex items-center justify-between rounded-md border border-[#cf222e]/40 bg-[#ffebe9] p-2.5 text-xs text-[#cf222e] dark:border-[#f47067]/40 dark:bg-[#3b2225] dark:text-[#f47067]">
              <span>{autofillError}</span>
              <button
                type="button"
                onClick={onOpenSettings}
                className="underline font-semibold ml-2 hover:opacity-80"
              >
                Configure Key
              </button>
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d8dee4] pt-4 dark:border-[#444c56]">
            <button
              type="button"
              onClick={handleAutofill}
              disabled={isAutofilling}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#0969da]/30 bg-[#ddf4ff] px-3 py-2 text-xs font-semibold text-[#0969da] transition hover:bg-[#b6e3ff] focus:outline-none focus:ring-2 focus:ring-[#0969da] disabled:opacity-50 dark:border-[#539bf5]/40 dark:bg-[#1f3b53] dark:text-[#539bf5] dark:hover:bg-[#294c6b]"
              title="Autofill program details using OpenRouter"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isAutofilling ? "Autofilling details..." : "⚡ Autofill with OpenRouter"}
            </button>

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

export function TrackerDashboard({ initialApplications, source }: Props) {
  const [applications, setApplications] = useState<Application[]>(initialApplications);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeApplication, setActiveApplication] = useState<Application | null>(null);
  const [activeModal, setActiveModal] = useState<ModalName>(null);
  const [materialsByApp, setMaterialsByApp] = useState<Record<string, MaterialItem[]>>({});
  const [lorsByApp, setLorsByApp] = useState<Record<string, LORRequest[]>>({});
  const [historyByApp, setHistoryByApp] = useState<Record<string, ActionLogEntry[]>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isGithubSynced, setIsGithubSynced] = useState(false);

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
        app.degreeType.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [applications, filterStatus, searchQuery]);

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

  return (
    <div className="min-h-screen bg-white text-[#24292f] dark:bg-[#22272e] dark:text-[#adbac7]">
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-[#d8dee4] pb-6 dark:border-[#444c56] md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Special Master&apos;s Programs Tracker
              </h1>
              {(isGithubSynced || source === "google_sheets") && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#1f883d]/30 bg-[#dafbe1] px-2 py-1 text-[11px] font-semibold text-[#1f883d] dark:border-[#46954a]/40 dark:bg-[#1f3b2b] dark:text-[#56d364]"
                >
                  <Database className="h-3.5 w-3.5" />
                  {isGithubSynced ? "GitHub synced" : "Google Sheets connected"}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:bg-[#2d333b]"
              title="Configure Muse Spark API key"
            >
              <Key className="h-4 w-4" />
              API Key
            </button>
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

        <section aria-label="Application metrics" className="grid grid-cols-2 border-b border-[#d8dee4] dark:border-[#444c56] sm:grid-cols-4">
          <div className="border-r border-[#d8dee4] py-5 pr-4 dark:border-[#444c56] sm:pr-6"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#57606a] dark:text-[#768390]">Tracked</p><p className="mt-1 text-2xl font-semibold tabular-nums">{stats.total}</p></div>
          <div className="border-b border-[#d8dee4] py-5 pl-4 dark:border-[#444c56] sm:border-b-0 sm:px-6"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#57606a] dark:text-[#768390]">Active</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[#0969da] dark:text-[#539bf5]">{stats.active}</p></div>
          <div className="border-r border-[#d8dee4] py-5 pr-4 dark:border-[#444c56] sm:border-l sm:px-6 sm:pr-6"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#57606a] dark:text-[#768390]">Submitted</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[#9a6700] dark:text-[#d29922]">{stats.submitted}</p></div>
          <div className="py-5 pl-4 sm:pl-6"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#57606a] dark:text-[#768390]">Materials saved</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[#8250df] dark:text-[#dcbdfb]">{stats.materials}</p></div>
        </section>

        <section aria-label="Search and filters" className="flex flex-col gap-3 border-b border-[#d8dee4] py-5 dark:border-[#444c56] lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block max-w-xl flex-1">
            <span className="sr-only">Search applications</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c959f] dark:text-[#636e7b]" />
            <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by program, university, or status" className="block w-full rounded-md border border-[#d0d7de] bg-white py-2 pl-9 pr-3 text-sm text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7]" />
          </label>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Application status filters">
            {FILTER_STATUSES.map((status) => (
              <button key={status} type="button" role="tab" aria-selected={filterStatus === status} onClick={() => setFilterStatus(status)} className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-[#0969da] ${filterStatus === status ? "border-[#0969da]/40 bg-[#ddf4ff] text-[#0969da] dark:border-[#539bf5]/40 dark:bg-[#1f3b53] dark:text-[#539bf5]" : "border-[#d0d7de] bg-white text-[#57606a] hover:bg-[#f6f8fa] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#768390] dark:hover:bg-[#2d333b]"}`}>{status === "ALL" ? "All" : status}</button>
            ))}
          </div>
        </section>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-[#57606a] dark:text-[#768390]">{filteredApps.length} of {applications.length} {applications.length === 1 ? "application" : "applications"}</p>
          <p className="hidden items-center gap-1 text-xs text-[#57606a] dark:text-[#768390] sm:flex"><span className="inline-block h-2 w-2 rounded-full bg-[#1f883d]" /> Pipeline: Researching <ChevronRight className="h-3 w-3" /> In Progress <ChevronRight className="h-3 w-3" /> Submitted <ChevronRight className="h-3 w-3" /> Interview <ChevronRight className="h-3 w-3" /> Decision</p>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-[#d0d7de] dark:border-[#444c56]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b border-[#d8dee4] bg-[#f6f8fa] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#57606a] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#768390]">
                <tr><th className="px-5 py-3">Program</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Deadline</th><th className="px-4 py-3">Checklist</th><th className="px-4 py-3">Requirements</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-[#d8dee4] dark:divide-[#444c56]">
                {filteredApps.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-14 text-center"><FileText className="mx-auto h-6 w-6 text-[#8c959f] dark:text-[#636e7b]" /><p className="mt-3 text-sm font-medium">{applications.length === 0 ? "No programs yet" : "No matching programs"}</p><p className="mt-1 text-xs text-[#57606a] dark:text-[#768390]">{applications.length === 0 ? "Add a program to start your application pipeline." : "Try a different search or status filter."}</p></td></tr>
                ) : filteredApps.map((application) => {
                  const visibleStatus = statusLabel(application.status);
                  const nextStatus = nextWorkflowStatus(application.status);
                  const materials = materialsFor(application);
                  const requests = lorsFor(application);
                  const history = historyFor(application);
                  const checklist = {
                    transcripts: application.transcriptsSent || materials.some((material) => material.type === "Transcript"),
                    lors: application.lorsRequested || requests.some((request) => request.status !== "Not requested"),
                    essays: application.essayCompleted || materials.some((material) => material.type === "Personal Statement" || material.type === "Essay Draft"),
                  };
                  return (
                    <tr key={application.id} className="transition hover:bg-[#f6f8fa]/80 dark:hover:bg-[#2d333b]/70">
                      <td className="px-5 py-4 align-top">
                        <p className="font-semibold">{application.programName}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-[#57606a] dark:text-[#768390]"><span>{application.university}</span><span aria-hidden="true">·</span><span>{application.degreeType}</span></p>
                        {application.notes && <p className="mt-2 max-w-[34ch] truncate text-xs italic text-[#57606a] dark:text-[#768390]">{application.notes}</p>}
                      </td>
                      <td className="px-4 py-4 align-top"><span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${STATUS_COLORS[visibleStatus] ?? STATUS_COLORS.Researching}`}>{visibleStatus}</span><p className="mt-1 text-[11px] text-[#8c959f] dark:text-[#636e7b]">{application.status !== visibleStatus ? application.status : "Current stage"}</p></td>
                      <td className="whitespace-nowrap px-4 py-4 align-top"><span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#57606a] dark:text-[#768390]"><Calendar className="h-3.5 w-3.5" />{application.deadline}</span></td>
                      <td className="px-4 py-4 align-top"><div className="flex flex-col gap-1.5 text-xs font-medium"><span className={`inline-flex items-center gap-1.5 ${checklist.transcripts ? "text-[#1f883d] dark:text-[#56d364]" : "text-[#8c959f] dark:text-[#636e7b]"}`}><CheckCircle2 className="h-3.5 w-3.5" />Transcripts</span><span className={`inline-flex items-center gap-1.5 ${checklist.lors ? "text-[#1f883d] dark:text-[#56d364]" : "text-[#8c959f] dark:text-[#636e7b]"}`}><CheckCircle2 className="h-3.5 w-3.5" />LORs</span><span className={`inline-flex items-center gap-1.5 ${checklist.essays ? "text-[#1f883d] dark:text-[#56d364]" : "text-[#8c959f] dark:text-[#636e7b]"}`}><CheckCircle2 className="h-3.5 w-3.5" />Essays</span></div></td>
                      <td className="px-4 py-4 align-top text-xs text-[#57606a] dark:text-[#768390]"><p>GPA: {application.gpaRequirement || "—"}</p><p className="mt-1">MCAT: {application.mcatRequirement || "—"}</p>{application.appFee && <p className="mt-1">Fee: {application.appFee}</p>}</td>
                      <td className="px-5 py-4 align-top"><div className="flex flex-wrap justify-end gap-1.5">
                        <button type="button" onClick={() => openModal(application, "materials")} className="inline-flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-2 py-1.5 text-xs font-semibold text-[#57606a] transition hover:border-[#0969da] hover:bg-[#ddf4ff] hover:text-[#0969da] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#539bf5] dark:hover:bg-[#1f3b53] dark:hover:text-[#539bf5]"><Paperclip className="h-3.5 w-3.5" />Manage Materials</button>
                        <button type="button" onClick={() => openModal(application, "lors")} className="inline-flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-2 py-1.5 text-xs font-semibold text-[#57606a] transition hover:border-[#0969da] hover:bg-[#ddf4ff] hover:text-[#0969da] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#539bf5] dark:hover:bg-[#1f3b53] dark:hover:text-[#539bf5]"><UsersRound className="h-3.5 w-3.5" />Manage LORs</button>
                        <button type="button" title={nextStatus ? `Advance Status to ${nextStatus}` : "At decision"} onClick={() => void handleAdvanceStatus(application)} disabled={!nextStatus || pendingAction === `advance:${application.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-[#1f883d] px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1a7f37] focus:outline-none focus:ring-2 focus:ring-[#1f883d] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#347d39] dark:hover:bg-[#46954a]"><ArrowRight className="h-3.5 w-3.5" />Advance Status{nextStatus && <span className="font-normal opacity-80">→ {nextStatus}</span>}</button>
                        {application.portalUrl && <a href={application.portalUrl} target="_blank" rel="noopener noreferrer" title="Open application portal" className="rounded-md border border-[#d0d7de] bg-white p-1.5 text-[#57606a] transition hover:border-[#0969da] hover:bg-[#ddf4ff] hover:text-[#0969da] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#539bf5] dark:hover:bg-[#1f3b53] dark:hover:text-[#539bf5]"><ExternalLink className="h-4 w-4" /></a>}
                        <button type="button" onClick={() => handleOpenEdit(application)} title="Edit program" className="rounded-md border border-[#d0d7de] bg-white p-1.5 text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:bg-[#2d333b]"><Edit3 className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void handleDelete(application.id)} disabled={pendingAction === `delete:${application.id}`} title="Delete program" className="rounded-md border border-[#d0d7de] bg-white p-1.5 text-[#57606a] transition hover:border-[#cf222e] hover:bg-[#ffebe9] hover:text-[#cf222e] focus:outline-none focus:ring-2 focus:ring-[#cf222e] disabled:opacity-40 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7] dark:hover:border-[#f47067] dark:hover:bg-[#3b2225] dark:hover:text-[#f47067]"><Trash2 className="h-4 w-4" /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {notice && <div role="status" className="fixed bottom-5 right-5 z-[80] max-w-sm rounded-md border border-[#d0d7de] bg-white px-4 py-3 text-sm font-medium text-[#24292f] shadow-lg dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7]">{notice}</div>}
      </div>

      {isEditorOpen && (
        <ApplicationEditor
          editingApp={editingApp}
          isPending={pendingAction === "application"}
          onCancel={() => { setIsEditorOpen(false); setEditingApp(null); }}
          onSubmit={handleApplicationSubmit}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}
      {isSettingsOpen && (
        <ApiKeySettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
      {activeApplication && activeModal === "materials" && <MaterialsModal isOpen applicationId={activeApplication.id} programName={activeApplication.programName} initialMaterials={materialsFor(activeApplication)} onClose={closeModal} onSave={handleMaterialsSave} />}
      {activeApplication && activeModal === "lors" && <LORModal isOpen applicationId={activeApplication.id} programName={activeApplication.programName} initialRequests={lorsFor(activeApplication)} onClose={closeModal} onSave={handleLORSave} />}
      {activeApplication && activeModal === "history" && <ActionHistoryModal isOpen applicationId={activeApplication.id} programName={activeApplication.programName} initialEntries={historyFor(activeApplication)} onClose={closeModal} onClear={handleHistoryClear} />}
    </div>
  );
}
