// ═══════════════════════════════════════════════════════════════
// One role lookup per page load, shared by everything that needs it.
//
// Three separate components each resolved the signed-in user's role on
// mount — the route guard, the sidebar, and the page itself — and each did
// it with its own getUser() + select round trip. Six serialised requests
// before anything could render, which reads as the app hanging.
//
// This caches the answer and de-duplicates concurrent callers, so the first
// component to ask pays for the request and the rest await the same promise.
//
// Caching the role client-side is not a security decision. Row level
// security and the admin-users function decide what a person may actually
// do; this only decides which menu to draw.
// ═══════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabase";
import { normalizeRole, type Role } from "@/lib/roles";

type Entry = { userId: string; role: Role | null; at: number };

let cached: Entry | null = null;
let inflight: Promise<Role | null> | null = null;

/** Short enough that a demotion takes effect quickly without re-requesting
 *  on every navigation. The data itself is protected server-side either way. */
const TTL_MS = 30_000;

export function clearRoleCache(): void {
  cached = null;
  inflight = null;
}

// A sign-in or sign-out always invalidates — otherwise the next person to
// use the same browser inherits the previous person's menu until the TTL.
//
// Only these events. Listening to everything would also catch INITIAL_SESSION
// and TOKEN_REFRESHED, which fire during a normal page load and would wipe the
// cache the moment it was filled — turning the one saved request back into
// three.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
    clearRoleCache();
  }
});

async function fetchRole(): Promise<Role | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    cached = null;
    return null;
  }

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role =
    normalizeRole(data?.role) ?? normalizeRole(user.user_metadata?.role);

  cached = { userId: user.id, role, at: Date.now() };
  return role;
}

export async function getCurrentRole(force = false): Promise<Role | null> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.role;
  if (inflight) return inflight;

  inflight = fetchRole().finally(() => {
    inflight = null;
  });
  return inflight;
}
