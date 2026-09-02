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

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const candidate = data.error;
    if (typeof candidate === "string") return candidate;
  }
  return fallback;
}

export async function requestProgramAutofill(query: string): Promise<AutofillResult> {
  const workerEndpoint =
    (typeof window !== "undefined" ? localStorage.getItem("smp_worker_endpoint") : null) ||
    process.env.NEXT_PUBLIC_WORKER_ENDPOINT ||
    DEFAULT_WORKER_ENDPOINT;

  // 1. Primary: Contact Cloudflare Worker backend (mimics seminal-papers-api)
  try {
    const response = await fetch(workerEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const data: unknown = await response.json().catch(() => ({}));
    if (response.ok) {
      return data as AutofillResult;
    }

    if (response.status === 503 || response.status === 400 || response.status === 502) {
      const msg = extractErrorMessage(data, `Worker returned status ${response.status}`);
      throw new AutofillError(response.status, msg);
    }
  } catch (err) {
    if (err instanceof AutofillError) throw err;
  }

  // 2. Secondary fallback if local token is present (e.g. running localhost)
  const apiKey =
    (typeof window !== "undefined" ? localStorage.getItem("smp_openrouter_api_key") : null) ||
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY ||
    "";

  if (!apiKey) {
    throw new AutofillError(
      503,
      "Autofill proxy is ready. To use local direct fallback, configure your OpenRouter token via ./run_setup.sh or API Key settings."
    );
  }

  const model =
    (typeof window !== "undefined" ? localStorage.getItem("smp_openrouter_model") : null) ||
    process.env.NEXT_PUBLIC_OPENROUTER_MODEL ||
    "deepseek/deepseek-v4-flash-latest";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://nikhi1g.github.io/smp/",
      "X-Title": "SMP & Medical Program Tracker",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You extract and structure medical school, SMP, and graduate program admissions metadata. Return strict JSON.",
        },
        {
          role: "user",
          content: `Return accurate admissions metadata for query: "${query}" as JSON with keys: programName, university, degreeType, deadline, gpaRequirement, mcatRequirement, appFee, portalUrl, notes.`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AutofillError(response.status, extractErrorMessage(data, `Request failed (${response.status})`));
  }

  if (data && typeof data === "object" && "choices" in data && Array.isArray(data.choices)) {
    const firstChoice: unknown = data.choices[0];
    if (firstChoice && typeof firstChoice === "object" && "message" in firstChoice) {
      const msg: unknown = firstChoice.message;
      if (msg && typeof msg === "object" && "content" in msg && typeof msg.content === "string") {
        const cleaned = msg.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        return JSON.parse(cleaned) as AutofillResult;
      }
    }
  }

  throw new AutofillError(502, "Invalid response from OpenRouter");
}
