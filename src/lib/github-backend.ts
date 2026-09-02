import {
  ActionLogEntry,
  ActionLogEntrySchema,
  Application,
  ApplicationInput,
  ApplicationSchema,
  ApplicationStatus,
  LORRequest,
  LORRequestSchema,
  MaterialItem,
  MaterialItemSchema,
} from "@/types/application";

export const APPLICATION_STORAGE_KEY = "smp-applications";
export const APPLICATION_EXPORT_VERSION = 1;
export const DEFAULT_GITHUB_DATA_PATH = "data/applications.json";
export const DEFAULT_GITHUB_ISSUE_LABEL = "smp-application";

export type GitHubDataSource = "issues" | "content" | "auto";
export type SyncDirection = "pull" | "push" | "both";

/**
 * Narrow Octokit surface accepted by the backend. Passing an existing Octokit
 * client avoids exposing a PAT in a browser while retaining the same REST API.
 */
export interface GitHubOctokitClient {
  request<T>(
    route: string,
    parameters?: Record<string, unknown>,
  ): Promise<{ data: T }>;
}

export interface GitHubBackendConfig {
  /** GitHub repository in `owner/name` form. */
  repo?: string;
  /** A PAT with repository issue/content/workflow permissions. */
  token?: string;
  /** GitHub API origin; useful for tests or GitHub Enterprise. */
  apiBaseUrl?: string;
  /** Use issues by default, or a JSON file in repository contents. */
  source?: GitHubDataSource;
  /** Optional Octokit REST client for server-side or injected integrations. */
  octokit?: GitHubOctokitClient;
  /** Repository path used when source is `content` or `auto`. */
  dataPath?: string;
  /** Branch/ref used by content updates and workflow dispatches. */
  branch?: string;
  /** Label used to identify application issues. */
  issueLabel?: string;
  /** Optional workflow file name or id to dispatch after a write. */
  workflow?: string;
  /** Workflow ref, defaulting to `branch` or `main`. */
  workflowRef?: string;
  /** Additional workflow inputs. */
  workflowInputs?: Record<string, string>;
  /** localStorage key, primarily useful for multiple profiles or tests. */
  storageKey?: string;
  /** Pull by default; set push/both to write fetched data back to GitHub. */
  direction?: SyncDirection;
  /** Commit the JSON file when pushing and dataPath is configured. */
  persistContent?: boolean;
  /** Surface an optional GitHub failure instead of retaining local data. */
  throwOnRemoteError?: boolean;
}

export interface ApplicationExport {
  version: typeof APPLICATION_EXPORT_VERSION;
  exportedAt: string;
  applications: Application[];
}

export interface GitHubSyncResult {
  applications: Application[];
  source: "local" | "github" | "merged";
  remoteAvailable: boolean;
  remoteError?: string;
}

export interface GitHubCommitResult {
  path: string;
  contentSha?: string;
  commitSha?: string;
}

export type ActionLogInput = Omit<ActionLogEntry, "id" | "timestamp" | "metadata"> &
  Partial<Pick<ActionLogEntry, "id" | "timestamp" | "metadata">>;

interface GitHubIssue {
  number: number;
  title?: string;
  body?: string | null;
  state?: string;
  pull_request?: unknown;
}

interface GitHubContent {
  content?: string;
  encoding?: string;
  sha?: string;
}

interface GitHubCommitResponse {
  content?: { sha?: string };
  commit?: { sha?: string };
}

interface ResolvedGitHubConfig extends GitHubBackendConfig {
  apiBaseUrl: string;
  issueLabel: string;
  source: GitHubDataSource;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class GitHubBackendError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "GitHubBackendError";
    this.status = status;
    this.details = details;
  }
}

function env(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  return process.env[name] || undefined;
}

