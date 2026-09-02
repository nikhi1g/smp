const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash-latest';
const DEFAULT_ALLOWED_ORIGINS = [
  'https://nikhi1g.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  const selected = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': selected,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
}

function assertAllowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins(env).includes(origin)) {
    throw new HttpError(403, 'Origin is not allowed.');
  }
}

function programSchema() {
  return {
    type: 'object',
    properties: {
      programName: {
        type: 'string',
        description: 'Official full program title (e.g. Special Master\'s Program in Physiology)',
      },
      university: {
        type: 'string',
        description: 'Official university name (e.g. Georgetown University)',
      },
      degreeType: {
        type: 'string',
        description: 'Degree award type (e.g. M.S. Physiology, M.A. Medical Sciences, Post-Bacc Certificate)',
      },
      deadline: {
        type: 'string',
        description: 'Application deadline in YYYY-MM-DD format (e.g. 2026-05-15)',
      },
      gpaRequirement: {
        type: 'string',
        description: 'Minimum or recommended undergraduate GPA cutoff (e.g. 3.0+)',
      },
      mcatRequirement: {
        type: 'string',
        description: 'Minimum or recommended MCAT score cutoff (e.g. 500+ or Optional)',
      },
      appFee: {
        type: 'string',
        description: 'Application fee (e.g. $80)',
      },
      portalUrl: {
        type: 'string',
        description: 'Canonical link to official program or application portal',
      },
      notes: {
        type: 'string',
        description: 'Concise summary of medical school linkage, curriculum, and timeline highlights.',
      },
    },
    required: ['programName', 'university', 'degreeType', 'deadline', 'gpaRequirement', 'mcatRequirement', 'appFee', 'portalUrl', 'notes'],
    additionalProperties: false,
  };
}

async function requestOpenRouterMetadata(env, query) {
  const prompt = `You are an expert advisor for medical school admissions and Special Master's Programs (SMPs).
Verify and provide accurate admissions metadata for this program query: "${query}"

Ensure:
- Program name and University are properly separated.
- Deadline is estimated or standard in YYYY-MM-DD format.
- Standard cutoffs for GPA and MCAT are provided.
- Portal URL points to the official institution webpage.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nikhi1g.github.io/smp/',
      'X-Title': 'SMP Application Tracker',
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You extract and structure Special Master\'s Program (SMP) metadata. Return facts supported by medical admissions standards. Strictly output JSON matching the required schema.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'smp_program_metadata',
          strict: true,
          schema: programSchema(),
        },
      },
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  const completion = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = completion?.error?.message || `OpenRouter request failed (${response.status}).`;
    throw new HttpError(response.status === 429 ? 429 : 502, message);
  }

  const content = completion?.choices?.[0]?.message?.content;
  if (!content) throw new HttpError(502, 'OpenRouter returned an empty response.');

  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new HttpError(502, 'Invalid JSON returned from model.');
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const headers = corsHeaders(request, env);
    try {
      assertAllowedOrigin(request, env);
      const url = new URL(request.url);

      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ status: 'healthy', service: 'smp-api' }, 200, headers);
      }

      if (url.pathname === '/autofill' && request.method === 'POST') {
        if (!env.OPENROUTER_API_KEY) {
          throw new HttpError(503, 'Autofill is not configured with OPENROUTER_API_KEY on the worker yet.');
        }

        const body = await request.json().catch(() => ({}));
        const query = String(body.query || '').trim();
        if (!query) {
          throw new HttpError(400, 'A query string is required for program autofill.');
        }

        const metadata = await requestOpenRouterMetadata(env, query);
        return json(metadata, 200, headers);
      }

      throw new HttpError(404, 'Not found.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json({ error: error.message || 'Internal Server Error' }, status, headers);
    }
  },
};
