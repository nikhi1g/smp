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

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";

function programSchema() {
  return {
    type: "object",
    properties: {
      programName: {
        type: "string",
        description: "Official full program title (e.g. Special Master's Program in Physiology)",
      },
      university: {
        type: "string",
        description: "Official university name (e.g. Georgetown University)",
      },
      degreeType: {
        type: "string",
        description: "Degree award type (e.g. M.S. Physiology, M.A. Medical Sciences, Post-Bacc Certificate)",
      },
      deadline: {
        type: "string",
        description: "Application deadline in YYYY-MM-DD format (e.g. 2026-05-15)",
      },
      gpaRequirement: {
        type: "string",
        description: "Minimum or recommended undergraduate GPA cutoff (e.g. 3.0+)",
      },
      mcatRequirement: {
        type: "string",
        description: "Minimum or recommended MCAT score cutoff (e.g. 500+ or Optional)",
      },
      appFee: {
        type: "string",
        description: "Application fee (e.g. $80)",
      },
      portalUrl: {
        type: "string",
        description: "Canonical link to official program or application portal",
      },
      notes: {
        type: "string",
        description: "Concise summary of medical school linkage, curriculum, and timeline highlights.",
      },
    },
    required: ["programName", "university", "degreeType", "deadline", "gpaRequirement", "mcatRequirement", "appFee", "portalUrl", "notes"],
    additionalProperties: false,
  };
}

export async function requestProgramAutofill(query: string, customApiKey?: string): Promise<AutofillResult> {
  const apiKey =
    customApiKey ||
    (typeof window !== "undefined" ? localStorage.getItem("smp_openrouter_api_key") : null) ||
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY ||
    "";

  const model =
    (typeof window !== "undefined" ? localStorage.getItem("smp_openrouter_model") : null) ||
    process.env.NEXT_PUBLIC_OPENROUTER_MODEL ||
    DEFAULT_MODEL;

  if (!apiKey) {
    throw new AutofillError(
      401,
      "No OpenRouter API key found. Run ./run_setup_key.sh or configure it in the API Key settings modal."
    );
  }

  const prompt = `You are an expert advisor for medical school admissions and Special Master's Programs (SMPs).
Verify and provide accurate admissions metadata for this program query: "${query}"

Ensure:
- Program name and University are properly separated.
- Deadline is estimated or standard in YYYY-MM-DD format.
- Standard cutoffs for GPA and MCAT are provided.
- Portal URL points to the official institution webpage.`;

  const response = await fetch(OPENROUTER_ENDPOINT, {
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
          content: "You extract and structure Special Master's Program (SMP) metadata. Return facts supported by medical admissions standards. Strictly output JSON matching the required schema.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "smp_program_metadata",
          strict: true,
          schema: programSchema(),
        },
      },
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `OpenRouter request failed (${response.status})`;
    throw new AutofillError(response.status, message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new AutofillError(502, "OpenRouter returned an empty response.");
  }

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as AutofillResult;
  } catch {
    throw new AutofillError(502, "Failed to parse structured JSON from OpenRouter completion.");
  }
}