function resolveConfig(config: GitHubBackendConfig = {}): ResolvedGitHubConfig {
  return {
    ...config,
    repo: config.repo ?? env("NEXT_PUBLIC_GITHUB_REPO") ?? env("GITHUB_REPO") ?? env("GITHUB_REPOSITORY"),
    token: config.token ?? env("NEXT_PUBLIC_GITHUB_TOKEN") ?? env("GITHUB_TOKEN"),
    apiBaseUrl: (config.apiBaseUrl ?? env("NEXT_PUBLIC_GITHUB_API_URL") ?? "https://api.github.com").replace(/\/$/, ""),
    issueLabel: config.issueLabel ?? DEFAULT_GITHUB_ISSUE_LABEL,
    source: config.source ?? (config.dataPath ? "content" : "issues"),
  };
}

function getStorage(): StorageLike | null {
  try {
    const candidate = (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
    if (candidate && typeof candidate.getItem === "function" && typeof candidate.setItem === "function") {
      return candidate;
    }
  } catch {
    // Access to localStorage can be denied in private browsing or server rendering.
  }
  return null;
}

function now(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to a non-cryptographic id for older browsers.
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeApplication(application: Application): Application {
  return {
    ...application,
    materials: application.materials ?? [],
    lorRequests: application.lorRequests ?? [],
    actionLog: application.actionLog ?? [],
  };
}

function parseApplication(value: unknown): Application | null {
  const parsed = ApplicationSchema.safeParse(value);
  return parsed.success ? normalizeApplication(parsed.data) : null;
}

function parseApplicationList(value: unknown): Application[] {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.applications)
      ? value.applications
      : [];
  return list.flatMap((item) => {
    const parsed = parseApplication(item);
    return parsed ? [parsed] : [];
  });
}

function parseApplicationListStrict(value: unknown): Application[] {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.applications)
      ? value.applications
      : null;
  if (!list) throw new Error("Application import must be an array or an export object");

  const parsed = list.map((item) => ApplicationSchema.parse(item));
  return parsed.map(normalizeApplication);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLocalApplications(storageKey = APPLICATION_STORAGE_KEY): Application[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    return parseApplicationList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeLocalApplications(applications: Application[], storageKey = APPLICATION_STORAGE_KEY): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(storageKey, JSON.stringify(applications));
  } catch {
    // A full or unavailable browser store should not prevent an optional remote sync.
  }
}

function prepareApplication(input: Application | ApplicationInput): Application {
  return normalizeApplication(
    ApplicationSchema.parse({
      ...input,
      id: input.id || createId("app"),
      updatedAt: now(),
      materials: input.materials ?? [],
      lorRequests: input.lorRequests ?? [],
      actionLog: input.actionLog ?? [],
    }),
  );
}

function upsertLocalApplication(application: Application, storageKey: string): Application {
  const applications = readLocalApplications(storageKey);
  const index = applications.findIndex((item) => item.id === application.id);
  if (index === -1) applications.push(application);
  else applications[index] = application;
  writeLocalApplications(applications, storageKey);
  return application;
}

function findLocalApplication(applicationId: string, storageKey: string): Application | undefined {
  return readLocalApplications(storageKey).find((application) => application.id === applicationId);
}

function mergeApplications(local: Application[], remote: Application[]): Application[] {
  const merged = new Map<string, Application>();
  for (const application of local) merged.set(application.id, application);

  for (const application of remote) {
    const current = merged.get(application.id);
    if (!current || Date.parse(application.updatedAt) >= Date.parse(current.updatedAt)) {
      merged.set(application.id, application);
    }
  }

  return [...merged.values()].sort((a, b) => a.programName.localeCompare(b.programName));
}

function repositoryParts(repo: string | undefined): { owner: string; name: string } | null {
  if (!repo) return null;
  const normalized = repo
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "");
  const [owner, name, ...extra] = normalized.split("/");
  return owner && name && extra.length === 0 ? { owner, name } : null;
}

function repositoryApiPath(config: ResolvedGitHubConfig): string {
  const repository = repositoryParts(config.repo);
  if (!repository) throw new GitHubBackendError("GitHub repo must use owner/name form");
  return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
}

