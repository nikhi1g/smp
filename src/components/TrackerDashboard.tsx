"use client";

import { useState } from "react";
import { Application, ApplicationStatus } from "@/types/application";
import { upsertApplicationAction, deleteApplicationAction } from "@/app/actions";
import { 
  Plus, 
  ExternalLink, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  School, 
  Calendar,
  Database
} from "lucide-react";

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  Researching: "bg-slate-100 text-slate-700 border-slate-300",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Submitted: "bg-amber-50 text-amber-700 border-amber-200",
  "Interview Offered": "bg-purple-50 text-purple-700 border-purple-200",
  Accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Waitlisted: "bg-orange-50 text-orange-700 border-orange-200",
  Rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

interface Props {
  initialApplications: Application[];
  source: "google_sheets" | "local_fallback";
}

export function TrackerDashboard({ initialApplications, source }: Props) {
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isPending, setIsPending] = useState<boolean>(false);

  const filteredApps = initialApplications.filter((app) => {
    if (filterStatus === "ALL") return true;
    return app.status === filterStatus;
  });

  const stats = {
    total: initialApplications.length,
    submitted: initialApplications.filter((a) => a.status === "Submitted").length,
    interviews: initialApplications.filter((a) => a.status === "Interview Offered").length,
    accepted: initialApplications.filter((a) => a.status === "Accepted").length,
  };

  const handleOpenAdd = () => {
    setEditingApp(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (app: Application) => {
    setEditingApp(app);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this program?")) return;
    setIsPending(true);
    try {
      await deleteApplicationAction(id);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-6 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Special Master&apos;s Programs Tracker
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                source === "google_sheets"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-amber-50 text-amber-800 border-amber-300"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              {source === "google_sheets" ? "Live Google Sheets" : "Local Demo Storage"}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track SMP admissions, deadlines, MCAT/GPA cutoffs, essays, and recommendation letters.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Add Program
        </button>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Tracked</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted</span>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.submitted}</p>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Interviews</span>
          <p className="text-2xl font-bold text-purple-600 mt-1">{stats.interviews}</p>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Accepted</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.accepted}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {["ALL", "Researching", "In Progress", "Submitted", "Interview Offered", "Accepted", "Waitlisted", "Rejected"].map(
          (status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                filterStatus === status
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {status}
            </button>
          )
        )}
      </div>

      {/* Table List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Program & University</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Deadline</th>
                <th className="px-4 py-3.5">Checklist</th>
                <th className="px-4 py-3.5">Reqs (GPA/MCAT)</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No programs found. Click &quot;Add Program&quot; to get started.
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 text-base">{app.programName}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <School className="w-3.5 h-3.5" />
                        <span>{app.university}</span>
                        <span>•</span>
                        <span>{app.degreeType}</span>
                      </div>
                      {app.notes && (
                        <div className="mt-1.5 text-xs text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100 max-w-md">
                          {app.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          STATUS_COLORS[app.status] || "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {app.deadline}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            app.transcriptsSent ? "text-emerald-700" : "text-slate-400"
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Transcripts
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            app.lorsRequested ? "text-emerald-700" : "text-slate-400"
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Letters of Rec
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            app.essayCompleted ? "text-emerald-700" : "text-slate-400"
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Essays
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-xs">
                      <div className="text-slate-700">GPA: {app.gpaRequirement || "None"}</div>
                      <div className="text-slate-700">MCAT: {app.mcatRequirement || "None"}</div>
                      {app.appFee && <div className="text-slate-500">Fee: {app.appFee}</div>}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {app.portalUrl && (
                          <a
                            href={app.portalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                            title="Open Application Portal"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => handleOpenEdit(app)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition"
                          title="Edit Program"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(app.id)}
                          disabled={isPending}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                          title="Delete Program"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              {editingApp ? "Edit Program" : "Add Special Master's Program"}
            </h2>

            <form
              action={async (formData) => {
                setIsPending(true);
                try {
                  const res = await upsertApplicationAction(formData);
                  if (res.success) {
                    setIsModalOpen(false);
                  } else {
                    alert("Validation error. Please check form fields.");
                  }
                } finally {
                  setIsPending(false);
                }
              }}
              className="space-y-4"
            >
              {editingApp && <input type="hidden" name="id" value={editingApp.id} />}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Program Name *</label>
                  <input
                    type="text"
                    name="programName"
                    required
                    defaultValue={editingApp?.programName || ""}
                    placeholder="e.g. M.S. in Physiology"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">University *</label>
                  <input
                    type="text"
                    name="university"
                    required
                    defaultValue={editingApp?.university || ""}
                    placeholder="e.g. Georgetown University"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editingApp?.status || "Researching"}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    <option value="Researching">Researching</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Interview Offered">Interview Offered</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Waitlisted">Waitlisted</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Deadline *</label>
                  <input
                    type="date"
                    name="deadline"
                    required
                    defaultValue={editingApp?.deadline || ""}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Degree Type</label>
                  <input
                    type="text"
                    name="degreeType"
                    defaultValue={editingApp?.degreeType || "MS / SMP"}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">GPA Req</label>
                  <input
                    type="text"
                    name="gpaRequirement"
                    defaultValue={editingApp?.gpaRequirement || ""}
                    placeholder="3.0+"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">MCAT Req</label>
                  <input
                    type="text"
                    name="mcatRequirement"
                    defaultValue={editingApp?.mcatRequirement || ""}
                    placeholder="500+"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">App Fee</label>
                  <input
                    type="text"
                    name="appFee"
                    defaultValue={editingApp?.appFee || ""}
                    placeholder="$80"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Application Portal URL</label>
                <input
                  type="url"
                  name="portalUrl"
                  defaultValue={editingApp?.portalUrl || ""}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Checkboxes */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                <span className="block text-xs font-semibold text-slate-700">Requirement Checklist</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      name="transcriptsSent"
                      defaultChecked={editingApp?.transcriptsSent}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Transcripts Sent
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      name="lorsRequested"
                      defaultChecked={editingApp?.lorsRequested}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    LORs Requested
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      name="essayCompleted"
                      defaultChecked={editingApp?.essayCompleted}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Essay Completed
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes & Program Highlights</label>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={editingApp?.notes || ""}
                  placeholder="Linkage terms, committee letter deadlines, interview impressions..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Program"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
