// Gemini AI service
//
// The API key is NOT held in the browser. All calls go through the
// `gemini-proxy` Supabase edge function, which reads the key from Vault
// server-side. That means the key never appears in the JavaScript bundle
// and only signed-in CRM users can spend quota.
//
// To rotate the key, run this as a manager or owner:
//   select public.rotate_gemini_key('YOUR_NEW_KEY');

import { supabase } from "./supabase";

/**
 * The key lives server-side now, so the browser can't check it directly.
 * Kept for call sites that want to short-circuit before showing an AI
 * dialog; a missing key surfaces as a clear error from the proxy instead.
 */
export const hasGeminiKey = () => true;

/**
 * Low-level Gemini call. Model fallback, JSON mode and error handling all
 * happen server-side. Returns the raw text of the first candidate.
 */
export async function callGemini(
  prompt: string,
  opts: { temperature?: number; maxOutputTokens?: number; json?: boolean } = {}
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("gemini-proxy", {
    body: {
      prompt,
      temperature: opts.temperature ?? 0.8,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      json: opts.json !== false,
    },
  });

  // supabase-js wraps non-2xx responses in a FunctionsHttpError whose body
  // holds our own message. Dig it out so the user sees something useful
  // rather than "Edge Function returned a non-2xx status code".
  if (error) {
    let detail = "";
    try {
      const ctx = (error as any)?.context;
      if (ctx && typeof ctx.json === "function") {
        const parsed = await ctx.json();
        detail = parsed?.error || "";
      }
    } catch {
      /* fall through to the generic message */
    }
    throw new Error(
      detail ||
        (error as any)?.message ||
        "The AI service is unavailable right now. Please try again."
    );
  }

  const text = (data as any)?.text;
  if (!text) {
    throw new Error((data as any)?.error || "Gemini returned an empty response. Please try again.");
  }
  return text as string;
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
