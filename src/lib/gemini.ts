// Gemini AI service
// Requires VITE_GEMINI_API_KEY in .env (local) and in Vercel env vars (production)

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// Google renames/retires model IDs fairly often. Instead of hard-coding one ID
// (which silently 404s and looks like "AI is broken"), we try a list in order
// and remember the first one that works for the rest of the session.
const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash-001",
  "gemini-1.5-flash",
];

let workingModel: string | null = null;

const endpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const hasGeminiKey = () => Boolean(GEMINI_API_KEY);

/**
 * Low-level Gemini call with automatic model fallback and JSON-mode output.
 * Returns the raw text of the first candidate.
 */
export async function callGemini(
  prompt: string,
  opts: { temperature?: number; maxOutputTokens?: number; json?: boolean } = {}
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "Gemini API key is not configured. Add VITE_GEMINI_API_KEY to your .env file (local) and to your Vercel Environment Variables (production), then redeploy."
    );
  }

  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.8,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      ...(opts.json === false ? {} : { responseMimeType: "application/json" }),
    },
  });

  const tryOrder = workingModel
    ? [workingModel, ...MODEL_CANDIDATES.filter((m) => m !== workingModel)]
    : MODEL_CANDIDATES;

  let lastError = "";

  for (const model of tryOrder) {
    let response: Response;
    try {
      response = await fetch(endpoint(model), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": GEMINI_API_KEY,
        },
        body,
      });
    } catch (networkErr: any) {
      throw new Error(
        `Could not reach the Gemini API (${networkErr?.message || "network error"}). Check your internet connection.`
      );
    }

    if (response.ok) {
      workingModel = model;
      const data = await response.json();

      const blockReason = data?.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error(
          `Gemini blocked this request (${blockReason}). Try rephrasing your targeting criteria.`
        );
      }

      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((p: any) => p?.text || "")
        .join("")
        .trim();

      if (!text) {
        const finish = data?.candidates?.[0]?.finishReason;
        throw new Error(
          finish === "MAX_TOKENS"
            ? "Gemini hit the output limit. Try generating fewer leads at a time."
            : "Gemini returned an empty response. Please try again."
        );
      }
      return text;
    }

    const errText = await response.text();
    lastError = `${response.status}: ${errText.slice(0, 400)}`;

    // 404 / "model not found" → try the next candidate. Anything else is fatal.
    const modelMissing =
      response.status === 404 ||
      /not found|not supported|unsupported model/i.test(errText);

    if (!modelMissing) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Gemini rejected the API key (401/403). Check that VITE_GEMINI_API_KEY is correct and that the Generative Language API is enabled for it."
        );
      }
      if (response.status === 429) {
        throw new Error(
          "Gemini rate limit reached. Wait a minute and try again, or generate fewer leads."
        );
      }
      throw new Error(`Gemini API error ${lastError}`);
    }
  }

  throw new Error(`No available Gemini model responded. Last error — ${lastError}`);
}

