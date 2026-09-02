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
  Paperclip,
  Plus,
  Search,
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
    "border-[#cf222e]/30 bg-[#ffebe9] text-[#cf222e] dark:border-[#f47067]/40 dark:bg-[#3b2225] dark:text-[#f47067]",
};

const STORAGE_PREFIXES = {
  materials: "smp-tracker:materials:",
  lors: "smp-tracker:lors:",
  history: "smp-tracker:action-history:",
} as const;

type RichApplication = Application & {
  materials?: MaterialItem[];
  lorRequests?: LORRequest[];
  actionLog?: ActionLogEntry[];
};

interface Props {
  initialApplications: Application[];
  source: "google_sheets" | "local_fallback";
}

interface ApplicationEditorProps {
  editingApp: Application | null;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (formData: FormData) => Promise<void>;
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readStored<T>(prefix: string, id: string): T[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(`${prefix}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function writeStored<T>(prefix: string, id: string, value: T[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(`${prefix}${id}`, JSON.stringify(value));
  } catch {
    // Local state remains usable when a browser denies or fills localStorage.
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function normalizeMaterialType(value: unknown): MaterialType {
  const label = String(value ?? "").trim().toLowerCase();
  const match = MATERIAL_TYPES.find((type) => type.toLowerCase() === label);
  if (match) return match;
  if (label.includes("personal") || label.includes("statement")) return "Personal Statement";
  if (label.includes("transcript")) return "Transcript";
  if (label === "cv" || label.includes("resume")) return "CV";
  if (label.includes("casper")) return "CASPer Score";
  return "Essay Draft";
}

function normalizeMaterialSource(value: unknown, url: unknown): MaterialSource {
  if (value === "upload" || value === "file") return "upload";
  if (value === "text" || value === "note") return "text";
  if (typeof url === "string" && url.length > 0) return "link";
  return "text";
}

function normalizeMaterialStatus(value: unknown): MaterialStatus {
  if (value === "Ready") return "Ready";
  if (value === "Submitted") return "Submitted";
  return "Draft";
}

function normalizeMaterials(value: unknown): MaterialItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    const record = asRecord(entry);
    if (!record) return [];
    const url = typeof record.url === "string" ? record.url : undefined;
    const name = String(record.name ?? record.title ?? `Material ${index + 1}`).trim();
    if (!name) return [];
    return [{
      id: String(record.id ?? `material-${index}`),
      type: normalizeMaterialType(record.type ?? record.category),
      name,
      status: normalizeMaterialStatus(record.status),
      source: normalizeMaterialSource(record.source ?? record.sourceType, url),
      url,
      notes: typeof record.notes === "string" ? record.notes : undefined,
      fileName: typeof record.fileName === "string" ? record.fileName : undefined,
      updatedAt: String(record.updatedAt ?? ""),
    }];
  });
}

function normalizeLORStatus(value: unknown): LORStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized.includes("received") || normalized.includes("confirm")) return "Received";
  if (normalized.includes("follow")) return "Follow-up needed";
  if (normalized.includes("request")) return "Requested";
  return "Not requested";
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
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(new FormData(event.currentTarget));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#24292f]/60 px-4 py-8 backdrop-blur-sm dark:bg-black/70 sm:items-center"
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
              <input type="text" name="programName" required defaultValue={editingApp?.programName ?? ""} placeholder="e.g. M.S. in Physiology" className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
            </label>
            <label className="text-xs font-semibold">University *
              <input type="text" name="university" required defaultValue={editingApp?.university ?? ""} placeholder="e.g. Georgetown University" className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-semibold">Status
              <select name="status" defaultValue={editingApp?.status ?? "Researching"} className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]">
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
              <input type="date" name="deadline" required defaultValue={editingApp?.deadline ?? ""} className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
            </label>
            <label className="text-xs font-semibold">Degree type
              <input type="text" name="degreeType" defaultValue={editingApp?.degreeType ?? "MS / SMP"} className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-semibold">GPA requirement
              <input type="text" name="gpaRequirement" defaultValue={editingApp?.gpaRequirement ?? ""} placeholder="3.0+" className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
            </label>
            <label className="text-xs font-semibold">MCAT requirement
              <input type="text" name="mcatRequirement" defaultValue={editingApp?.mcatRequirement ?? ""} placeholder="500+" className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
            </label>
            <label className="text-xs font-semibold">Application fee
              <input type="text" name="appFee" defaultValue={editingApp?.appFee ?? ""} placeholder="$80" className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
            </label>
          </div>
          <label className="block text-xs font-semibold">Application portal URL
            <input type="url" name="portalUrl" defaultValue={editingApp?.portalUrl ?? ""} placeholder="https://..." className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
          </label>
          <fieldset className="rounded-lg border border-[#d8dee4] bg-[#f6f8fa]/70 p-3 dark:border-[#444c56] dark:bg-[#2d333b]/55">
            <legend className="px-1 text-xs font-semibold">Requirement checklist</legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium"><input type="checkbox" name="transcriptsSent" defaultChecked={editingApp?.transcriptsSent} className="rounded border-[#8c959f] text-[#0969da] focus:ring-[#0969da]" /> Transcripts sent</label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium"><input type="checkbox" name="lorsRequested" defaultChecked={editingApp?.lorsRequested} className="rounded border-[#8c959f] text-[#0969da] focus:ring-[#0969da]" /> LORs requested</label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium"><input type="checkbox" name="essayCompleted" defaultChecked={editingApp?.essayCompleted} className="rounded border-[#8c959f] text-[#0969da] focus:ring-[#0969da]" /> Essay completed</label>
            </div>
          </fieldset>
          <label className="block text-xs font-semibold">Notes
            <textarea name="notes" rows={3} defaultValue={editingApp?.notes ?? ""} placeholder="Linkage terms, committee letter deadlines, interview impressions..." className="mt-1.5 block w-full resize-y rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
          </label>
          <footer className="flex justify-end gap-3 border-t border-[#d8dee4] pt-4 dark:border-[#444c56]">
            <button type="button" onClick={onCancel} className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold text-[#24292f] transition hover:bg-[#f6f8fa] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7] dark:hover:bg-[#373e47]">Cancel</button>
            <button type="submit" disabled={isPending} className="inline-flex items-center gap-2 rounded-md bg-[#0969da] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#0860ca] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#539bf5] dark:text-[#0d1117] dark:hover:bg-[#6cb6ff]">
              {isPending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-[#0d1117]/30 dark:border-t-[#0d1117]" />}
              {isPending ? "Saving..." : editingApp ? "Save changes" : "Add program"}
            </button>
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
  const [activeApplication, setActiveApplication] = useState<Application | null>(null);
  const [activeModal, setActiveModal] = useState<ModalName>(null);
  const [materialsByApp, setMaterialsByApp] = useState<Record<string, MaterialItem[]>>({});
  const [lorsByApp, setLorsByApp] = useState<Record<string, LORRequest[]>>({});
  const [historyByApp, setHistoryByApp] = useState<Record<string, ActionLogEntry[]>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isGithubSynced, setIsGithubSynced] = useState(false);

  useEffect(() => {
    const nextMaterials: Record<string, MaterialItem[]> = {};
    const nextLors: Record<string, LORRequest[]> = {};
    const nextHistory: Record<string, ActionLogEntry[]> = {};

    for (const application of applications) {
      const richApplication = application as RichApplication;
      const storedMaterials = readStored<MaterialItem>(STORAGE_PREFIXES.materials, application.id);
      const storedLors = readStored<LORRequest>(STORAGE_PREFIXES.lors, application.id);
      const storedHistory = readStored<ActionLogEntry>(STORAGE_PREFIXES.history, application.id);
      if (storedMaterials) nextMaterials[application.id] = normalizeMaterials(storedMaterials);
      if (storedLors) nextLors[application.id] = normalizeRequests(storedLors);
      if (storedHistory) nextHistory[application.id] = normalizeHistory(storedHistory);
      if (!storedMaterials && richApplication.materials) nextMaterials[application.id] = normalizeMaterials(richApplication.materials);
      if (!storedLors && richApplication.lorRequests) nextLors[application.id] = normalizeRequests(richApplication.lorRequests);
      if (!storedHistory && richApplication.actionLog) nextHistory[application.id] = normalizeHistory(richApplication.actionLog);
    }

    setMaterialsByApp(nextMaterials);
    setLorsByApp(nextLors);
    setHistoryByApp(nextHistory);
  }, [applications]);
  useEffect(() => {
    if (initialApplications.length > 0) return;

    let cancelled = false;
    const hydrateApplications = async () => {
      try {
        const result = await syncApplicationsWithResult();
        if (cancelled) return;
        setApplications(result.applications);
        setIsGithubSynced(result.remoteAvailable);
      } catch {
        if (!cancelled) setNotice("No synced applications yet. Add a program to begin.");
      }
    };

    void hydrateApplications();
    return () => {
      cancelled = true;
    };
  }, [initialApplications.length]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const richApplication = (application: Application) => application as RichApplication;

  const materialsFor = (application: Application) => {
    const stored = materialsByApp[application.id];
    if (stored) return stored;
    return normalizeMaterials(richApplication(application).materials);
  };

  const lorsFor = (application: Application) => {
    const stored = lorsByApp[application.id];
    if (stored) return stored;
    return normalizeRequests(richApplication(application).lorRequests);
  };

  const historyFor = (application: Application) => {
    const stored = historyByApp[application.id];
    if (stored) return stored;
    return normalizeHistory(richApplication(application).actionLog);
  };

  const appendHistory = (application: Application, action: string, description: string) => {
    const entry: ActionLogEntry = {
      id: createId("action"),
      action,
      description,
      timestamp: new Date().toISOString(),
    };
    const currentEntries = historyByApp[application.id] ?? historyFor(application);
    const nextEntries = [entry, ...currentEntries].slice(0, 100);
    setHistoryByApp((current) => ({ ...current, [application.id]: nextEntries }));
    writeStored(STORAGE_PREFIXES.history, application.id, nextEntries);
    void appendActionLog(application.id, entry as never).catch(() => {
      setNotice("Saved locally; action history will sync when the backend is available.");
    });
  };

  const openModal = (application: Application, modal: Exclude<ModalName, null>) => {
    setActiveApplication(application);
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveModal(null);
    setActiveApplication(null);
  };

  const filteredApps = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return applications.filter((application) => {
      const visibleStatus = statusLabel(application.status);
      const matchesStatus = filterStatus === "ALL" || visibleStatus === filterStatus;
      if (!matchesStatus) return false;
      if (!query) return true;
      return [application.programName, application.university, application.degreeType, application.status, visibleStatus]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [applications, filterStatus, searchQuery]);

  const stats = useMemo(() => {
    const active = applications.filter((application) => {
      const status = workflowStatus(application.status);
      return status !== "Decision" && application.status !== "Rejected";
    }).length;
    const submitted = applications.filter((application) => {
      const status = workflowStatus(application.status);
      return status === "Submitted" || status === "Interview";
    }).length;
    const materials = applications.reduce((total, application) => total + materialsFor(application).length, 0);
    return {
      total: applications.length,
      active,
      submitted,
      materials,
    };
  }, [applications, materialsByApp]);

  const handleOpenAdd = () => {
    setEditingApp(null);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (application: Application) => {
    setEditingApp(application);
    setIsEditorOpen(true);
  };
  const handleApplicationSubmit = async (formData: FormData) => {
    const id = String(formData.get("id") || createId("application"));
    const nextApplication = {
      ...(editingApp ?? {}),
      id,
      programName: String(formData.get("programName") || ""),
      university: String(formData.get("university") || ""),
      deadline: String(formData.get("deadline") || ""),
      status: String(formData.get("status") || "Researching") as ApplicationStatus,
      degreeType: String(formData.get("degreeType") || "MS / SMP"),
      gpaRequirement: String(formData.get("gpaRequirement") || ""),
      mcatRequirement: String(formData.get("mcatRequirement") || ""),
      appFee: String(formData.get("appFee") || ""),
      transcriptsSent: formData.get("transcriptsSent") === "on",
      lorsRequested: formData.get("lorsRequested") === "on",
      essayCompleted: formData.get("essayCompleted") === "on",
      portalUrl: String(formData.get("portalUrl") || ""),
      notes: String(formData.get("notes") || ""),
      updatedAt: new Date().toISOString(),
    } as Application;
    setPendingAction("application");
    try {
      const savedApplication = await saveApplication(nextApplication);
      setApplications((current) => editingApp
        ? current.map((application) => application.id === id ? savedApplication : application)
        : [savedApplication, ...current]);
      appendHistory(savedApplication, editingApp ? "Program updated" : "Program added", `${savedApplication.programName} · ${savedApplication.university}`);
      setIsEditorOpen(false);
      setEditingApp(null);
      setNotice(editingApp ? "Program updated." : "Program added.");
    } catch {
      setNotice("The program could not be saved. Your existing data is unchanged.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async (id: string) => {
    const application = applications.find((item) => item.id === id);
    if (!application || !window.confirm(`Delete ${application.programName}?`)) return;
    setPendingAction(`delete:${id}`);
    try {
      const deleted = await deleteApplication(id);
      if (!deleted) {
        setNotice("The program could not be deleted.");
        return;
      }
      setApplications((current) => current.filter((item) => item.id !== id));
      setNotice("Program deleted.");
    } catch {
      setNotice("The program could not be deleted.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleAdvanceStatus = async (application: Application) => {
    const next = nextWorkflowStatus(application.status);
    if (!next) {
      setNotice("This application is at the end of the pipeline.");
      return;
    }
    const nextApplication = {
      ...application,
      status: persistedStatus(next),
      updatedAt: new Date().toISOString(),
    };
    setPendingAction(`advance:${application.id}`);
    setApplications((current) => current.map((item) => item.id === application.id ? nextApplication : item));
    try {
      await updateApplicationStatus(application.id, nextApplication.status);
      setNotice(`Moved to ${next}.`);
    } catch {
      setNotice(`Moved to ${next} locally; sync will retry when the backend is available.`);
    } finally {
      setPendingAction(null);
    }
  };

  const handleMaterialsSave = async (materials: MaterialItem[]) => {
    if (!activeApplication) return;
    const application = activeApplication;
    setMaterialsByApp((current) => ({ ...current, [application.id]: materials }));
    setApplications((current) => current.map((item) => item.id === application.id
      ? ({ ...item, transcriptsSent: materials.some((material) => material.type === "Transcript"), essayCompleted: materials.some((material) => material.type === "Personal Statement" || material.type === "Essay Draft"), updatedAt: new Date().toISOString() } as Application)
      : item));
    writeStored(STORAGE_PREFIXES.materials, application.id, materials);
    appendHistory(application, "Materials updated", `${materials.length} saved ${materials.length === 1 ? "item" : "items"}`);
    try {
      await updateMaterials(application.id, materials as never);
    } catch {
      setNotice("Materials saved locally; sync will retry when the backend is available.");
    }
  };

  const handleLORSave = async (requests: LORRequest[]) => {
    if (!activeApplication) return;
    const application = activeApplication;
    setLorsByApp((current) => ({ ...current, [application.id]: requests }));
    setApplications((current) => current.map((item) => item.id === application.id
      ? ({ ...item, lorsRequested: requests.some((request) => request.status !== "Not requested"), updatedAt: new Date().toISOString() } as Application)
      : item));
    writeStored(STORAGE_PREFIXES.lors, application.id, requests);
    appendHistory(application, "LORs updated", `${requests.length} ${requests.length === 1 ? "request" : "requests"} tracked`);
    try {
      await updateLORRequests(application.id, requests as never);
    } catch {
      setNotice("LORs saved locally; sync will retry when the backend is available.");
    }
  };


  const handleHistoryClear = () => {
    if (!activeApplication) return;
    setHistoryByApp((current) => ({ ...current, [activeApplication.id]: [] }));
    writeStored(STORAGE_PREFIXES.history, activeApplication.id, []);
  };

  return (
    <div className="min-h-screen bg-white text-[#24292f] dark:bg-[#22272e] dark:text-[#adbac7]">
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-[#d8dee4] pb-6 dark:border-[#444c56] md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">SMP application tracker</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${isGithubSynced || source === "google_sheets" ? "border-[#1f883d]/30 bg-[#dafbe1] text-[#1f883d] dark:border-[#46954a]/40 dark:bg-[#1f3b2b] dark:text-[#56d364]" : "border-[#d0d7de] bg-[#f6f8fa] text-[#57606a] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#768390]"}`}>
                <Database className="h-3.5 w-3.5" />{isGithubSynced ? "GitHub synced" : source === "google_sheets" ? "Google Sheets connected" : "Local storage"}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-[#57606a] dark:text-[#768390]">Track deadlines, materials, recommendations, and decisions without losing the details between applications.</p>
          </div>
          <button type="button" onClick={handleOpenAdd} className="inline-flex items-center justify-center gap-2 self-start rounded-md bg-[#0969da] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#0860ca] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:ring-offset-2 dark:bg-[#539bf5] dark:text-[#0d1117] dark:hover:bg-[#6cb6ff] md:self-auto"><Plus className="h-4 w-4" />Add program</button>
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

      {isEditorOpen && <ApplicationEditor editingApp={editingApp} isPending={pendingAction === "application"} onCancel={() => { setIsEditorOpen(false); setEditingApp(null); }} onSubmit={handleApplicationSubmit} />}
      {activeApplication && activeModal === "materials" && <MaterialsModal isOpen applicationId={activeApplication.id} programName={activeApplication.programName} initialMaterials={materialsFor(activeApplication)} onClose={closeModal} onSave={handleMaterialsSave} />}
      {activeApplication && activeModal === "lors" && <LORModal isOpen applicationId={activeApplication.id} programName={activeApplication.programName} initialRequests={lorsFor(activeApplication)} onClose={closeModal} onSave={handleLORSave} />}
      {activeApplication && activeModal === "history" && <ActionHistoryModal isOpen applicationId={activeApplication.id} programName={activeApplication.programName} initialEntries={historyFor(activeApplication)} onClose={closeModal} onClear={handleHistoryClear} />}
    </div>
  );
}
