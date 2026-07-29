// ═══════════════════════════════════════════════════════════════
// One identity lookup per page load, shared by everything that needs it.
//
// Three separate components each resolved the signed-in user on mount — the
// route guard, the sidebar, and the page itself — and each did its own
// getUser() plus a select. supabase-js serialises every auth call behind a
// single lock, so those piled up on the critical path and the page could sit
// on its loading spinner indefinitely.
//
// This resolves once and de-duplicates concurrent callers: the first to ask
// pays for the request, the rest await the same promise.
//
// Caching client-side is not a security decision. Row level security and the
// admin-users function decide what a person may actually do; this only
// decides which menu to draw.
// ═══════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabase";
import { normalizeRole, type Role } from "@/lib/roles";

export type Identity = { userId: string; email: string; role: Role | null };

let cached: { value: Identity | null; at: number } | null = null;
let inflight: Promise<Identity | null> | null = null;

/** Short enough that a demotion takes effect quickly without re-requesting on
 *  every navigation. The data itself is protected server-side either way. */
const TTL_MS = 30_000;

/** Nothing here should ever be able to wedge the interface. If the network
 *  stalls we return null and the caller falls back rather than spinning. */
const TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then((v) => {
      clearTimeout(timer);
      resolve(v);
    }).catch(() => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

export function clearIdentityCache(): void {
  cached = null;
  inflight = null;
}

// A sign-in or sign-out always invalidates — otherwise the next person to use
// the same browser inherits the previous person's menu until the TTL.
//
// Only these events. Listening to everything would also catch INITIAL_SESSION
// and TOKEN_REFRESHED, which fire during a normal page load and would empty
// the cache exactly when it had just been filled.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
    clearIdentityCache();
  }
});

async function fetchIdentity(): Promise<Identity | null> {
  const res = await withTimeout(supabase.auth.getUser(), TIMEOUT_MS);
  const user = res?.data?.user;
  if (!user) return null;

  // PostgrestBuilder is thenable but not a real Promise, so wrap it in one
  // before racing it against the timeout.
  const profile = await withTimeout(
    Promise.resolve(
      supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
    ),
    TIMEOUT_MS,
  );

  return {
    userId: user.id,
    email: user.email ?? "",
    // Metadata is the fallback when the profile row is missing or the lookup
    // timed out — better a stale role than no navigation at all.
    role:
      normalizeRole((profile as any)?.data?.role) ??
      normalizeRole(user.user_metadata?.role),
  };
}

export async function getIdentity(force = false): Promise<Identity | null> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (inflight) return inflight;

  inflight = fetchIdentity()
    .then((v) => {
      cached = { value: v, at: Date.now() };
      return v;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export async function getCurrentRole(force = false): Promise<Role | null> {
  return (await getIdentity(force))?.role ?? null;
}
