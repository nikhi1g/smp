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

export async function requestProgramAutofill(query: string, customApiKey?: string): Promise<AutofillResult> {
  const apiKey =
    customApiKey ||
    (typeof window !== "undefined" ? localStorage.getItem("smp_muse_spark_api_key") : null) ||
    process.env.NEXT_PUBLIC_MUSE_SPARK_API_KEY ||
    "";

  const baseUrl =
    (typeof window !== "undefined" ? localStorage.getItem("smp_muse_spark_base_url") : null) ||
    process.env.NEXT_PUBLIC_MUSE_SPARK_BASE_URL ||
    "https://api.aimlapi.com/v1";

  const model =
    (typeof window !== "undefined" ? localStorage.getItem("smp_muse_spark_model") : null) ||
    process.env.NEXT_PUBLIC_MUSE_SPARK_MODEL ||
    "meta/muse-spark-1.2";

  if (!apiKey) {
    throw new Error(
      "No Muse Spark API key found. Please run ./run_setup_key.sh or configure it in Settings."
    );
  }

  const prompt = `You are a medical school admissions and Special Master's Programs (SMP) expert assistant.
Given the following input: "${query}"

Return a single JSON object with accurate or realistic standard details for this SMP/Post-Bacc program.
Format your output as raw JSON ONLY with these exact keys:
{
  "programName": "Full program name",
  "university": "University name",
  "degreeType": "Degree/Credential type (e.g. M.S. Physiology, M.A. Medical Sciences, Post-Bacc Certificate)",
  "deadline": "Estimated or typical application deadline in YYYY-MM-DD format (e.g. 2026-05-15)",
  "gpaRequirement": "Typical minimum GPA (e.g. 3.0+)",
  "mcatRequirement": "Typical minimum or recommended MCAT (e.g. 500+ or Optional)",
  "appFee": "Application fee (e.g. $80)",
  "portalUrl": "Official admissions URL or homepage",
  "notes": "1-2 concise sentences summarizing linkage to medical school, duration, and key curriculum highlights."
}
Do not include markdown formatting, backticks, or preamble. Return only the raw JSON object.`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You return strictly valid raw JSON without code blocks or markdown wrappers.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || "{}";
  const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  return JSON.parse(cleaned) as AutofillResult;
}
