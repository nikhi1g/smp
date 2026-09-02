"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  History,
  Mail,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

export interface ActionLogEntry {
  id: string;
  action: string;
  description?: string;
  timestamp: string;
}

export interface ActionHistoryModalProps {
  isOpen: boolean;
  applicationId: string;
  programName?: string;
  initialEntries?: ActionLogEntry[];
  onClose: () => void;
  onClear?: () => void | Promise<void>;
}

const STORAGE_PREFIX = "smp-tracker:action-history:";

function readEntries(applicationId: string): ActionLogEntry[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${applicationId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ActionLogEntry[]) : null;
  } catch {
    return null;
  }
}

function writeEntries(applicationId: string, entries: ActionLogEntry[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${applicationId}`,
      JSON.stringify(entries),
    );
  } catch {
    // History remains available in the parent while browser storage is full.
  }
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function iconForAction(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes("material") || normalized.includes("essay")) return FileText;
  if (normalized.includes("lor") || normalized.includes("recommend")) return Mail;
  if (normalized.includes("status")) return ArrowRight;
  if (normalized.includes("reset") || normalized.includes("import")) return RotateCcw;
  return ClipboardList;
}

export function ActionHistoryModal({
  isOpen,
  applicationId,
  programName,
  initialEntries = [],
  onClose,
  onClear,
}: ActionHistoryModalProps) {
  const [entries, setEntries] = useState<ActionLogEntry[]>(initialEntries);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const stored = readEntries(applicationId);
    setEntries(stored ?? initialEntries);
  }, [applicationId, initialEntries, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isClearing) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClearing, isOpen, onClose]);

  const handleClear = async () => {
    if (entries.length === 0 || isClearing) return;
    setIsClearing(true);
    try {
      setEntries([]);
      writeEntries(applicationId, []);
      await onClear?.();
    } finally {
      setIsClearing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[#24292f]/60 px-4 py-8 backdrop-blur-sm dark:bg-black/70 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isClearing) onClose();
      }}
    >
      <section
        aria-labelledby="history-modal-title"
        aria-modal="true"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[#d0d7de] bg-white text-[#24292f] shadow-2xl dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-[#d8dee4] px-5 py-4 dark:border-[#444c56] sm:px-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-md bg-[#f6f8fa] p-2 text-[#57606a] dark:bg-[#2d333b] dark:text-[#768390]"><History className="h-4 w-4" /></span>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#57606a] dark:text-[#768390]">Activity</p>
              <h2 id="history-modal-title" className="text-lg font-semibold tracking-tight">{programName ? `${programName} history` : "Action history"}</h2>
              <p className="mt-1 text-sm text-[#57606a] dark:text-[#768390]">A local timeline of updates made to this application.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close action history dialog" className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:text-[#768390] dark:hover:bg-[#2d333b] dark:hover:text-[#adbac7]"><X className="h-5 w-5" /></button>
        </header>

        <div className="max-h-[58vh] overflow-y-auto px-5 py-5 sm:px-6">
          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#d0d7de] px-5 py-10 text-center dark:border-[#444c56]">
              <History className="mx-auto h-6 w-6 text-[#8c959f] dark:text-[#636e7b]" />
              <p className="mt-3 text-sm font-medium">No activity recorded</p>
              <p className="mt-1 text-xs text-[#57606a] dark:text-[#768390]">Material, LOR, and status changes will appear here.</p>
            </div>
          ) : (
            <ol className="relative ml-2 border-l border-[#d8dee4] dark:border-[#444c56]">
              {entries.map((entry) => {
                const Icon = iconForAction(entry.action);
                return (
                  <li key={entry.id} className="relative pl-7 pb-5 last:pb-0">
                    <span className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-[#d0d7de] bg-white text-[#57606a] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#768390]"><Icon className="h-3.5 w-3.5" /></span>
                    <p className="text-sm font-semibold">{entry.action}</p>
                    {entry.description && <p className="mt-0.5 text-sm text-[#57606a] dark:text-[#768390]">{entry.description}</p>}
                    <time className="mt-1 block text-xs text-[#8c959f] dark:text-[#636e7b] date" dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-[#d8dee4] px-5 py-4 dark:border-[#444c56] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button type="button" onClick={() => void handleClear()} disabled={entries.length === 0 || isClearing} className="inline-flex items-center gap-2 self-start rounded-md px-2 py-1.5 text-xs font-semibold text-[#cf222e] transition hover:bg-[#ffebe9] focus:outline-none focus:ring-2 focus:ring-[#cf222e] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#f47067] dark:hover:bg-[#3b2225]"><Trash2 className="h-3.5 w-3.5" />Clear history</button>
          <button type="button" onClick={onClose} className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold text-[#24292f] transition hover:bg-[#f6f8fa] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7] dark:hover:bg-[#373e47]">Done</button>
        </footer>
      </section>
    </div>
  );
}

export default ActionHistoryModal;
