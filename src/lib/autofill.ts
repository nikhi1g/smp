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

export const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-latest";
export const DEFAULT_WORKER_ENDPOINT = "https://smp-api.gptminimal.workers.dev/autofill";

export async function requestProgramAutofill(query: string): Promise<AutofillResult> {
  const workerEndpoint =
    (typeof window !== "undefined" ? localStorage.getItem("smp_worker_endpoint") : null) ||
    process.env.NEXT_PUBLIC_WORKER_ENDPOINT ||
    DEFAULT_WORKER_ENDPOINT;

  // 1. Try secure Cloudflare Worker backend (no user API key needed)
  try {
    const workerRes = await fetch(workerEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (workerRes.ok) {
      const data = await workerRes.json();
      return data as AutofillResult;
    }
  } catch {
    // Fall through to direct local key if worker is not yet deployed
  }

  // 2. Fallback to direct client key / local env if configured
  const apiKey =
    (typeof window !== "undefined" ? localStorage.getItem("smp_openrouter_api_key") : null) ||
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY ||
    "";

  if (!apiKey) {
    throw new AutofillError(
      503,
      "Autofill proxy worker is deploying. You can also run ./run_setup_key.sh for local use."
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
      "X-Title": "SMP Application Tracker",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You extract and structure Special Master's Program (SMP) metadata. Return valid JSON only.",
        },
        {
          role: "user",
          content: `Return accurate SMP admissions metadata for query: "${query}" as JSON with keys: programName, university, degreeType, deadline, gpaRequirement, mcatRequirement, appFee, portalUrl, notes.`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AutofillError(response.status, data?.error?.message || "Autofill request failed");
  }

  const content = data?.choices?.[0]?.message?.content;
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as AutofillResult;
}
