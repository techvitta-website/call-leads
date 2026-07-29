// ═══════════════════════════════════════════════════════════════
// gemini-proxy — server-side Gemini calls.
//
// The API key lives in Supabase Vault and is read with the service role,
// so it never reaches the browser. Callers must present a valid Supabase
// session token, which means only logged-in CRM users can spend quota.
//
// POST { prompt, temperature?, maxOutputTokens?, json? } -> { text, model }
//
// Rotate the key with:  select public.rotate_gemini_key('NEW_KEY');
// It takes effect within KEY_TTL_MS — no redeploy needed.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Google retires model IDs periodically. Try in order, remember what works.
const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash-001",
  "gemini-1.5-flash",
];

// Cache the key briefly so we don't hit the DB on every call, but not
// forever — otherwise a rotated key wouldn't take effect until the isolate
// recycled, which could be hours.
const KEY_TTL_MS = 5 * 60 * 1000;

let workingModel: string | null = null;
let cachedKey: string | null = null;
let cachedAt = 0;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function geminiKey(forceRefresh = false): Promise<string> {
  const fresh = Date.now() - cachedAt < KEY_TTL_MS;
  if (cachedKey && fresh && !forceRefresh) return cachedKey;

  // Prefer a real environment secret if one has been set; fall back to Vault.
  const envKey = Deno.env.get("GEMINI_API_KEY");
  if (envKey) {
    cachedKey = envKey;
    cachedAt = Date.now();
    return cachedKey;
  }

  const { data, error } = await admin.rpc("get_gemini_key");
  if (error || !data) {
    throw new Error(
      "No Gemini API key configured. Store one in Supabase Vault under the name 'gemini_api_key'.",
    );
  }
  cachedKey = data as string;
  cachedAt = Date.now();
  return cachedKey;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Only logged-in CRM users may spend quota ──────────────────
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in to use the AI features." }, 401);

  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return json({ error: "Your session has expired. Sign in again." }, 401);
  }

  // ── Validate input ───────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be valid JSON." }, 400);
  }

  const prompt = String(body?.prompt ?? "").trim();
  if (!prompt) return json({ error: "A prompt is required." }, 400);
  if (prompt.length > 60000) {
    return json({ error: "Prompt is too long. Reduce the number of leads and try again." }, 400);
  }

  const payload = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: Math.min(Math.max(Number(body?.temperature ?? 0.8), 0), 2),
      maxOutputTokens: Math.min(Math.max(Number(body?.maxOutputTokens ?? 8192), 1), 8192),
      ...(body?.json === false ? {} : { responseMimeType: "application/json" }),
    },
  });

  let key: string;
  try {
    key = await geminiKey();
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }

  let retriedWithFreshKey = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const tryOrder = workingModel
      ? [workingModel, ...MODEL_CANDIDATES.filter((m) => m !== workingModel)]
      : MODEL_CANDIDATES;

    let lastError = "";
    let authRejected = false;

    for (const model of tryOrder) {
      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-goog-api-key": key },
            body: payload,
            signal: AbortSignal.timeout(120000),
          },
        );
      } catch (e) {
        return json({ error: `Could not reach Gemini: ${String((e as Error).message)}` }, 502);
      }

      if (res.ok) {
        workingModel = model;
        const data = await res.json();

        const blocked = data?.promptFeedback?.blockReason;
        if (blocked) {
          return json(
            { error: `Gemini blocked this request (${blocked}). Try rephrasing your targeting criteria.` },
            400,
          );
        }

        const text = (data?.candidates?.[0]?.content?.parts ?? [])
          .map((p: any) => p?.text ?? "")
          .join("")
          .trim();

        if (!text) {
          const finish = data?.candidates?.[0]?.finishReason;
          return json(
            {
              error:
                finish === "MAX_TOKENS"
                  ? "Gemini hit the output limit. Try generating fewer leads at a time."
                  : "Gemini returned an empty response. Please try again.",
            },
            502,
          );
        }

        return json({ text, model });
      }

      const errText = await res.text();
      lastError = `${res.status}: ${errText.slice(0, 300)}`;

      const modelMissing =
        res.status === 404 || /not found|not supported|unsupported model/i.test(errText);

      if (!modelMissing) {
        // Never echo Google's raw error to the browser — it can contain the key.
        if (res.status === 401 || res.status === 403) {
          console.error("Gemini auth failure:", lastError);
          authRejected = true;
          break;
        }
        if (res.status === 429) {
          return json({ error: "Gemini rate limit reached. Wait a minute and try again." }, 429);
        }
        console.error("Gemini error:", lastError);
        return json({ error: `Gemini request failed (HTTP ${res.status}).` }, 502);
      }
    }

    // A rejected key usually means it was just rotated and we're holding a
    // stale copy. Re-read from Vault once and retry before giving up.
    if (authRejected && !retriedWithFreshKey) {
      retriedWithFreshKey = true;
      try {
        key = await geminiKey(true);
      } catch {
        return json({ error: "The Gemini API key was rejected and no replacement is configured." }, 502);
      }
      continue;
    }

    if (authRejected) {
      return json(
        { error: "The Gemini API key was rejected. An administrator needs to rotate it." },
        502,
      );
    }

    console.error("No Gemini model responded. Last error:", lastError);
    return json({ error: "No available Gemini model responded. Please try again shortly." }, 502);
  }

  return json({ error: "The AI service is unavailable right now. Please try again." }, 502);
});