async function githubRequest<T>(
  path: string,
  config: ResolvedGitHubConfig,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const method = init.method || "GET";
  if (config.octokit) {
    const parameters: Record<string, unknown> = { headers };
    if (init.body) {
      try {
        parameters.data = JSON.parse(String(init.body));
      } catch {
        parameters.data = init.body;
      }
    }
    const response = await config.octokit.request<T>(`${method} ${path}`, parameters);
    return response.data;
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    try {
      body = await response.text();
    } catch {
      body = undefined;
    }
  }

  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === "string" ? body.message : response.statusText;
    throw new GitHubBackendError(message || `GitHub request failed (${response.status})`, response.status, body);
  }
  return body as T;
}

function applicationIssueBody(application: Application): string {
  return `<!-- smp-application:${application.id} -->\n${JSON.stringify(application, null, 2)}\n`;
}

function applicationFromIssue(issue: GitHubIssue): Application | null {
  if (issue.pull_request) return null;
  const body = issue.body ?? "";
  const marker = body.match(/<!--\s*smp-application:[^>]+-->/i);
  const candidate = marker ? body.slice((marker.index ?? 0) + marker[0].length).trim() : body.trim();
  if (!candidate) return null;

  try {
    const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const parsed = JSON.parse(fenced ? fenced[1].trim() : candidate) as unknown;
    return parseApplication(parsed);
  } catch {
    return null;
  }
}

