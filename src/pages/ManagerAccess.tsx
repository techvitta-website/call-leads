import { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck,
  KeyRound,
  UserPlus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Crown,
  Briefcase,
  Phone,
  Ban,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { RANK, isAdmin, type Role } from "@/lib/roles";

const ROLE_META: Record<Role, { label: string; icon: any; cls: string; can: string }> = {
  super_admin: {
    label: "Super Admin",
    icon: ShieldCheck,
    cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
    can: "Every feature in the application, and the only role that can appoint or remove another super admin.",
  },
  owner: {
    label: "Owner",
    icon: Crown,
    cls: "bg-amber-100 text-amber-800 border-amber-200",
    can: "Everything except managing a super admin. Can change roles up to owner and reset anyone else's password.",
  },
  manager: {
    label: "Manager",
    icon: Briefcase,
    cls: "bg-purple-100 text-purple-800 border-purple-200",
    can: "All leads, projects, automations and AI tools. Can reset salespeople's passwords, but cannot change anyone's role.",
  },
  salesman: {
    label: "Salesperson",
    icon: Phone,
    cls: "bg-blue-100 text-blue-800 border-blue-200",
    can: "Only their own assigned leads. No access to settings, automations or other people's data.",
  },
};

const WORDS = ["Falcon", "Harbour", "Cedar", "Lantern", "Marble", "Willow", "Compass", "Ember"];
// No 0/O/1/l/I — these get misread when a password is dictated over a phone.
const LETTERS = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALPHABET = LETTERS + DIGITS;

/** Cryptographically random, and readable enough to read aloud. */
function suggestPassword(): string {
  // Math.random() is not a CSPRNG, and a word plus four digits is only ~72,000
  // possibilities — trivially guessable for someone who has seen the pattern.
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  const word = WORDS[bytes[0] % WORDS.length];

  const tail = [];
  for (let i = 1; i < 7; i++) tail.push(ALPHABET[bytes[i] % ALPHABET.length]);
  // The server requires a digit. Drawing freely from the alphabet leaves a
  // ~11% chance of six letters and a rejected password, so plant one at a
  // random position rather than trusting the draw.
  tail[bytes[7] % tail.length] = DIGITS[bytes[0] % DIGITS.length];

  return `${word}-${tail.join("")}`;
}

export default function ManagerAccess() {
  // The sidebar differs by role, and this page is reachable by owners too —
  // hardcoding "manager" would strand an owner without their own navigation.
  const { userRole } = useAuth();

  const [users, setUsers] = useState<any[]>([]);
  const [orphans, setOrphans] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [meRole, setMeRole] = useState<Role | null>(null);
  const [meId, setMeId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("salesman");
  const [newPassword, setNewPassword] = useState(suggestPassword());

  // Reset password
  const [resetting, setResetting] = useState<any | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [copied, setCopied] = useState(false);

  // Delete
  const [deleting, setDeleting] = useState<any | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  const call = useCallback(async (payload: Record<string, any>) => {
    const { data, error: fnErr } = await supabase.functions.invoke("admin-users", {
      body: payload,
    });
    if (fnErr) {
      let detail = "";
      try {
        const ctx = (fnErr as any)?.context;
        if (ctx && typeof ctx.json === "function") detail = (await ctx.json())?.error ?? "";
      } catch {
        /* fall through */
      }
      throw new Error(detail || (fnErr as any).message || "Request failed.");
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await call({ action: "list" });
      setUsers(data.users ?? []);
      setOrphans(data.orphan_logins ?? []);
      setMeRole(data.me?.role ?? null);
      setMeId(data.me?.id ?? "");
    } catch (e: any) {
      setError(e?.message || "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  // "Can this person administer others freely?" — true for both admin tiers.
  const canAdminister = isAdmin(meRole);
  const myRank = meRole ? RANK[meRole] : 0;
  // Prefer the role the server just told us; fall back to the client hook
  // while the first request is still in flight.
  const sidebarRole = (meRole ?? userRole ?? "manager") as Role;

  const run = async (key: string, payload: Record<string, any>, after?: () => void) => {
    setBusy(key);
    setError(null);
    try {
      const res = await call(payload);
      setNotice(res.message || "Done.");
      await load();
      after?.();
    } catch (e: any) {
      setError(e?.message || "That didn't work.");
    } finally {
      setBusy(null);
    }
  };

  // Any surviving account can inherit leads — managers hold leads too, so
  // restricting this to salespeople can leave the list empty and block the
  // deletion outright.
  const reassignCandidates = users.filter(
    (u) => u.id !== deleting?.id && !u.suspended,
  );

  const q = search.trim().toLowerCase();
  const visible = q
    ? users.filter((u) =>
        [u.full_name, u.email, u.role].some((v) =>
          String(v ?? "").toLowerCase().includes(q),
        ),
      )
    : users;

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar role={sidebarRole} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-slate-500">Loading users…</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role={sidebarRole} />
      <main className="flex-1 overflow-auto p-4 pt-20 sm:pt-16 lg:p-8 lg:pt-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1 flex items-center gap-2 text-3xl font-bold text-slate-900">
              <ShieldCheck className="h-7 w-7 text-emerald-600" />
              Users &amp; Access
            </h1>
            <p className="text-slate-500">
              Who can sign in, what they can see, and their passwords
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              onClick={() => {
                setNewEmail("");
                setNewName("");
                setNewRole("salesman");
                setNewPassword(suggestPassword());
                setShowCreate(true);
              }}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              <UserPlus className="h-4 w-4" />
              Add person
            </Button>
          </div>
        </div>

        {!canAdminister && (
          <Alert className="mb-4 border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              You're signed in as a manager. You can add salespeople and reset their
              passwords, but only an administrator can change anyone's role.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="mb-4 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        {notice && (
          <Alert className="mb-4 border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800">{notice}</AlertDescription>
          </Alert>
        )}

        {/* What each role means */}
        <Card className="mb-6 border-slate-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {(Object.keys(ROLE_META) as Role[]).map((r) => {
              const m = ROLE_META[r];
              const Icon = m.icon;
              const n = users.filter((u) => u.role === r).length;
              return (
                <div key={r}>
                  <div className="mb-1 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-slate-500" />
                    <span className="font-semibold text-slate-900">{m.label}</span>
                    <Badge variant="outline" className="text-xs">
                      {n}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">{m.can}</p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* User list */}
        <div className="mb-3 flex items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or role…"
            className="max-w-sm"
          />
          <span className="text-sm text-slate-500">
            {visible.length} of {users.length}
          </span>
        </div>

        <div className="space-y-3">
          {visible.length === 0 && (
            <Card className="border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Nobody matches “{search}”.
            </Card>
          )}
          {visible.map((u) => {
            const role = u.role as Role;
            const m = ROLE_META[role] ?? ROLE_META.salesman;
            const Icon = m.icon;
            const isMe = u.id === meId;
                        // You may only act on someone you outrank, or on a peer if you
            // are an administrator. An owner cannot touch a super admin.
            const canTouch = canAdminister
              ? RANK[role] <= myRank
              : role === "salesman";

            return (
              <Card
                key={u.id}
                className={`border-slate-200 bg-white p-4 ${u.suspended ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {u.full_name || u.email}
                      </span>
                      <Badge className={`text-xs border ${m.cls}`}>
                        <Icon className="mr-1 inline h-3 w-3" />
                        {m.label}
                      </Badge>
                      {isMe && (
                        <Badge variant="outline" className="text-xs">
                          You
                        </Badge>
                      )}
                      {u.suspended && (
                        <Badge className="bg-red-100 text-xs text-red-700">
                          <Ban className="mr-1 inline h-3 w-3" />
                          Suspended
                        </Badge>
                      )}
                      {/* A row with no auth account looks like a working
                          account in every other respect — say plainly that
                          it isn't one. */}
                      {u.has_auth_account === false && (
                        <Badge className="bg-slate-200 text-xs text-slate-700">
                          No login — leftover record
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-0.5 text-xs text-slate-500">
                      <div>{u.email}</div>
                      <div>
                        {u.last_sign_in_at
                          ? `Last signed in ${new Date(u.last_sign_in_at).toLocaleDateString()}`
                          : "Has never signed in"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Role. Locked on your own account: demoting yourself
                        would take away this page and you'd need another administrator
                        to undo it. Same reasoning as the self-suspend guard. */}
                    <Select
                      value={role}
                      disabled={!canAdminister || isMe || busy === `role-${u.id}`}
                      onValueChange={(v) =>
                        run(`role-${u.id}`, { action: "set_role", userId: u.id, role: v })
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-36 text-xs"
                        title={isMe ? "Another administrator has to change your own role" : undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {/* You cannot grant a role above your own, so an
                            owner never sees Super Admin as an option. */}
                        {(["super_admin", "owner", "manager", "salesman"] as Role[])
                          .filter((r) => RANK[r] <= myRank)
                          .map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_META[r].label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    {/* Lead routing — only meaningful for salespeople, who are
                        the ones round-robin assigns to. */}
                    {role === "salesman" && (
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={u.receives_leads !== false}
                          disabled={!canTouch || busy === `leads-${u.id}`}
                          onCheckedChange={(v) =>
                            run(`leads-${u.id}`, {
                              action: "set_receives_leads",
                              userId: u.id,
                              receivesLeads: v,
                            })
                          }
                        />
                        <span className="text-xs text-slate-500">Gets new leads</span>
                      </div>
                    )}

                    {/* Can sign in */}
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={!u.suspended}
                        disabled={!canTouch || isMe || busy === `active-${u.id}`}
                        onCheckedChange={(v) =>
                          run(`active-${u.id}`, {
                            action: "set_active",
                            userId: u.id,
                            active: v,
                          })
                        }
                      />
                      <span className="text-xs text-slate-500">Can sign in</span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canTouch}
                      onClick={() => {
                        setResetting(u);
                        setResetPassword(suggestPassword());
                        setCopied(false);
                      }}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Reset password
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canTouch || isMe}
                      onClick={() => {
                        setDeleting(u);
                        setReassignTo("");
                      }}
                      className="h-8 px-2 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Sign-ins that belong to nobody. They authenticate but carry no
            role, so they show up nowhere else in the app. */}
        {canAdminister && orphans.length > 0 && (
          <Card className="mt-6 border-amber-200 bg-amber-50 p-5">
            <div className="mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-700" />
              <span className="font-semibold text-amber-900">
                {orphans.length} sign-in{orphans.length === 1 ? "" : "s"} with no profile
              </span>
            </div>
            <p className="mb-3 text-sm text-amber-800">
              These can still sign in, but they have no role, so they land nowhere
              and appear in no list. Either give them a role or remove them.
            </p>
            <div className="space-y-2">
              {orphans.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-2"
                >
                  <div className="text-sm">
                    <span className="font-medium text-slate-900">{o.email}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {o.last_sign_in_at
                        ? `last signed in ${new Date(o.last_sign_in_at).toLocaleDateString()}`
                        : "never signed in"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === `orphan-${o.id}`}
                    onClick={() =>
                      run(`orphan-${o.id}`, {
                        action: "delete_orphan_login",
                        userId: o.id,
                      })
                    }
                    className="h-8 gap-1.5 text-xs text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove login
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Add person ─────────────────────────────────────── */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add a person</DialogTitle>
              <DialogDescription>
                They can sign in immediately — no confirmation email is sent. Share
                the password with them directly.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Priya Sharma"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="priya@techvitta.in"
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["salesman", "manager", "owner", "super_admin"] as Role[]).map((r) => {
                      const allowed = r === "salesman" ? true : canAdminister && RANK[r] <= myRank;
                      return (
                        <SelectItem key={r} value={r} disabled={!allowed}>
                          {ROLE_META[r].label}
                          {!allowed && " (not available to you)"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-slate-500">{ROLE_META[newRole].can}</p>
              </div>
              <div>
                <Label>Starting password</Label>
                <div className="flex gap-2">
                  <Input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setNewPassword(suggestPassword())}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  At least 8 characters, with a letter and a number.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                disabled={busy === "create" || !newEmail.trim() || !newPassword}
                onClick={() =>
                  run(
                    "create",
                    {
                      action: "create",
                      email: newEmail.trim(),
                      fullName: newName.trim(),
                      role: newRole,
                      password: newPassword,
                    },
                    () => setShowCreate(false),
                  )
                }
              >
                {busy === "create" ? "Creating…" : "Create account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Reset password ─────────────────────────────────── */}
        <Dialog open={Boolean(resetting)} onOpenChange={(o) => !o && setResetting(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                For {resetting?.full_name || resetting?.email}. This replaces their
                password immediately — they'll be signed out of other devices.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>New password</Label>
                <div className="flex gap-2">
                  <Input
                    value={resetPassword}
                    onChange={(e) => {
                      setResetPassword(e.target.value);
                      setCopied(false);
                    }}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setResetPassword(suggestPassword());
                      setCopied(false);
                    }}
                    title="Generate another"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(resetPassword);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                Copy this before you save — it isn't shown again. Send it to them over
                something private, and ask them to change it once they're in.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetting(null)}>
                Cancel
              </Button>
              <Button
                disabled={busy === "reset" || resetPassword.length < 8}
                onClick={() =>
                  run(
                    "reset",
                    {
                      action: "reset_password",
                      userId: resetting.id,
                      password: resetPassword,
                    },
                    () => setResetting(null),
                  )
                }
              >
                {busy === "reset" ? "Saving…" : "Set password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete ─────────────────────────────────────────── */}
        <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Remove {deleting?.full_name || deleting?.email}?</DialogTitle>
              <DialogDescription>
                This deletes the account permanently. If you only want to stop them
                signing in, switch off "Can sign in" instead — that keeps their
                history intact and is reversible.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Move their leads to</Label>
                <Select value={reassignTo} onValueChange={setReassignTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose someone…" />
                  </SelectTrigger>
                  <SelectContent>
                    {reassignCandidates.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-slate-500">
                  Required if they hold any leads — otherwise the removal is refused
                  rather than silently orphaning them.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={busy === "delete"}
                onClick={() =>
                  run(
                    "delete",
                    {
                      action: "delete",
                      userId: deleting.id,
                      reassignTo: reassignTo || undefined,
                    },
                    () => setDeleting(null),
                  )
                }
              >
                {busy === "delete" ? "Removing…" : "Remove permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
