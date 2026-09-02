"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  Check,
  FileText,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

export const MATERIAL_TYPES = [
  "Personal Statement",
  "Transcript",
  "CV",
  "CASPer Score",
  "Essay Draft",
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];
export type MaterialSource = "text" | "link" | "upload";
export type MaterialStatus = "Draft" | "Ready" | "Submitted";

/**
 * The shape is intentionally serializable so it can be mirrored to localStorage
 * or sent to a GitHub-backed action without coupling this modal to a transport.
 */
export interface MaterialItem {
  id: string;
  type: MaterialType;
  name: string;
  status: MaterialStatus;
  source: MaterialSource;
  url?: string;
  notes?: string;
  fileName?: string;
  updatedAt: string;
}

export interface MaterialsModalProps {
  isOpen: boolean;
  applicationId: string;
  programName?: string;
  initialMaterials?: MaterialItem[];
  onClose: () => void;
  onSave?: (materials: MaterialItem[]) => void | Promise<void>;
}

const STORAGE_PREFIX = "smp-tracker:materials:";

function readMaterials(applicationId: string): MaterialItem[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${applicationId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as MaterialItem[]) : null;
  } catch {
    return null;
  }
}

function writeMaterials(applicationId: string, materials: MaterialItem[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${applicationId}`,
      JSON.stringify(materials),
    );
  } catch {
    // A browser can reject storage (private mode or a full quota). The parent
    // callback still receives the updated in-memory collection.
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `material-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated just now";
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)}`;
}

function sourceLabel(source: MaterialSource) {
  if (source === "upload") return "Uploaded file";
  if (source === "link") return "External link";
  return "Saved text";
}

export function MaterialsModal({
  isOpen,
  applicationId,
  programName,
  initialMaterials = [],
  onClose,
  onSave,
}: MaterialsModalProps) {
  const [materials, setMaterials] = useState<MaterialItem[]>(initialMaterials);
  const [selectedType, setSelectedType] = useState<MaterialType>(MATERIAL_TYPES[0]);
  const [activeType, setActiveType] = useState<MaterialType | "All">("All");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [source, setSource] = useState<MaterialSource>("link");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<MaterialStatus>("Draft");
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const stored = readMaterials(applicationId);
    setMaterials(stored ?? initialMaterials);
  }, [applicationId, initialMaterials, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  const visibleMaterials = useMemo(
    () =>
      activeType === "All"
        ? materials
        : materials.filter((material) => material.type === activeType),
    [activeType, materials],
  );

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setSelectedType(MATERIAL_TYPES[0]);
    setSource("link");
    setName("");
    setUrl("");
    setNotes("");
    setStatus("Draft");
    setFile(null);
    setFileError("");
  };

  const startEditing = (material: MaterialItem) => {
    setIsAdding(true);
    setEditingId(material.id);
    setSelectedType(material.type);
    setSource(material.source);
    setName(material.name);
    setUrl(material.url ?? "");
    setNotes(material.notes ?? "");
    setStatus(material.status);
    setFile(material.fileName && material.url?.startsWith("data:")
      ? { name: material.fileName, dataUrl: material.url }
      : null);
    setFileError("");
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const pickedFile = event.target.files?.[0];
    if (!pickedFile) return;

    setFileError("");
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFile({ name: pickedFile.name, dataUrl: reader.result });
      } else {
        setFileError("That file could not be read. Try another file.");
      }
    };
    reader.onerror = () => setFileError("That file could not be read. Try another file.");
    reader.readAsDataURL(pickedFile);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) return;
    if (source === "link" && !url.trim()) return;
    if (source === "upload" && !file && !url) {
      setFileError("Choose a file before saving this material.");
      return;
    }

    const existing = editingId ? materials.find((item) => item.id === editingId) : undefined;
    const nextMaterial: MaterialItem = {
      id: editingId ?? createId(),
      type: selectedType,
      name: trimmedName,
      status,
      source,
      url:
        source === "upload"
          ? file?.dataUrl ?? existing?.url
          : source === "link"
            ? url.trim()
            : undefined,
      notes: notes.trim() || undefined,
      fileName: source === "upload" ? file?.name ?? existing?.fileName : undefined,
      updatedAt: new Date().toISOString(),
    };
    const nextMaterials = editingId
      ? materials.map((item) => (item.id === editingId ? nextMaterial : item))
      : [nextMaterial, ...materials];

    setIsSaving(true);
    try {
      writeMaterials(applicationId, nextMaterials);
      setMaterials(nextMaterials);
      await onSave?.(nextMaterials);
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const nextMaterials = materials.filter((material) => material.id !== id);
    setMaterials(nextMaterials);
    writeMaterials(applicationId, nextMaterials);
    await onSave?.(nextMaterials);
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
        aria-labelledby="materials-modal-title"
        aria-modal="true"
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-[#d0d7de] bg-white text-[#24292f] shadow-2xl dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-[#d8dee4] px-5 py-4 dark:border-[#444c56] sm:px-6">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#57606a] dark:text-[#768390]">
              Application materials
            </p>
            <h2 id="materials-modal-title" className="text-lg font-semibold tracking-tight">
              {programName ? `Materials for ${programName}` : "Manage materials"}
            </h2>
            <p className="mt-1 text-sm text-[#57606a] dark:text-[#768390]">
              Keep drafts, links, and upload references in one checklist.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close materials dialog"
            className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:text-[#768390] dark:hover:bg-[#2d333b] dark:hover:text-[#adbac7]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="border-b border-[#d8dee4] px-5 py-3 dark:border-[#444c56] sm:px-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Material type filter">
            {(["All", ...MATERIAL_TYPES] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={activeType === type}
                onClick={() => setActiveType(type)}
                className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-[#0969da] ${
                  activeType === type
                    ? "border-[#0969da]/40 bg-[#ddf4ff] text-[#0969da] dark:border-[#539bf5]/40 dark:bg-[#1f3b53] dark:text-[#539bf5]"
                    : "border-[#d0d7de] bg-white text-[#57606a] hover:bg-[#f6f8fa] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#768390] dark:hover:bg-[#2d333b]"
                }`}
              >
                {type}
                {type !== "All" && (
                  <span className="ml-1.5 tabular-nums text-[10px] opacity-70">
                    {materials.filter((material) => material.type === type).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-5 sm:px-6">
          {visibleMaterials.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#d0d7de] px-5 py-10 text-center dark:border-[#444c56]">
              <Paperclip className="mx-auto h-6 w-6 text-[#8c959f] dark:text-[#636e7b]" />
              <p className="mt-3 text-sm font-medium">No materials here yet</p>
              <p className="mt-1 text-xs text-[#57606a] dark:text-[#768390]">
                Add a link, a text draft, or a file reference to get started.
              </p>
            </div>
          ) : (
            <ul className="space-y-2" aria-label="Saved materials">
              {visibleMaterials.map((material) => (
                <li
                  key={material.id}
                  className="group flex flex-col gap-3 rounded-lg border border-[#d8dee4] px-3.5 py-3 transition hover:border-[#8c959f] dark:border-[#444c56] dark:hover:border-[#768390] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{material.name}</span>
                      <span className="rounded-md bg-[#f6f8fa] px-1.5 py-0.5 text-[10px] font-medium text-[#57606a] dark:bg-[#2d333b] dark:text-[#768390]">
                        {material.type}
                      </span>
                      <span className="rounded-md border border-[#d0d7de] px-1.5 py-0.5 text-[10px] font-medium text-[#57606a] dark:border-[#444c56] dark:text-[#768390]">
                        {material.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#57606a] dark:text-[#768390]">
                      {material.source === "link" ? <Link2 className="h-3.5 w-3.5" /> : material.source === "upload" ? <Upload className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                      <span>{sourceLabel(material.source)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatUpdatedAt(material.updatedAt)}</span>
                      {material.notes && <><span aria-hidden="true">·</span><span className="max-w-[34ch] truncate">{material.notes}</span></>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    {material.url && (
                      <a
                        href={material.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md px-2 py-1.5 text-xs font-medium text-[#0969da] transition hover:bg-[#ddf4ff] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:text-[#539bf5] dark:hover:bg-[#1f3b53]"
                      >
                        Open
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => startEditing(material)}
                      aria-label={`Edit ${material.name}`}
                      className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:text-[#768390] dark:hover:bg-[#2d333b] dark:hover:text-[#adbac7]"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(material.id)}
                      aria-label={`Delete ${material.name}`}
                      className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#ffebe9] hover:text-[#cf222e] focus:outline-none focus:ring-2 focus:ring-[#cf222e] dark:text-[#768390] dark:hover:bg-[#3b2225] dark:hover:text-[#f47067]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isAdding ? (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4 rounded-lg border border-[#d0d7de] bg-[#f6f8fa]/70 p-4 dark:border-[#444c56] dark:bg-[#2d333b]/55">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{editingId ? "Edit material" : "Add material"}</h3>
                <button type="button" onClick={resetForm} className="text-xs font-medium text-[#57606a] hover:text-[#24292f] dark:text-[#768390] dark:hover:text-[#adbac7]">
                  Cancel
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Material type
                  <select
                    value={selectedType}
                    onChange={(event) => setSelectedType(event.target.value as MaterialType)}
                    className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
                  >
                    {MATERIAL_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Main statement — v3"
                    required
                    className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Status
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as MaterialStatus)}
                    className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
                  >
                    <option>Draft</option>
                    <option>Ready</option>
                    <option>Submitted</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Save as
                  <select
                    value={source}
                    onChange={(event) => {
                      setSource(event.target.value as MaterialSource);
                      setFileError("");
                    }}
                    className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
                  >
                    <option value="link">External link</option>
                    <option value="text">Text draft</option>
                    <option value="upload">Upload a file</option>
                  </select>
                </label>
              </div>
              {source === "link" && (
                <label className="block text-xs font-semibold">
                  Link
                  <input
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://drive.google.com/..."
                    required
                    className="mt-1.5 block w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
                  />
                </label>
              )}
              {source === "upload" && (
                <div>
                  <label className="block text-xs font-semibold">
                    File
                    <input
                      type="file"
                      onChange={handleFileChange}
                      className="mt-1.5 block w-full cursor-pointer rounded-md border border-[#d0d7de] bg-white text-sm text-[#57606a] file:mr-3 file:border-0 file:border-r file:border-[#d0d7de] file:bg-[#f6f8fa] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#24292f] dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#768390] dark:file:border-[#444c56] dark:file:bg-[#2d333b] dark:file:text-[#adbac7]"
                    />
                  </label>
                  {file && <p className="mt-1.5 text-xs text-[#57606a] dark:text-[#768390]">Selected: {file.name}</p>}
                  {fileError && <p className="mt-1.5 text-xs text-[#cf222e] dark:text-[#f47067]">{fileError}</p>}
                </div>
              )}
              {source === "text" && (
                <label className="block text-xs font-semibold">
                  Draft text
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={5}
                    placeholder="Paste the draft or a short note about where it lives."
                    className="mt-1.5 block w-full resize-y rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
                  />
                </label>
              )}
              {source !== "text" && (
                <label className="block text-xs font-semibold">
                  Notes <span className="font-normal text-[#57606a] dark:text-[#768390]">(optional)</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={2}
                    placeholder="What still needs attention?"
                    className="mt-1.5 block w-full resize-y rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-normal text-[#24292f] outline-none placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 dark:border-[#444c56] dark:bg-[#22272e] dark:text-[#adbac7]"
                  />
                </label>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1a7f37] focus:outline-none focus:ring-2 focus:ring-[#1f883d] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#347d39] dark:hover:bg-[#46954a]"
                >
                  {isSaving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Check className="h-4 w-4" />}
                  {editingId ? "Save material" : "Add material"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-md border border-dashed border-[#8c959f] px-3 py-2 text-sm font-semibold text-[#0969da] transition hover:border-[#0969da] hover:bg-[#ddf4ff] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#636e7b] dark:text-[#539bf5] dark:hover:border-[#539bf5] dark:hover:bg-[#1f3b53]"
            >
              <Plus className="h-4 w-4" />
              Add material
            </button>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-[#d8dee4] px-5 py-4 dark:border-[#444c56] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-[#57606a] dark:text-[#768390]">
            {materials.length} {materials.length === 1 ? "item" : "items"} · saved on this device
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold text-[#24292f] transition hover:bg-[#f6f8fa] focus:outline-none focus:ring-2 focus:ring-[#0969da] dark:border-[#444c56] dark:bg-[#2d333b] dark:text-[#adbac7] dark:hover:bg-[#373e47]"
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

export default MaterialsModal;
