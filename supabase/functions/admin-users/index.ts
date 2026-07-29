// ═══════════════════════════════════════════════════════════════
// admin-users — user administration with the service role.
//
// Password changes, role changes and login suspension all require the
// Supabase admin API, which must never run in a browser. Everything here
// is gated on the CALLER's role, read fresh from the database on every
// request rather than trusted from the token.
//
// Who can do what:
//   super_admin  everything, on anyone
//   owner        everything except touching a super admin
//   manager      create / reset / suspend SALESPEOPLE only
//   salesman     nothing
//
// Three invariants are enforced regardless of role:
//   - nobody can grant a role higher than their own (no escalation)
//   - nobody can administer someone who outranks them
//   - the last administrator who can actually sign in cannot be demoted,
//     suspended or deleted
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

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ROLES = ["super_admin", "owner", "manager", "salesman"] as const;
type Role = (typeof ROLES)[number];

/** Higher number = more authority. */
const RANK: Record<Role, number> = { salesman: 1, manager: 2, owner: 3, super_admin: 4 };

/** "super_admin" is a database value, not something to show a person. */
const LABEL: Record<Role, string> = {
  super_admin: "super admin",
  owner: "owner",
  manager: "manager",
  salesman: "salesperson",
};
const label = (r: string) => LABEL[r as Role] ?? r;

/** Roles that administer the whole account rather than a slice of it. */
const isAdminRole = (r: Role) => r === "super_admin" || r === "owner";

/** Supabase's "banned forever" is a very long duration, not a flag. */
const FOREVER = "876000h";

