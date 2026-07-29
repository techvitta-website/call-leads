// ═══════════════════════════════════════════════════════════════
// lead-intake — public webhook that turns an external payload
// into a CRM lead.
//
// Auth:  x-api-key: <key>   (or ?key=<key>)
// Usage: POST https://<project>.supabase.co/functions/v1/lead-intake
//
// Understands Instagram/Facebook Lead Ads, LinkedIn Lead Gen Forms,
// and any flat JSON object from n8n or a website form.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Case/format-insensitive lookup across a flat object. */
function pick(obj: Record<string, any>, ...names: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = new Map<string, any>();
  for (const [k, v] of Object.entries(obj)) map.set(norm(k), v);
  for (const n of names) {
    const v = map.get(norm(n));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * Meta and LinkedIn both deliver answers as an array of
 * {name/field_key, values/value} pairs. Flatten those into the
 * top-level object so `pick` can find them.
 */
function flattenFieldArrays(input: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...input };

  const arrays = [
    input?.field_data,                                    // Meta Lead Ads
    input?.formResponse?.answers,                         // LinkedIn
    input?.answers,
    input?.fields,
    input?.entry?.[0]?.changes?.[0]?.value?.field_data,    // raw Meta webhook
  ].filter(Array.isArray);

  for (const arr of arrays) {
    for (const f of arr) {
      const key = f?.name ?? f?.field_key ?? f?.key ?? f?.questionText;
      const val = Array.isArray(f?.values) ? f.values[0] : (f?.value ?? f?.answer ?? f?.values);
      if (key && val !== undefined && val !== null) out[String(key)] = val;
    }
  }
  return out;
}

function normalisePhone(raw: string): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10 && /^[6-9]/.test(d)) return `+91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `+91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return `+${d}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);

  // Meta requires a GET verification handshake when you register the webhook.
  if (req.method === "GET") {
    const challenge = url.searchParams.get("hub.challenge");
    if (challenge) return new Response(challenge, { status: 200, headers: CORS });
    return json({ ok: true, service: "lead-intake", hint: "POST a lead payload with an x-api-key header." });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Authenticate the source ──────────────────────────────
  const apiKey = req.headers.get("x-api-key") || url.searchParams.get("key") || "";
  if (!apiKey) return json({ error: "Missing API key. Send it as the x-api-key header." }, 401);

  const { data: source } = await supabase
    .from("automation_sources")
    .select("*")
    .eq("key_hash", await sha256(apiKey))
    .eq("active", true)
    .maybeSingle();

  if (!source) return json({ error: "Invalid or inactive API key." }, 401);

  // ── Resolve an owner for created_by (NOT NULL on leads) ────────
  // Automated leads have no human creator, so attribute them to whoever
  // made the API key, falling back to any owner/manager account.
  let createdBy: string | null = source.created_by ?? null;
  if (!createdBy) {
    const { data: fallback } = await supabase
      .from("users")
      .select("id")
      .in("role", ["owner", "manager"])
      .limit(1)
      .maybeSingle();
    createdBy = fallback?.id ?? null;
  }
  if (!createdBy) {
    return json(
      { error: "This API key has no owner and no owner/manager account exists to attribute leads to." },
      500,
    );
  }

  // ── Parse the payload ────────────────────────────────────
  let raw: any;
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "Body must be valid JSON." }, 400);
  }

  // Accept a bare array or {leads:[...]} for batch posting.
  const items: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.leads) ? raw.leads : [raw];

  const created: any[] = [];
  const skipped: any[] = [];
  const failed: any[] = [];

  // Round-robin target is resolved once per request via a shared DB function,
  // which only considers salespeople with receives_leads = true.
  let roundRobinRep: string | null = null;
  if (source.assign_mode === "round_robin") {
    const { data: rep } = await supabase.rpc("pick_least_loaded_rep");
    roundRobinRep = (rep as string) ?? null;
  }

  for (const item of items) {
    const f = flattenFieldArrays(item || {});

    const company = pick(f, "company_name", "company", "organisation", "organization", "business_name", "businessName");
    const first = pick(f, "first_name", "firstName", "given_name");
    const last = pick(f, "last_name", "lastName", "family_name", "surname");
    const fullName = pick(f, "contact_name", "full_name", "fullName", "name", "username") || [first, last].filter(Boolean).join(" ");

    const email = pick(f, "email", "email_address", "emailAddress", "work_email");
    const phoneRaw = pick(f, "phone", "phone_number", "phoneNumber", "mobile", "mobile_number", "whatsapp", "contact_number");
    const phone = normalisePhone(phoneRaw);

    // A lead needs at least a name/company and some way to reach them.
    if (!company && !fullName) {
      failed.push({ reason: "No company or contact name found in payload", payload: item });
      continue;
    }
    if (!email && !phone) {
      failed.push({ reason: "No email or phone found in payload", payload: item });
      continue;
    }

    const projectId = pick(f, "project_id", "projectId") || source.project_id;
    if (!projectId) {
      failed.push({ reason: "No project_id on the payload and none configured on this API key", payload: item });
      continue;
    }

    // ── Dedupe within the project on email or phone ──────────
    let dupeQuery = supabase.from("leads").select("id, company_name").eq("project_id", projectId);
    if (email && phone) dupeQuery = dupeQuery.or(`email.eq.${email},phone.eq.${phone}`);
    else if (email) dupeQuery = dupeQuery.eq("email", email);
    else dupeQuery = dupeQuery.eq("phone", phone);

    const { data: dupes } = await dupeQuery.limit(1);
    if (dupes && dupes.length > 0) {
      skipped.push({ reason: "duplicate", existing_lead_id: dupes[0].id, company: company || fullName });
      continue;
    }

    const assignedTo =
      source.assign_mode === "fixed" ? source.default_assignee
      : source.assign_mode === "round_robin" ? roundRobinRep
      : null;

    const channelLabel =
      pick(f, "lead_source", "source", "utm_source") ||
      ({
        instagram: "Instagram",
        linkedin: "LinkedIn",
        facebook: "Facebook",
        website: "Website",
        n8n: "n8n",
      } as Record<string, string>)[source.channel] ||
      source.name;

    const notes = [
      pick(f, "message", "notes", "comments", "enquiry", "requirement"),
      pick(f, "ad_name", "adName") ? `Ad: ${pick(f, "ad_name", "adName")}` : "",
      pick(f, "form_name", "formName") ? `Form: ${pick(f, "form_name", "formName")}` : "",
      pick(f, "campaign_name", "campaignName") ? `Campaign: ${pick(f, "campaign_name", "campaignName")}` : "",
      pick(f, "instagram_handle", "ig_username", "username") ? `IG: @${pick(f, "instagram_handle", "ig_username", "username")}` : "",
      pick(f, "linkedin", "linkedin_url", "profile_url") ? `LinkedIn: ${pick(f, "linkedin", "linkedin_url", "profile_url")}` : "",
    ].filter(Boolean).join("\n");

    const leadRow: Record<string, any> = {
      project_id: projectId,
      created_by: createdBy,
      company_name: company || fullName,
      contact_name: fullName || company,
      email: email || null,
      phone: phone || null,
      status: source.default_status || "new",
      value: Number(pick(f, "value", "deal_value", "budget").replace(/[^0-9.]/g, "")) || 0,
      assigned_to: assignedTo,
      lead_source: channelLabel,
      data_source: `Automation: ${source.name}`,
      designation: pick(f, "designation", "job_title", "jobTitle", "title") || null,
      city: pick(f, "city", "town") || null,
      state: pick(f, "state", "region", "province") || null,
      country: pick(f, "country") || null,
      linkedin: pick(f, "linkedin", "linkedin_url", "profile_url") || null,
      industry: pick(f, "industry") || null,
      priority: pick(f, "priority") || "medium",
      lead_notes: notes || null,
      description: notes ? notes.slice(0, 240) : `Captured from ${channelLabel}`,
    };

    const { data: inserted, error } = await supabase
      .from("leads")
      .insert(leadRow)
      .select("id, company_name, contact_name, assigned_to")
      .single();

    if (error) failed.push({ reason: error.message, payload: item });
    else created.push(inserted);
  }

  // ── Bookkeeping ──────────────────────────────────────────
  await supabase
    .from("automation_sources")
    .update({
      last_used_at: new Date().toISOString(),
      request_count: (source.request_count ?? 0) + 1,
    })
    .eq("id", source.id);

  const unassignedWarning =
    source.assign_mode === "round_robin" && !roundRobinRep
      ? " (no salesperson is set to receive new leads — left unassigned)"
      : "";

  await supabase.from("automation_runs").insert({
    kind: "intake",
    source_id: source.id,
    lead_id: created[0]?.id ?? null,
    status: failed.length > 0 && created.length === 0 ? "error" : "success",
    message: `${created.length} created, ${skipped.length} duplicate, ${failed.length} failed${unassignedWarning}`,
    detail: { created, skipped, failed },
  });

  return json(
    {
      ok: failed.length === 0,
      source: source.name,
      created: created.length,
      duplicates: skipped.length,
      failed: failed.length,
      leads: created,
      errors: failed.length ? failed : undefined,
    },
    failed.length > 0 && created.length === 0 ? 422 : 200,
  );
});
