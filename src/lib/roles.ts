// ═══════════════════════════════════════════════════════════════
// The role hierarchy, in one place.
//
// Previously each page carried its own ad-hoc check, and most of them
// compared against "manager" exactly — which silently locked the highest
// role out of ten pages. Anything that needs to know what a role may do
// should ask here rather than compare strings.
// ═══════════════════════════════════════════════════════════════

export const ROLES = ["super_admin", "owner", "manager", "salesman"] as const;
export type Role = (typeof ROLES)[number];

/** Higher number = more authority. Mirrors RANK in the admin-users function. */
export const RANK: Record<Role, number> = {
  salesman: 1,
  manager: 2,
  owner: 3,
  super_admin: 4,
};

/** What to call each role in front of a person. */
export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  owner: "Owner",
  manager: "Manager",
  salesman: "Salesperson",
};

export function normalizeRole(value: unknown): Role | null {
  const r = String(value ?? "").toLowerCase().trim();
  return (ROLES as readonly string[]).includes(r) ? (r as Role) : null;
}

/** Runs the whole account. */
export const isAdmin = (r: Role | null | undefined): boolean =>
  r === "super_admin" || r === "owner";

/** Works across the whole business rather than a personal list of leads. */
export const isStaff = (r: Role | null | undefined): boolean =>
  isAdmin(r) || r === "manager";

/** Convenience groups for route declarations. */
export const ADMIN_ONLY: Role[] = ["super_admin", "owner"];
export const STAFF: Role[] = ["super_admin", "owner", "manager"];
export const EVERYONE: Role[] = ["super_admin", "owner", "manager", "salesman"];

/** Where each role goes when they land on the app with nowhere specific to be. */
export const HOME_FOR: Record<Role, string> = {
  super_admin: "/owner",
  owner: "/owner",
  manager: "/manager",
  salesman: "/salesman",
};

export function homeFor(role: Role | null | undefined): string {
  return role ? HOME_FOR[role] : "/";
}

/**
 * Personal-scope pages: a rep's own leads, their own follow-ups, their own
 * stats. Administrators are included so they can see what a rep sees;
 * managers are not, because these pages filter to the signed-in user and
 * would simply render empty for them.
 */
export const SALES_SCOPE: Role[] = ["super_admin", "owner", "salesman"];
