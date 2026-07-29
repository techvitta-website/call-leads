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
  /** How sure the model is the COMPANY is real and matches the brief. */
  confidence?: "high" | "medium" | "low";
  /** The job title to go after, when no specific person is known. */
  target_role?: string;
  /** Concrete suggestion for how the rep should find the right person. */
  research_hint?: string;
  software_category?: string;
  source?: string;
  product_fit?: string;
}

/**
 * Seniority tiers, matching Apollo's taxonomy so the vocabulary is one a
 * salesperson already recognises. Apollo has no separate "individual
 * contributor" tier — senior/entry/intern cover it.
 */
export const SENIORITY_TIERS = [
  { value: "owner", label: "Owner" },
  { value: "founder", label: "Founder" },
  { value: "c_suite", label: "C-Suite" },
  { value: "partner", label: "Partner" },
  { value: "vp", label: "VP" },
  { value: "head", label: "Head of" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior" },
  { value: "entry", label: "Entry level" },
  { value: "intern", label: "Intern" },
] as const;

/** Apollo's 11 headcount bands. */
export const HEADCOUNT_BANDS = [
  "1-10", "11-20", "21-50", "51-100", "101-200", "201-500",
  "501-1000", "1001-2000", "2001-5000", "5001-10000", "10001+",
] as const;

/** Master departments, trimmed to the ones that matter for B2B selling. */
export const DEPARTMENTS = [
  "C-Suite", "Sales", "Marketing", "Operations", "Finance",
  "Human Resources", "Information Technology", "Engineering & Technical",
  "Product", "Legal", "Medical & Health", "Consulting", "Design",
  "Education & Coaching",
] as const;

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

  // ── Firmographics ────────────────────────────────────────────
  /** Headcount bands from HEADCOUNT_BANDS. */
  headcountBands?: string[];
  /** Annual revenue floor/ceiling in INR. Apollo uses free min/max, not bands. */
  revenueMin?: string;
  revenueMax?: string;
  /** Founded-year range, useful for "established" vs "young" targeting. */
  foundedAfter?: string;
  foundedBefore?: string;

  // ── Who to reach ─────────────────────────────────────────────
  /** Seniority values from SENIORITY_TIERS. */
  seniorities?: string[];
  /** Departments from DEPARTMENTS. */
  departments?: string[];
  /** Free-text job titles, on top of seniority/department. */
  roles?: string[];

  // ── Signals and qualifiers ───────────────────────────────────
  /** Technologies the company should already use. */
  technologies?: string[];
  /** Keywords that must appear in the company's profile. */
  keywordsInclude?: string;
  /** Keywords that disqualify a company. */
  keywordsExclude?: string;
  /** Buying signals / must-have criteria in free text. */
  keywords?: string;
  /** Company names already in the CRM — the model is told not to repeat them. */
  excludeCompanies?: string[];
  /** Typical deal size, helps the model estimate value. */
  dealSizeHint?: string;

  // Retained for backwards compatibility with saved segments.
  companySize?: string;
}

/**
 * Models are strongly inclined to fill every field, so we verify rather than
 * trust.
 */
function looksFakePhone(v: unknown): boolean {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return true;
  const tail = d.slice(-10);
  if (tail.length < 10) return true;
  if (/^(\d)\1+$/.test(tail)) return true;              // 9999999999
  if (tail.startsWith("98765432")) return true;          // the classic IN placeholder
  if (tail.startsWith("12345")) return true;
  if (/^(0000|1111)/.test(tail)) return true;
  return false;
}

/**
 * The individually-plausible-but-collectively-obvious case: a live test
 * returned 9876543210, ...211, ...212 across consecutive records. Each number
 * passes a per-record check; the giveaway is only visible across the batch.
 * If several numbers share a long prefix, treat the whole set as placeholders.
 */
function stripSequentialPhones<T extends { phone?: string }>(leads: T[]): T[] {
  const digits = leads.map((l) => String(l.phone ?? "").replace(/\D/g, "").slice(-10));
  const byPrefix = new Map<string, number>();

  for (const d of digits) {
    if (d.length < 10) continue;
    const prefix = d.slice(0, 8); // first 8 of 10 identical => sequential tail
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
  }

  const suspect = new Set(
    [...byPrefix.entries()].filter(([, n]) => n >= 2).map(([p]) => p)
  );
  if (suspect.size === 0) return leads;

  return leads.map((l, i) =>
    suspect.has(digits[i]?.slice(0, 8) ?? "") ? { ...l, phone: "" } : l
  );
}

function looksInvented(v: unknown): boolean {
  const s = String(v ?? "").trim();
  if (!s) return true;
  if (/^(n\/?a|unknown|not known|none|tbd|contact|hr head|owner)$/i.test(s)) return true;
  if (/example\.com|test\.com|domain\.com|@company\./i.test(s)) return true;
  return false;
}