function strongEnough(pw: string): string | null {
  if (!pw || pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
  return null;
}

/**
 * Reject passwords that appear in known breach corpora.
 *
 * This is the same check as Supabase's "leaked password protection", done
 * here because that setting lives in the dashboard. Uses the k-anonymity
 * range API: we send the first five characters of the SHA-1 hash and get
 * back every suffix sharing that prefix, so the password itself — and even
 * its full hash — never leaves this function.
 *
 * Fails OPEN. If Have I Been Pwned is unreachable, an administrator still
 * needs to be able to reset a locked-out colleague's password; the length,
 * letter and digit rules above still apply. A breach check is worth having
 * but not worth making password resets depend on a third party's uptime.
 */
async function seenInBreach(pw: string): Promise<boolean> {
  try {
    const bytes = new TextEncoder().encode(pw);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    const sha1 = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "techvitta-crm" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hash, count] = line.trim().split(":");
      // Padded responses include decoy entries with a count of zero.
      if (hash === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function passwordProblem(pw: string): Promise<string | null> {
  const weak = strongEnough(pw);
  if (weak) return weak;
  if (await seenInBreach(pw)) {
    return "That password has appeared in a known data breach. Pick a different one — the Suggest button generates a safe one.";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Identify the caller ──────────────────────────────────────
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in to manage users." }, 401);

  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData?.user) {
    return json({ error: "Your session has expired. Sign in again." }, 401);
  }

  // Read the role from the database, never from the JWT — a token could
  // carry stale metadata from before a demotion.
  const { data: me } = await admin
    .from("users")
    .select("id, email, role, full_name")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!me) return json({ error: "Your account has no profile record." }, 403);

  const myRole = String(me.role) as Role;
  if (!isAdminRole(myRole) && myRole !== "manager") {
    return json({ error: "Only administrators and managers can manage users." }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be valid JSON." }, 400);
  }

  const action = String(body?.action ?? "");

  // ── Helpers ──────────────────────────────────────────────────
  const listAuthUsers = async () => {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return data?.users ?? [];
  };

  const isSuspended = (a: any) => {
    const until = a?.banned_until ? new Date(a.banned_until).getTime() : 0;
    return until > Date.now();
  };

  /**
   * How many people holding one of these roles can actually sign in.
   *
   * Counting profile rows alone is wrong: a row in `users` with no matching
   * auth account cannot log in, and neither can a suspended one. Seed and
   * demo data leaves exactly those rows behind, so a naive count reports two
   * administrators where there is really one — and then happily lets you
   * demote the only real one.
   */
  const signableCount = async (roles: Role[]) => {
    const { data: rows } = await admin
      .from("users")
      .select("id")
      .in("role", roles);

    const ids = new Set((rows ?? []).map((r: any) => r.id));
    if (ids.size === 0) return 0;

    const auth = await listAuthUsers();
    return auth.filter((u: any) => ids.has(u.id) && !isSuspended(u)).length;
  };

  /**
   * Would this change leave the account unadministrable?
   *
   * Two separate cliffs, and the super-admin one is the sharper of the two:
   * no lower role can grant super_admin (the rank check forbids granting
   * above your own tier), so losing the last one makes the tier permanently
   * unreachable — there is no way back short of editing the database by hand.
   */
  const strandingReason = async (targetRole: Role): Promise<string | null> => {
    if (targetRole === "super_admin" && (await signableCount(["super_admin"])) <= 1) {
      return "This is the only super admin who can sign in. No other role is allowed to grant super admin, so there would be no way to restore it. Promote someone else first.";
    }
    if (isAdminRole(targetRole) && (await signableCount(["super_admin", "owner"])) <= 1) {
      return "This is the only administrator who can sign in. Promote someone else to owner first.";
    }
    return null;
  };

  const loadTarget = async (id: string) => {
    const { data } = await admin
      .from("users")
      .select("id, email, role, full_name")
      .eq("id", id)
      .maybeSingle();
    return data;
  };

  /** Can the caller act on this target at all? */
  const mayAdminister = (targetRole: Role) => {
    if (myRole === "super_admin") return true;
    // An owner runs everything except a super admin, who outranks them.
    if (myRole === "owner") return targetRole !== "super_admin";
    // A manager may only touch salespeople — never a peer or a superior.
    return targetRole === "salesman";
  };

  try {
    // ── LIST ───────────────────────────────────────────────────
    if (action === "list") {
      const { data: profiles } = await admin
        .from("users")
        .select("id, email, full_name, role, receives_leads, created_at")
        .order("role")
        .order("email");

      // Merge in auth state so the UI can show suspended / never-signed-in.
      const authUsers = await listAuthUsers();
      const authById = new Map(authUsers.map((u: any) => [u.id, u]));

      const users = (profiles ?? []).map((p: any) => {
        const a: any = authById.get(p.id);
        return {
          ...p,
          last_sign_in_at: a?.last_sign_in_at ?? null,
          email_confirmed: Boolean(a?.email_confirmed_at),
          // Supabase stores a ban as a future timestamp, not a boolean.
          suspended: isSuspended(a),
          // No auth account means the row is a leftover that cannot sign in.
          // The UI has to say so, or a dead row reads as a working account.
          has_auth_account: Boolean(a),
        };
      });

      // Auth accounts with no profile row are the opposite hazard: they can
      // authenticate but carry no role, so they never appear in any list and
      // this function refuses them. Surface them rather than leave them
      // invisible.
      const profileIds = new Set((profiles ?? []).map((p: any) => p.id));
      const orphanLogins = authUsers
        .filter((u: any) => !profileIds.has(u.id))
        .map((u: any) => ({
          id: u.id,
          email: u.email,
          last_sign_in_at: u.last_sign_in_at ?? null,
          suspended: isSuspended(u),
        }));

      return json({
        ok: true,
        me: { id: me.id, role: myRole },
        users,
        orphan_logins: orphanLogins,
      });
    }

    // ── CREATE ─────────────────────────────────────────────────
    // Runs before the target lookup because there is no target yet.
    if (action === "create") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      const password = String(body?.password ?? "");
      const fullName = String(body?.fullName ?? "").trim();
      const role = String(body?.role ?? "salesman") as Role;

      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: "Enter a valid email address." }, 400);
      }
      const weak = await passwordProblem(password);
      if (weak) return json({ error: weak }, 400);
      if (!ROLES.includes(role)) return json({ error: "Unknown role." }, 400);

      if (RANK[role] > RANK[myRole]) {
        return json({ error: `As a ${label(myRole)} you cannot create a ${label(role)}.` }, 403);
      }
      // Managers may only ever create salespeople — creating a peer would be
      // the same lateral escalation that set_role blocks.
      if (!isAdminRole(myRole) && role !== "salesman") {
        return json({ error: "Only an administrator can create managers or owners." }, 403);
      }

      // createUser with email_confirm skips the verification email — these
      // are staff accounts handed out internally, not public signups.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role },
      });

      if (createErr) {
        const msg = String(createErr.message ?? createErr);
        return json(
          {
            error: /already been registered|already exists/i.test(msg)
              ? `${email} already has an account.`
              : msg,
          },
          400,
        );
      }

      // A trigger may already have created the profile row; upsert either way
      // so the role we asked for is the role that sticks.
      await admin.from("users").upsert(
        {
          id: created.user!.id,
          email,
          full_name: fullName || email.split("@")[0],
          role,
        },
        { onConflict: "id" },
      );

      return json({
        ok: true,
        message: `Created ${email} as a ${role}.`,
        userId: created.user!.id,
      });
    }

    // ── DELETE AN ORPHAN LOGIN ─────────────────────────────────
    // An auth account with no profile row. It has no role, so it cannot be
    // administered through the normal path — the lookup below would 404 —
    // but it can still authenticate, which is exactly why it needs removing.
    if (action === "delete_orphan_login") {
      if (!isAdminRole(myRole)) {
        return json({ error: "Only an administrator can remove a stray login." }, 403);
      }

      const id = String(body?.userId ?? "");
      if (!id) return json({ error: "No user specified." }, 400);
      if (id === me.id) return json({ error: "You cannot delete your own account." }, 409);

      // Refuse if a profile exists — that is a normal account and must go
      // through `delete`, which checks lead ownership first.
      const { data: existing } = await admin
        .from("users")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (existing) {
        return json({ error: "That account has a profile — remove it from the list instead." }, 409);
      }

      const { error } = await admin.auth.admin.deleteUser(id);
      if (error && !/not.?found/i.test(String(error.message ?? error))) throw error;

      return json({ ok: true, message: "Stray login removed." });
    }

    // Everything below needs a target.
    const targetId = String(body?.userId ?? "");
    if (!targetId) return json({ error: "No user specified." }, 400);

    const target = await loadTarget(targetId);
    if (!target) return json({ error: "That user no longer exists." }, 404);

    const targetRole = String(target.role) as Role;
    if (!mayAdminister(targetRole)) {
      return json(
        {
          error:
            myRole === "owner"
              ? `${target.email} is a ${label(targetRole)}, who outranks you. Only another super admin can manage them.`
              : `As a ${label(myRole)} you can only manage salespeople. ${target.email} is a ${label(targetRole)}.`,
        },
        403,
      );
    }

    // ── RESET PASSWORD ─────────────────────────────────────────
    if (action === "reset_password") {
      const password = String(body?.password ?? "");
      const weak = await passwordProblem(password);
      if (weak) return json({ error: weak }, 400);

      const { error } = await admin.auth.admin.updateUserById(targetId, { password });
      if (error) throw error;

      return json({
        ok: true,
        message: `Password reset for ${target.email}. Share it with them and ask them to change it.`,
      });
    }

    // ── CHANGE ROLE ────────────────────────────────────────────
    if (action === "set_role") {
      const newRole = String(body?.role ?? "") as Role;
      if (!ROLES.includes(newRole)) return json({ error: "Unknown role." }, 400);

      // Role assignment is administrator-only. Allowing a manager to grant
      // "manager" is lateral escalation — it lets one manager mint peers
      // without an administrator's involvement, which defeats the point of
      // having tiers at all.
      if (!isAdminRole(myRole)) {
        return json(
          { error: "Only an administrator can change someone's role. Ask the account owner." },
          403,
        );
      }

      // Never grant above your own rank. This is what stops an owner from
      // making themselves — or anyone else — a super admin.
      if (RANK[newRole] > RANK[myRole]) {
        return json(
          { error: `As a ${label(myRole)} you cannot grant the ${label(newRole)} role.` },
          403,
        );
      }

      // Don't strand the account. Only relevant when the change actually
      // removes authority — promoting an owner to super admin is fine.
      if (RANK[newRole] < RANK[targetRole]) {
        const reason = await strandingReason(targetRole);
        if (reason) return json({ error: reason }, 409);
      }

      const { error } = await admin
        .from("users")
        .update({ role: newRole })
        .eq("id", targetId);
      if (error) throw error;

      // Keep auth metadata in step so anything reading it agrees. Read the
      // TARGET's metadata — using the caller's would overwrite their profile.
      const { data: targetAuth } = await admin.auth.admin.getUserById(targetId);
      await admin.auth.admin.updateUserById(targetId, {
        user_metadata: { ...(targetAuth?.user?.user_metadata ?? {}), role: newRole },
      });

      return json({
        ok: true,
        message: `${target.full_name || target.email} is now a ${newRole}.`,
      });
    }

    // ── LEAD ROUTING ───────────────────────────────────────────
    // Whether round-robin should hand new leads to this person. Dormant and
    // test accounts sit at zero open leads forever, so without this flag the
    // "fewest open leads" rule sends every automated lead to a dead inbox.
    if (action === "set_receives_leads") {
      const receives = body?.receivesLeads !== false;

      const { error } = await admin
        .from("users")
        .update({ receives_leads: receives })
        .eq("id", targetId);
      if (error) throw error;

      return json({
        ok: true,
        message: receives
          ? `${target.email} is now in the rotation for new leads.`
          : `${target.email} will no longer be given new leads automatically. Existing leads are untouched.`,
      });
    }

    // ── SUSPEND / RESTORE LOGIN ────────────────────────────────
    if (action === "set_active") {
      const active = body?.active !== false;

      if (!active && targetId === me.id) {
        return json({ error: "You cannot suspend your own login." }, 409);
      }
      if (!active) {
        const reason = await strandingReason(targetRole);
        if (reason) return json({ error: reason }, 409);
      }

      const { error } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: active ? "none" : FOREVER,
      });
      if (error) throw error;

      return json({
        ok: true,
        message: active
          ? `${target.email} can sign in again.`
          : `${target.email} can no longer sign in. Their leads and history are untouched.`,
      });
    }

    // ── DELETE ─────────────────────────────────────────────────
    if (action === "delete") {
      if (targetId === me.id) {
        return json({ error: "You cannot delete your own account." }, 409);
      }
      const reason = await strandingReason(targetRole);
      if (reason) return json({ error: reason }, 409);

      // Leads point at users; orphaning them silently would lose ownership
      // history, so hand them back to the person doing the deleting.
      const { count: leadCount } = await admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", targetId);

      if ((leadCount ?? 0) > 0 && body?.reassignTo) {
        await admin
          .from("leads")
          .update({ assigned_to: String(body.reassignTo) })
          .eq("assigned_to", targetId);
      } else if ((leadCount ?? 0) > 0) {
        return json(
          {
            error: `${target.email} still has ${leadCount} lead(s). Choose someone to reassign them to first, or suspend the login instead of deleting.`,
            needs_reassign: true,
            lead_count: leadCount,
          },
          409,
        );
      }

      await admin.from("users").delete().eq("id", targetId);

      // A leftover profile row has no auth account to delete, and the admin
      // API errors rather than no-ops on a missing user. Removing the row is
      // still a success — don't fail the whole request over it.
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error && !/not.?found/i.test(String(error.message ?? error))) throw error;

      return json({ ok: true, message: `${target.email} has been removed.` });
    }

    return json({ error: `Unknown action "${action}".` }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