async function listApplicationIssues(config: ResolvedGitHubConfig): Promise<GitHubIssue[]> {
  const label = encodeURIComponent(config.issueLabel);
  const issues = await githubRequest<GitHubIssue[]>(
    `${repositoryApiPath(config)}/issues?state=all&labels=${label}&per_page=100`,
    config,
  );
  return Array.isArray(issues) ? issues.filter((issue) => !issue.pull_request) : [];
}
async function fetchFromIssues(config: ResolvedGitHubConfig): Promise<Application[]> {
  const issues = await listApplicationIssues(config);
  return issues.flatMap((issue) => {
    if (issue.state?.toLowerCase() === "closed") return [];
    const application = applicationFromIssue(issue);
    return application ? [application] : [];
  });
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function fetchFromContent(config: ResolvedGitHubConfig): Promise<Application[]> {
  const dataPath = config.dataPath || DEFAULT_GITHUB_DATA_PATH;
  const ref = config.branch ? `?ref=${encodeURIComponent(config.branch)}` : "";
  const payload = await githubRequest<GitHubContent | string>(
    `${repositoryApiPath(config)}/contents/${dataPath.split("/").map(encodeURIComponent).join("/")}${ref}`,
    config,
  );
  const raw = typeof payload === "string" ? payload : payload.encoding === "base64" && payload.content ? decodeBase64(payload.content) : payload.content;
  if (!raw) return [];

  try {
    return parseApplicationList(JSON.parse(raw));
  } catch {
    throw new GitHubBackendError("GitHub application data is not valid JSON");
  }
}

async function fetchRemoteApplications(config: ResolvedGitHubConfig): Promise<Application[]> {
  if (config.source === "content") return fetchFromContent(config);
  if (config.source === "issues") return fetchFromIssues(config);

  try {
    return await fetchFromContent(config);
  } catch (error) {
    if (error instanceof GitHubBackendError && error.status && error.status !== 404) throw error;
    return fetchFromIssues(config);
  }
}

async function upsertApplicationIssue(application: Application, config: ResolvedGitHubConfig): Promise<void> {
  const issues = await listApplicationIssues(config);
  const existing = issues.find((issue) => {
    const parsed = applicationFromIssue(issue);
    return parsed?.id === application.id || issue.title?.endsWith(`(${application.id})`);
  });
  const body = JSON.stringify({
    title: `[SMP] ${application.programName} (${application.id})`,
    body: applicationIssueBody(application),
    labels: [config.issueLabel],
  });

  if (existing) {
    await githubRequest<GitHubIssue>(`${repositoryApiPath(config)}/issues/${existing.number}`, config, {
      method: "PATCH",
      body,
    });
  } else {
    await githubRequest<GitHubIssue>(`${repositoryApiPath(config)}/issues`, config, {
      method: "POST",
      body,
    });
  }
}

async function closeApplicationIssue(applicationId: string, config: ResolvedGitHubConfig): Promise<void> {
  const issues = await listApplicationIssues(config);
  const existing = issues.find((issue) => {
    const parsed = applicationFromIssue(issue);
    return parsed?.id === applicationId || issue.title?.endsWith(`(${applicationId})`);
  });
  if (!existing) return;

  await githubRequest<GitHubIssue>(`${repositoryApiPath(config)}/issues/${existing.number}`, config, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

async function dispatchWorkflow(
  config: ResolvedGitHubConfig,
  applications: Application[],
): Promise<void> {
  if (!config.workflow) return;
  const ref = config.workflowRef || config.branch || "main";
  const inputs = {
    ...(config.workflowInputs ?? {}),
    applications: JSON.stringify(applications),
  };
  await githubRequest<unknown>(
    `${repositoryApiPath(config)}/actions/workflows/${encodeURIComponent(config.workflow)}/dispatches`,
    config,
    {
      method: "POST",
      body: JSON.stringify({ ref, inputs }),
    },
  );
}

async function persistRemoteApplications(
  applications: Application[],
  config: ResolvedGitHubConfig,
): Promise<void> {
  if (!config.token && !config.octokit) {
    throw new GitHubBackendError("A GitHub token or Octokit client is required to save applications");
  }

  if (
    config.source === "content" ||
    (config.source === "auto" && config.dataPath) ||
    (config.persistContent && config.dataPath)
  ) {
    await commitApplications(applications, config);
  } else {
    for (const application of applications) await upsertApplicationIssue(application, config);
  }
  await dispatchWorkflow(config, applications);
}

async function getApplicationForUpdate(
  applicationId: string,
  config: ResolvedGitHubConfig,
): Promise<Application> {
  const local = findLocalApplication(applicationId, config.storageKey || APPLICATION_STORAGE_KEY);
  if (local) return local;

  const fetched = await fetchRemoteApplications(config);
  const application = fetched.find((item) => item.id === applicationId);
  if (!application) throw new Error(`Application not found: ${applicationId}`);
  writeLocalApplications(fetched, config.storageKey || APPLICATION_STORAGE_KEY);
  return application;
}

function parseMaterials(materials: MaterialItem[]): MaterialItem[] {
  return materials.map((material) => MaterialItemSchema.parse(material));
}

function parseLORRequests(requests: LORRequest[]): LORRequest[] {
  return requests.map((request) => LORRequestSchema.parse(request));
}

function parseActionLogEntry(entry: ActionLogInput): ActionLogEntry {
  return ActionLogEntrySchema.parse({
    ...entry,
    id: entry.id || createId("action"),
    timestamp: entry.timestamp || now(),
  });
}

function appendAction(application: Application, entry: ActionLogInput): Application {
  return {
    ...application,
    actionLog: [...(application.actionLog ?? []), parseActionLogEntry(entry)],
  };
}

/** Read local data, falling back to local data when GitHub is not configured or unavailable. */
export async function fetchApplications(config: GitHubBackendConfig = {}): Promise<Application[]> {
  const resolved = resolveConfig(config);
  const storageKey = resolved.storageKey || APPLICATION_STORAGE_KEY;
  const local = readLocalApplications(storageKey);
  if (!repositoryParts(resolved.repo)) return local;

  try {
    const remote = await fetchRemoteApplications(resolved);
    if (remote.length > 0) writeLocalApplications(remote, storageKey);
    return remote.length > 0 ? remote : local;
  } catch (error) {
    if (resolved.throwOnRemoteError) throw error;
    return local;
  }
}

/** Upsert one application locally first, then optionally mirror it to GitHub. */
export async function saveApplication(
  input: Application | ApplicationInput,
  config: GitHubBackendConfig = {},
): Promise<Application> {
  const resolved = resolveConfig(config);
  const application = prepareApplication(input);
  const saved = upsertLocalApplication(application, resolved.storageKey || APPLICATION_STORAGE_KEY);

  if (resolved.repo && (resolved.token || resolved.octokit)) {
    try {
      await persistRemoteApplications([saved], resolved);
    } catch (error) {
      if (resolved.throwOnRemoteError) throw error;
    }
  }
  return saved;
}

/** Remove an application locally and close its issue or rewrite its content record. */
export async function deleteApplication(
  applicationId: string,
  config: GitHubBackendConfig = {},
): Promise<boolean> {
  const resolved = resolveConfig(config);
  const storageKey = resolved.storageKey || APPLICATION_STORAGE_KEY;
  const applications = readLocalApplications(storageKey);
  const remaining = applications.filter((application) => application.id !== applicationId);
  if (remaining.length === applications.length) return false;

  writeLocalApplications(remaining, storageKey);
  if (resolved.repo && (resolved.token || resolved.octokit)) {
    try {
      if (
        resolved.source === "content" ||
        (resolved.source === "auto" && resolved.dataPath) ||
        (resolved.persistContent && resolved.dataPath)
      ) {
        await commitApplications(remaining, resolved);
      } else {
        await closeApplicationIssue(applicationId, resolved);
      }
      await dispatchWorkflow(resolved, remaining);
    } catch (error) {
      if (resolved.throwOnRemoteError) throw error;
    }
  }
  return true;
}

/** Replace the material checklist for one application and record the change. */
export async function updateMaterials(
  applicationId: string,
  materials: MaterialItem[],
  config: GitHubBackendConfig = {},
): Promise<Application> {
  const resolved = resolveConfig(config);
  const application = await getApplicationForUpdate(applicationId, resolved);
  const updated = appendAction(
    { ...application, materials: parseMaterials(materials) },
    { action: "materials.updated", description: "Updated application materials" },
  );
  return saveApplication(updated, resolved);
}

/** Replace the recommendation-letter requests for one application and record the change. */
export async function updateLORRequests(
  applicationId: string,
  requests: LORRequest[],
  config: GitHubBackendConfig = {},
): Promise<Application> {
  const resolved = resolveConfig(config);
  const application = await getApplicationForUpdate(applicationId, resolved);
  const updated = appendAction(
    { ...application, lorRequests: parseLORRequests(requests) },
    { action: "lor-requests.updated", description: "Updated recommendation letter requests" },
  );
  return saveApplication(updated, resolved);
}

/** Transition an application's status and record the previous and next values. */
export async function updateApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
  config: GitHubBackendConfig = {},
): Promise<Application> {
  const resolved = resolveConfig(config);
  const application = await getApplicationForUpdate(applicationId, resolved);
  const updated = appendAction(
    { ...application, status },
    {
      action: "status.updated",
      description: `Status changed from ${application.status} to ${status}`,
      metadata: { from: application.status, to: status },
    },
  );
  return saveApplication(updated, resolved);
}

/** Add one event to an application's action history. */
export async function appendActionLog(
  applicationId: string,
  entry: ActionLogInput,
  config: GitHubBackendConfig = {},
): Promise<Application> {
  const resolved = resolveConfig(config);
  const application = await getApplicationForUpdate(applicationId, resolved);
  return saveApplication(appendAction(application, entry), resolved);
}

/** Pull, merge, and cache GitHub data. Set direction to push/both to write back. */
export async function syncApplications(config: GitHubBackendConfig = {}): Promise<Application[]> {
  const result = await syncApplicationsWithResult(config);
  return result.applications;
}

export async function syncApplicationsWithResult(
  config: GitHubBackendConfig = {},
): Promise<GitHubSyncResult> {
  const resolved = resolveConfig(config);
  const storageKey = resolved.storageKey || APPLICATION_STORAGE_KEY;
  const local = readLocalApplications(storageKey);
  if (!repositoryParts(resolved.repo)) {
    return { applications: local, source: "local", remoteAvailable: false };
  }

  let remote: Application[];
  try {
    remote = await fetchRemoteApplications(resolved);
  } catch (error) {
    if (resolved.throwOnRemoteError) throw error;
    return {
      applications: local,
      source: "local",
      remoteAvailable: false,
      remoteError: error instanceof Error ? error.message : "GitHub sync failed",
    };
  }

  const applications = mergeApplications(local, remote);
  writeLocalApplications(applications, storageKey);

  if ((resolved.direction === "push" || resolved.direction === "both") && resolved.token) {
    try {
      await persistRemoteApplications(applications, resolved);
    } catch (error) {
      if (resolved.throwOnRemoteError) throw error;
      return {
        applications,
        source: remote.length > 0 ? "merged" : "local",
        remoteAvailable: true,
        remoteError: error instanceof Error ? error.message : "GitHub push failed",
      };
    }
  }

  return {
    applications,
    source: remote.length > 0 ? (local.length > 0 ? "merged" : "github") : "local",
    remoteAvailable: true,
  };
}

/** Serialize applications as a versioned, portable JSON backup. */
export function exportApplications(applications?: Application[]): string {
  const normalized = (applications ?? readLocalApplications()).map(normalizeApplication);
  const payload: ApplicationExport = {
    version: APPLICATION_EXPORT_VERSION,
    exportedAt: now(),
    applications: normalized,
  };
  return JSON.stringify(payload, null, 2);
}

/** Validate and immediately restore a JSON backup into localStorage. */
export function importApplications(
  data: string | ApplicationExport,
  config: Pick<GitHubBackendConfig, "storageKey"> = {},
): Application[] {
  const value = typeof data === "string" ? (JSON.parse(data) as unknown) : data;
  const applications = parseApplicationListStrict(value);
  writeLocalApplications(applications, config.storageKey || APPLICATION_STORAGE_KEY);
  return applications;
}

/** Commit a JSON backup to repository contents using GitHub's standard REST API. */
export async function commitApplications(
  applications: Application[],
  config: GitHubBackendConfig = {},
): Promise<GitHubCommitResult> {
  const resolved = resolveConfig(config);
  if (!resolved.repo || (!resolved.token && !resolved.octokit)) {
    throw new GitHubBackendError("GitHub repo and token (or an Octokit client) are required to commit applications");
  }

  const dataPath = resolved.dataPath || DEFAULT_GITHUB_DATA_PATH;
  const encodedPath = dataPath.split("/").map(encodeURIComponent).join("/");
  const ref = resolved.branch ? `?ref=${encodeURIComponent(resolved.branch)}` : "";
  const endpoint = `${repositoryApiPath(resolved)}/contents/${encodedPath}`;
  let current: GitHubContent | undefined;
  try {
    current = await githubRequest<GitHubContent>(`${endpoint}${ref}`, resolved);
  } catch (error) {
    if (!(error instanceof GitHubBackendError && error.status === 404)) throw error;
  }

  const response = await githubRequest<GitHubCommitResponse>(endpoint, resolved, {
    method: "PUT",
    body: JSON.stringify({
      message: "chore: update SMP applications",
      content: encodeBase64(exportApplications(applications)),
      ...(current?.sha ? { sha: current.sha } : {}),
      ...(resolved.branch ? { branch: resolved.branch } : {}),
    }),
  });

  return {
    path: dataPath,
    contentSha: response.content?.sha,
    commitSha: response.commit?.sha,
  };
}

/** Import a backup and commit the same normalized data to GitHub. */
export async function importAndCommitApplications(
  data: string | ApplicationExport,
  config: GitHubBackendConfig = {},
): Promise<Application[]> {
  const applications = importApplications(data, config);
  await commitApplications(applications, config);
  return applications;
}

export const loadApplications = fetchApplications;
export const updateStatus = updateApplicationStatus;
export const saveMaterials = updateMaterials;
export const saveLORRequests = updateLORRequests;
