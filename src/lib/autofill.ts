export interface AutofillResult {
  programName?: string;
  university?: string;
  degreeType?: string;
  deadline?: string;
  gpaRequirement?: string;
  mcatRequirement?: string;
  appFee?: string;
  portalUrl?: string;
  notes?: string;
}

export class AutofillError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AutofillError";
  }
}

export const DEFAULT_WORKER_ENDPOINT = "https://smp-api.gptminimal.workers.dev/autofill";
const REQUEST_TIMEOUT_MS = 32000;

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const candidate = data.error;
    if (typeof candidate === "string") return candidate;
  }
  return fallback;
}

function parseAutofillResult(data: unknown): AutofillResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new AutofillError(502, "Autofill returned an invalid response.");
  }

  const source = data as Record<string, unknown>;
  const result: AutofillResult = {};
  const fields = [
    "programName",
    "university",
    "degreeType",
    "deadline",
    "gpaRequirement",
    "mcatRequirement",
    "appFee",
    "portalUrl",
    "notes",
  ] as const;

  for (const field of fields) {
    if (typeof source[field] === "string" && source[field].trim()) {
      result[field] = source[field].trim();
    }
  }
  return result;
}

export async function requestProgramAutofill(query: string): Promise<AutofillResult> {
  const workerEndpoint =
    (typeof window !== "undefined" ? localStorage.getItem("smp_worker_endpoint") : null) ||
    process.env.NEXT_PUBLIC_WORKER_ENDPOINT ||
    DEFAULT_WORKER_ENDPOINT;

  let response: Response;
  try {
    response = await fetch(workerEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new AutofillError(504, "Admissions search timed out. Please try again.");
    }
    throw new AutofillError(503, "Could not reach the admissions search service. Please try again.");
  }

  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AutofillError(
      response.status,
      extractErrorMessage(data, `Admissions search failed (${response.status}).`)
    );
  }

  return parseAutofillResult(data);
}
