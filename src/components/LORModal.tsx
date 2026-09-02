"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

export const LOR_STATUSES = [
  "Not requested",
  "Requested",
  "Follow-up needed",
  "Received",
] as const;

export type LORStatus = (typeof LOR_STATUSES)[number];

export interface LORRequest {
  id: string;
  recommenderName: string;
  institution?: string;
  relationship?: string;
  letterType?: string;
  status: LORStatus;
  email?: string;
  submissionDate?: string;
  waivedRights: boolean;
  confirmedReceipt: boolean;
  notes?: string;
  updatedAt: string;
}

export interface LORModalProps {
  isOpen: boolean;
  applicationId: string;
  programName?: string;
  initialRequests?: LORRequest[];
  onClose: () => void;
  onSave?: (requests: LORRequest[]) => void | Promise<void>;
}

const STORAGE_PREFIX = "smp-tracker:lors:";

function readRequests(applicationId: string): LORRequest[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${applicationId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LORRequest[]) : null;
  } catch {
    return null;
  }
}

function writeRequests(applicationId: string, requests: LORRequest[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${applicationId}`,
      JSON.stringify(requests),
    );
  } catch {
    // The parent still owns the in-memory update when storage is unavailable.
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `lor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value?: string) {
  if (!value) return "No date yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusTone(status: LORStatus) {
  if (status === "Received") return "border-[#1f883d]/30 bg-[#dafbe1] text-[#1f883d] dark:border-[#46954a]/40 dark:bg-[#1f3b2b] dark:text-[#56d364]";
  if (status === "Follow-up needed") return "border-[#bf8700]/30 bg-[#fff8c5] text-[#9a6700] dark:border-[#d29922]/40 dark:bg-[#3b2f18] dark:text-[#d29922]";
  if (status === "Requested") return "border-[#0969da]/30 bg-[#ddf4ff] text-[#0969da] dark:border-[#539bf5]/40 dark:bg-[#1f3b53] dark:text-[#539bf5]";
  return "border-[#d0d7de] bg-[#f6f8fa] text-[#57606a] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#768390]";
}

export function LORModal({
  isOpen,
  applicationId,
  programName,
  initialRequests = [],
  onClose,
  onSave,
}: LORModalProps) {
  const [requests, setRequests] = useState<LORRequest[]>(initialRequests);
  const [activeStatus, setActiveStatus] = useState<LORStatus | "All">("All");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [recommenderName, setRecommenderName] = useState("");
  const [institution, setInstitution] = useState("");
  const [relationship, setRelationship] = useState("Professor");
  const [letterType, setLetterType] = useState("Academic");
  const [status, setStatus] = useState<LORStatus>("Requested");
  const [email, setEmail] = useState("");
  const [submissionDate, setSubmissionDate] = useState("");
  const [waivedRights, setWaivedRights] = useState(true);
  const [confirmedReceipt, setConfirmedReceipt] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const stored = readRequests(applicationId);
    setRequests(stored ?? initialRequests);
  }, [applicationId, initialRequests, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  const visibleRequests = useMemo(
    () =>
      activeStatus === "All"
        ? requests
        : requests.filter((request) => request.status === activeStatus),
    [activeStatus, requests],
  );

  const summary = useMemo(() => ({
    total: requests.length,
    requested: requests.filter((request) => request.status === "Requested" || request.status === "Follow-up needed").length,
    received: requests.filter((request) => request.status === "Received" || request.confirmedReceipt).length,
    waived: requests.filter((request) => request.waivedRights).length,
  }), [requests]);

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setRecommenderName("");
    setInstitution("");
    setRelationship("Professor");
    setLetterType("Academic");
    setStatus("Requested");
    setEmail("");
    setSubmissionDate("");
    setWaivedRights(true);
    setConfirmedReceipt(false);
    setNotes("");
  };

  const startEditing = (request: LORRequest) => {
    setIsAdding(true);
    setEditingId(request.id);
    setRecommenderName(request.recommenderName);
    setInstitution(request.institution ?? "");
    setRelationship(request.relationship ?? "Professor");
    setLetterType(request.letterType ?? "Academic");
    setStatus(request.status);
    setEmail(request.email ?? "");
    setSubmissionDate(request.submissionDate ?? "");
    setWaivedRights(request.waivedRights);
    setConfirmedReceipt(request.confirmedReceipt);
    setNotes(request.notes ?? "");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = recommenderName.trim();
    if (!trimmedName) return;

    const nextRequest: LORRequest = {
      id: editingId ?? createId(),
      recommenderName: trimmedName,
      institution: institution.trim() || undefined,
      relationship: relationship.trim() || undefined,
      letterType: letterType.trim() || undefined,
      status,
      email: email.trim() || undefined,
      submissionDate: submissionDate || undefined,
      waivedRights,
      confirmedReceipt,
      notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    const nextRequests = editingId
      ? requests.map((request) => (request.id === editingId ? nextRequest : request))
      : [nextRequest, ...requests];

    setIsSaving(true);
    try {
      writeRequests(applicationId, nextRequests);
      setRequests(nextRequests);
      await onSave?.(nextRequests);
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const nextRequests = requests.filter((request) => request.id !== id);
    setRequests(nextRequests);
    writeRequests(applicationId, nextRequests);
    await onSave?.(nextRequests);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#24292f]/60 px-4 py-8 backdrop-blur-sm dark:bg-black/70 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <section
        aria-labelledby="lor-modal-title"
        aria-modal="true"
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-[#d0d7de] bg-white text-[#24292f] shadow-2xl dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-[#d8dee4] px-5 py-4 dark:border-[#444c56] sm:px-6">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#57606a] dark:text-[#768390]">
              Recommendation letters
            </p>
            <h2 id="lor-modal-title" className="text-lg font-semibold tracking-tight">
              {programName ? `LORs for ${programName}` : "Manage LORs"}
            </h2>
            <p className="mt-1 text-sm text-[#57606a] dark:text-[#768390]">
              Record who you asked, what they need, and when the letter arrives.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recommendation letters dialog"
            className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:text-[#768390] dark:hover:bg-[#2d333b] dark:hover:text-[#adbac7]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid grid-cols-2 divide-x border-b border-[#d8dee4] dark:divide-[#444c56] dark:border-[#444c56] sm:grid-cols-4">
          <div className="px-5 py-3 sm:px-6"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#57606a] dark:text-[#768390]">Total</p><p className="mt-1 text-xl font-semibold tabular-nums">{summary.total}</p></div>
          <div className="px-5 py-3 sm:px-6"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#57606a] dark:text-[#768390]">Requested</p><p className="mt-1 text-xl font-semibold tabular-nums text-[#0969da] dark:text-[#539bf5]">{summary.requested}</p></div>
          <div className="border-t border-[#d8dee4] px-5 py-3 dark:border-[#444c56] sm:border-t-0 sm:px-6"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#57606a] dark:text-[#768390]">Received</p><p className="mt-1 text-xl font-semibold tabular-nums text-[#1f883d] dark:text-[#56d364]">{summary.received}</p></div>
          <div className="border-t border-[#d8dee4] px-5 py-3 dark:border-[#444c56] sm:border-t-0 sm:px-6"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#57606a] dark:text-[#768390]">Rights waived</p><p className="mt-1 text-xl font-semibold tabular-nums text-[#8250df] dark:text-[#dcbdfb]">{summary.waived}</p></div>
        </div>

        <div className="border-b border-[#d8dee4] px-5 py-3 dark:border-[#444c56] sm:px-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Recommendation status filter">
            {(["All", ...LOR_STATUSES] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                role="tab"
                aria-selected={activeStatus === filter}
                onClick={() => setActiveStatus(filter)}
                className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-[#0969da] ${
                  activeStatus === filter
                    ? "border-[#0969da]/40 bg-[#ddf4ff] text-[#0969da] dark:border-[#539bf5]/40 dark:bg-[#1f3b53] dark:text-[#539bf5]"
                    : "border-[#d0d7de] bg-white text-[#57606a] hover:bg-[#f6f8fa] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#768390] dark:hover:bg-[#2d333b]"
                }`}
              >
                {filter}
                {filter !== "All" && <span className="ml-1.5 text-[10px] opacity-70">{requests.filter((request) => request.status === filter).length}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-5 sm:px-6">
          {visibleRequests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#d0d7de] px-5 py-10 text-center dark:border-[#444c56]">
              <UserRound className="mx-auto h-6 w-6 text-[#8c959f] dark:text-[#636e7b]" />
              <p className="mt-3 text-sm font-medium">No recommendation letters here yet</p>
              <p className="mt-1 text-xs text-[#57606a] dark:text-[#768390]">Add a professor, mentor, or supervisor and track the handoff.</p>
            </div>
          ) : (
            <ul className="space-y-2" aria-label="Recommendation letter requests">
              {visibleRequests.map((request) => (
                <li key={request.id} className="rounded-lg border border-[#d8dee4] px-3.5 py-3 dark:border-[#444c56]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{request.recommenderName}</span>
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusTone(request.status)}`}>{request.status}</span>
                        {request.waivedRights && <span className="inline-flex items-center gap-1 rounded-md border border-[#8250df]/30 bg-[#fbefff] px-1.5 py-0.5 text-[10px] font-medium text-[#8250df] dark:border-[#dcbdfb]/35 dark:bg-[#35234f] dark:text-[#dcbdfb]"><ShieldCheck className="h-3 w-3" /> Rights waived</span>}
                        {request.confirmedReceipt && <span className="inline-flex items-center gap-1 rounded-md border border-[#1f883d]/30 bg-[#dafbe1] px-1.5 py-0.5 text-[10px] font-medium text-[#1f883d] dark:border-[#46954a]/40 dark:bg-[#1f3b2b] dark:text-[#56d364]"><CheckCircle2 className="h-3 w-3" /> Receipt confirmed</span>}
                      </div>
                      <p className="mt-1 text-xs text-[#57606a] dark:text-[#768390]">
                        {[request.relationship, request.institution, request.letterType].filter(Boolean).join(" · ") || "Recommendation letter"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#57606a] dark:text-[#768390]">
                        {request.email && <a href={`mailto:${request.email}`} className="inline-flex items-center gap-1 text-[#0969da] hover:underline dark:text-[#539bf5]"><Mail className="h-3.5 w-3.5" />{request.email}</a>}
                        <span>Target: {formatDate(request.submissionDate)}</span>
                        {request.notes && <span className="max-w-[34ch] truncate">· {request.notes}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                      <button type="button" onClick={() => startEditing(request)} aria-label={`Edit ${request.recommenderName}`} className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:text-[#768390] dark:hover:bg-[#2d333b] dark:hover:text-[#adbac7]"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void handleDelete(request.id)} aria-label={`Delete ${request.recommenderName}`} className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#ffebe9] hover:text-[#cf222e] focus:outline-none focus:ring-2 focus:ring-[#cf222e] dark:text-[#768390] dark:hover:bg-[#3b2225] dark:hover:text-[#f47067]"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isAdding ? (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4 rounded-lg border border-[#d0d7de] bg-[#f6f8fa]/70 p-4 dark:border-[#444c56] dark:bg-[#2d333b]/55">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{editingId ? "Edit request" : "Add a recommender"}</h3>
                <button type="button" onClick={resetForm} className="text-xs font-medium text-[#57606a] hover:text-[#24292f] dark:text-[#768390] dark:hover:text-[#adbac7]">Cancel</button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Professor or mentor
                  <input value={recommenderName} onChange={(event) => setRecommenderName(event.target.value)} placeholder="Dr. Maya Patel" required className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
                </label>
                <label className="text-xs font-semibold">
                  Institution
                  <input value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="University or hospital" className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-xs font-semibold">
                  Relationship
                  <input value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="Professor" className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
                </label>
                <label className="text-xs font-semibold">
                  Letter type
                  <select value={letterType} onChange={(event) => setLetterType(event.target.value)} className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"><option>Academic</option><option>Clinical</option><option>Research</option><option>Committee</option><option>Other</option></select>
                </label>
                <label className="text-xs font-semibold">
                  Request status
                  <select value={status} onChange={(event) => setStatus(event.target.value as LORStatus)} className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]">{LOR_STATUSES.map((option) => <option key={option}>{option}</option>)}</select>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Contact email
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="professor@university.edu" className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
                </label>
                <label className="text-xs font-semibold">
                  Target submission date
                  <input type="date" value={submissionDate} onChange={(event) => setSubmissionDate(event.target.value)} className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
                </label>
              </div>
              <div className="grid gap-3 rounded-md border border-[#d8dee4] bg-white/70 p-3 dark:border-[#444c56] dark:bg-[#22272e]/60 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-2 text-xs font-medium">
                  <input type="checkbox" checked={waivedRights} onChange={(event) => setWaivedRights(event.target.checked)} className="mt-0.5 rounded border-[#8c959f] text-[#8250df] focus:ring-[#8250df]" />
                  <span><span className="block">I waived my right to review</span><span className="mt-0.5 block font-normal text-[#57606a] dark:text-[#768390]">Common for confidential letters.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-xs font-medium">
                  <input type="checkbox" checked={confirmedReceipt} onChange={(event) => setConfirmedReceipt(event.target.checked)} className="mt-0.5 rounded border-[#8c959f] text-[#1f883d] focus:ring-[#1f883d]" />
                  <span><span className="block">Receipt confirmed</span><span className="mt-0.5 block font-normal text-[#57606a] dark:text-[#768390]">The program confirmed delivery.</span></span>
                </label>
              </div>
              <label className="block text-xs font-semibold">
                Notes <span className="font-normal text-[#57606a] dark:text-[#768390]">(optional)</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Topics or context to share with your recommender" className="mt-1.5 block w-full resize-y rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]" />
              </label>
              <div className="flex justify-end">
                <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1a7f37] focus:outline-none focus:ring-2 focus:ring-[#1f883d] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#347d39] dark:hover:bg-[#46954a]">
                  {isSaving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Check className="h-4 w-4" />}
                  {editingId ? "Save request" : "Add request"}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setIsAdding(true)} className="mt-5 inline-flex items-center gap-2 rounded-md border border-dashed border-[#8c959f] px-3 py-2 text-sm font-semibold text-[#0969da] transition hover:border-[#0969da] hover:bg-[#ddf4ff] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#636e7b] dark:text-[#539bf5] dark:hover:border-[#539bf5] dark:hover:bg-[#1f3b53]"><Plus className="h-4 w-4" />Add recommender</button>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-[#d8dee4] px-5 py-4 dark:border-[#444c56] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-[#57606a] dark:text-[#768390]">{summary.total} {summary.total === 1 ? "request" : "requests"} · saved on this device</p>
          <button type="button" onClick={onClose} className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold text-[#24292f] transition hover:bg-[#f6f8fa] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7] dark:hover:bg-[#373e47]">Done</button>
        </footer>
      </section>
    </div>
  );
}

export default LORModal;