export const generateLeadsWithAI = async (
  options: GenerateLeadsOptions
): Promise<AIGeneratedLead[]> => {
  const count = Math.min(Math.max(options.count || 10, 1), 30);

  const excluded = (options.excludeCompanies || []).slice(0, 120);

  const seniorityLabels = (options.seniorities || [])
    .map((v) => SENIORITY_TIERS.find((t) => t.value === v)?.label || v)
    .filter(Boolean);

  // Build the brief from whatever the user actually set. Emitting empty
  // "Any / not specified" lines just dilutes the prompt and pushes the model
  // toward generic output, so unset filters are omitted entirely.
  const brief: string[] = [
    `- Industry / vertical: ${options.industry}`,
    `- Region: ${options.region}`,
  ];

  if (options.location?.trim()) brief.push(`- Focus on these locations: ${options.location.trim()}`);
  if (options.headcountBands?.length) brief.push(`- Company headcount: ${options.headcountBands.join(" or ")} employees`);
  if (options.revenueMin || options.revenueMax) {
    brief.push(`- Annual revenue: ${options.revenueMin ? `at least ₹${options.revenueMin}` : "any"}${options.revenueMax ? `, at most ₹${options.revenueMax}` : ""}`);
  }
  if (options.foundedAfter || options.foundedBefore) {
    brief.push(`- Founded between ${options.foundedAfter || "any year"} and ${options.foundedBefore || "now"}`);
  }
  if (seniorityLabels.length) brief.push(`- Seniority of the contact: ${seniorityLabels.join(" or ")}`);
  if (options.departments?.length) brief.push(`- Department / function: ${options.departments.join(" or ")}`);
  if (options.roles?.length) brief.push(`- Specific job titles to prefer: ${options.roles.join(", ")}`);
  if (options.technologies?.length) brief.push(`- Should already use: ${options.technologies.join(", ")}`);
  if (options.keywordsInclude?.trim()) brief.push(`- Company profile must mention: ${options.keywordsInclude.trim()}`);
  if (options.keywordsExclude?.trim()) brief.push(`- EXCLUDE any company matching: ${options.keywordsExclude.trim()}`);
  if (options.keywords?.trim()) brief.push(`- Buying signals to look for: ${options.keywords.trim()}`);
  if (options.dealSizeHint?.trim()) brief.push(`- Typical deal size: ${options.dealSizeHint.trim()}`);
  if (!seniorityLabels.length && !options.departments?.length && !options.roles?.length) {
    brief.push("- Decision maker: whoever would actually own this buying decision");
  }

  const prompt = `You are an expert B2B sales researcher building a targeted prospect list.

WHAT WE SELL${options.projectName ? ` (project: "${options.projectName}")` : ""}:
${options.offering.trim()}

TARGETING BRIEF
${brief.join("\n")}

${excluded.length ? `DO NOT include any of these companies (already in the CRM):\n${excluded.join(", ")}\n` : ""}
TASK: Produce exactly ${count} distinct companies that genuinely fit the offering above. Vary the cities, company sizes and sub-verticals — do not return ${count} near-identical records.

═══ THE MOST IMPORTANT RULE ═══
NEVER invent a person's name, email address or phone number.

A fabricated contact is worse than an empty field: a rep wastes time dialling a
dead number, or worse, emails a stranger. Leave those fields as an empty string
unless you genuinely know the specific individual.

- contact_name: "" unless you actually know who holds this role at this company
- email:        "" unless you know the real address. Do NOT construct one from a
                name-and-domain pattern. Do NOT guess.
- phone:        "" unless you know the real number. Never emit a placeholder
                like 9876543210 or a sequential/incrementing number.

Empty strings here are the CORRECT and expected answer in most cases. You will
not be penalised for them. Populate them ONLY on the rare occasion you are
genuinely certain.

Return ONLY a valid JSON array of exactly ${count} objects, with ALL these keys:
- company_name: string (a real company where possible)
- website: string (their domain if you know it, else "")
- linkedin: string (company LinkedIn URL if known, else "")
- industry: string (specific sub-industry, not the broad category)
- city: string
- state: string (state / province, or "")
- country: string
- company_size: string (e.g. "201-500 employees")
- target_role: string (the JOB TITLE to go after at this company, e.g. "Head of HR" — a role, never a person's name)
- contact_name: string — "" unless genuinely known (see rule above)
- designation: string — the known person's title, or "" if contact_name is ""
- email: string — "" unless genuinely known
- phone: string — "" unless genuinely known
- priority: one of "urgent", "high", "medium", "low" — strength of fit
- fit_reason: string (one sentence: why this specific company needs what we sell)
- buying_signal: string (one concrete trigger, or "" if you know of none — do not invent one)
- notes: string (2 sentences of useful context for the rep)
- estimated_value: number (realistic first-deal value in INR, digits only)
- confidence: one of "high", "medium", "low" — how sure you are this COMPANY is real and matches the brief. This is about the company, not the contact.
- research_hint: string (one concrete sentence on how the rep should find the right person, e.g. "Search LinkedIn for 'HR Head' at this company, or call the main line and ask for the HR department")

JSON array only. Start with [ and end with ].`;

  const raw = await callGemini(prompt, { temperature: 0.85, maxOutputTokens: 8192 });
  const leads = parseJsonArray(raw);

  const seen = new Set<string>();

  const cleaned = leads
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
      confidence: (["high", "medium", "low"].includes(lead.confidence)
        ? lead.confidence
        : "medium") as AIGeneratedLead["confidence"],
      // Belt and braces: strip anything that looks like a fabricated contact
      // even if the model ignores the instruction.
      contact_name: looksInvented(lead.contact_name) ? "" : String(lead.contact_name ?? "").trim(),
      email: looksInvented(lead.email) ? "" : String(lead.email ?? "").trim(),
      phone: looksFakePhone(lead.phone) ? "" : String(lead.phone ?? "").trim(),
      // A designation only means something if we know who holds it.
      designation: looksInvented(lead.contact_name)
        ? ""
        : String(lead.designation ?? "").trim(),
      target_role: String(lead.target_role ?? lead.designation ?? "").trim(),
      research_hint: String(lead.research_hint ?? "").trim(),
      source: "AI Generated",
      product_fit: lead.fit_reason || lead.product_fit || "",
    }));

  // Sequential placeholders are only detectable across the whole batch.
  return stripSequentialPhones(cleaned);
};