/** Strip markdown fences and parse a JSON array out of a model response. */
function parseJsonArray(raw: string): any[] {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
    for (const key of Object.keys(parsed || {})) {
      if (Array.isArray((parsed as any)[key])) return (parsed as any)[key];
    }
  } catch {
    // fall through to bracket extraction
  }

  const first = s.indexOf("[");
  const last = s.lastIndexOf("]");
  if (first !== -1 && last > first) {
    try {
      const parsed = JSON.parse(s.slice(first, last + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* noop */
    }
  }

  throw new Error(
    "Gemini returned a response that could not be parsed. Try again with a smaller lead count."
  );
}

export interface AIGeneratedLead {
  id: string; // client-side only, for checkbox tracking
  company_name: string;
  contact_name: string;
  designation: string;
  email: string;
  phone: string;
  website?: string;
  linkedin?: string;
  industry: string;
  city: string;
  state?: string;
  country: string;
  company_size?: string;
  priority: "urgent" | "high" | "medium" | "low";
  notes: string;
  fit_reason?: string;
  buying_signal?: string;
  estimated_value?: number;
  software_category?: string;
  source?: string;
  product_fit?: string;
}

export interface GenerateLeadsOptions {
  /** Free-text description of what this project sells / who it targets. */
  offering: string;
  /** Project name, used for context + tagging. */
  projectName?: string;
  industry: string;
  region: string;
  /** Optional narrower location, e.g. "Hyderabad, Pune". */
  location?: string;
  count: number;
  companySize?: string;
  /** Decision-maker job titles to target. */
  roles?: string[];
  /** Buying signals / must-have criteria in free text. */
  keywords?: string;
  /** Company names already in the CRM — the model is told not to repeat them. */
  excludeCompanies?: string[];
  /** Typical deal size, helps the model estimate value. */
  dealSizeHint?: string;
}

export const generateLeadsWithAI = async (
  options: GenerateLeadsOptions
): Promise<AIGeneratedLead[]> => {
  const count = Math.min(Math.max(options.count || 10, 1), 30);

  const rolesLine =
    options.roles && options.roles.length > 0
      ? options.roles.join(", ")
      : "the most relevant decision maker for this offering";

  const excluded = (options.excludeCompanies || []).slice(0, 120);

  const prompt = `You are an expert B2B sales researcher building a targeted prospect list.

WHAT WE SELL${options.projectName ? ` (project: "${options.projectName}")` : ""}:
${options.offering.trim()}

TARGETING BRIEF
- Industry / vertical: ${options.industry}
- Region: ${options.region}${options.location ? `\n- Specific locations to focus on: ${options.location}` : ""}
- Company size: ${options.companySize || "Any size"}
- Decision makers to reach: ${rolesLine}${options.keywords ? `\n- Must match these signals / criteria: ${options.keywords}` : ""}${options.dealSizeHint ? `\n- Typical deal size: ${options.dealSizeHint}` : ""}

${excluded.length ? `DO NOT include any of these companies (already in the CRM):\n${excluded.join(", ")}\n` : ""}
TASK: Produce exactly ${count} distinct, realistic, well-researched prospect records that genuinely fit the offering above. Prefer real companies that plausibly operate in this segment. Vary the cities, company sizes and sub-verticals — do not return ${count} near-identical records.

Return ONLY a valid JSON array of exactly ${count} objects. Every object must contain ALL of these keys:
- company_name: string
- contact_name: string (full name of a plausible decision maker)
- designation: string (their job title, drawn from the decision-maker list above)
- email: string (professional format, firstname.lastname@companydomain)
- phone: string (correctly formatted for the country, include country code)
- website: string (company domain, e.g. "acme.com")
- linkedin: string (LinkedIn company URL, or "" if unknown)
- industry: string (specific sub-industry, not the broad category)
- city: string
- state: string (state / province, or "")
- country: string
- company_size: string (e.g. "50-200 employees")
- priority: one of "urgent", "high", "medium", "low" — how strong the fit is
- fit_reason: string (one sentence: why this specific company needs what we sell)
- buying_signal: string (one concrete trigger, e.g. "recently opened a second facility", or "" if none)
- notes: string (2 sentences of useful sales context for the rep making the first call)
- estimated_value: number (realistic first-deal value in INR, digits only, no currency symbol or commas)

JSON array only. Start with [ and end with ].`;

  const raw = await callGemini(prompt, { temperature: 0.85, maxOutputTokens: 8192 });
  const leads = parseJsonArray(raw);

  const seen = new Set<string>();

  return leads
    .filter((l: any) => l && l.company_name)
    .filter((l: any) => {
      const key = String(l.company_name).trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((lead: any, i: number) => ({
      ...lead,
      id: `ai-lead-${Date.now()}-${i}`,
      priority: (["urgent", "high", "medium", "low"].includes(lead.priority)
        ? lead.priority
        : "medium") as AIGeneratedLead["priority"],
      estimated_value:
        typeof lead.estimated_value === "number"
          ? lead.estimated_value
          : Number(String(lead.estimated_value || "").replace(/[^0-9.]/g, "")) || 0,
      source: "AI Generated",
      product_fit: lead.fit_reason || lead.product_fit || "",
    }));
};
