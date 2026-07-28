import { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Zap,
  Plus,
  Copy,
  Check,
  Trash2,
  KeyRound,
  Webhook,
  Workflow,
  ScrollText,
  AlertCircle,
  Instagram,
  Linkedin,
  Globe,
  RefreshCw,
  Play,
} from "lucide-react";
import { supabase, getProjects, getUsers } from "@/lib/supabase";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const INTAKE_URL = `${FUNCTIONS_BASE}/lead-intake`;

const CHANNELS = [
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin },
  { value: "facebook", label: "Facebook", icon: Globe },
  { value: "website", label: "Website form", icon: Globe },
  { value: "n8n", label: "n8n / other", icon: Workflow },
  { value: "custom", label: "Custom", icon: Globe },
];

const EVENT_TYPES = [
  { value: "lead.created", label: "Lead created" },
  { value: "lead.status_changed", label: "Lead status changed" },
  { value: "lead.assigned", label: "Lead assigned" },
];

const TRIGGER_TYPES = [
  { value: "lead_created", label: "When a lead is created" },
  { value: "lead_status_changed", label: "When a lead's status changes" },
  { value: "lead_assigned", label: "When a lead is assigned" },
  { value: "followup_due", label: "When a follow-up falls due" },
  { value: "lead_idle", label: "When a lead goes untouched for N days" },
  { value: "schedule_daily", label: "Daily digest" },
];

const ACTION_TYPES = [
  { value: "assign_round_robin", label: "Auto-assign (least busy rep)" },
  { value: "assign_user", label: "Assign to a specific person" },
  { value: "set_status", label: "Set status" },
  { value: "set_priority", label: "Set priority" },
  { value: "set_followup", label: "Schedule a follow-up" },
  { value: "add_note", label: "Add a note to the lead" },
  { value: "webhook", label: "POST to a webhook (n8n)" },
];

const STATUSES = ["new", "qualified", "proposal", "closed_won", "not_interested"];
const PRIORITIES = ["urgent", "high", "medium", "low"];

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      {label || (copied ? "Copied" : "Copy")}
    </Button>
  );
}

export default function ManagerAutomations() {
  const [sources, setSources] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New-source dialog
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [srcName, setSrcName] = useState("");
  const [srcChannel, setSrcChannel] = useState("instagram");
  const [srcProject, setSrcProject] = useState("");
  const [srcAssign, setSrcAssign] = useState("round_robin");
  const [srcAssignee, setSrcAssignee] = useState("");
  const [creatingSource, setCreatingSource] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  // New-webhook dialog
  const [showHookDialog, setShowHookDialog] = useState(false);
  const [hookName, setHookName] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>(["lead.created"]);
  const [savingHook, setSavingHook] = useState(false);

  // New-rule dialog
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleTrigger, setRuleTrigger] = useState("lead_created");
  const [ruleProject, setRuleProject] = useState("all");
  const [ruleIdleDays, setRuleIdleDays] = useState("7");
  const [ruleToStatus, setRuleToStatus] = useState("any");
  const [ruleUnassignedOnly, setRuleUnassignedOnly] = useState(false);
  const [ruleActionType, setRuleActionType] = useState("assign_round_robin");
  const [ruleActionUser, setRuleActionUser] = useState("");
  const [ruleActionStatus, setRuleActionStatus] = useState("qualified");
  const [ruleActionPriority, setRuleActionPriority] = useState("high");
  const [ruleActionDays, setRuleActionDays] = useState("3");
  const [ruleActionNote, setRuleActionNote] = useState("");
  const [ruleActionUrl, setRuleActionUrl] = useState("");
  const [savingRule, setSavingRule] = useState(false);

  const salesUsers = users.filter((u) => u.role === "salesman");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, w, r, l, p, u] = await Promise.all([
        supabase.from("automation_sources").select("*").order("created_at", { ascending: false }),
        supabase.from("automation_webhooks").select("*").order("created_at", { ascending: false }),
        supabase.from("automation_rules").select("*").order("created_at", { ascending: false }),
        supabase.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(60),
        getProjects(),
        getUsers(),
      ]);

      if (s.error) throw s.error;
      setSources(s.data || []);
      setWebhooks(w.data || []);
      setRules(r.data || []);
      setRuns(l.data || []);
      setProjects(p.data || []);
      setUsers(u.data || []);
    } catch (e: any) {
      setError(
        e?.message?.includes("permission") || e?.code === "42501"
          ? "You need a manager or owner account to view automations."
          : e?.message || "Could not load automations."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Create an inbound source ───────────────────────────────
  const createSource = async () => {
    if (!srcName.trim()) return;
    setCreatingSource(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("create_automation_source", {
        p_name: srcName.trim(),
        p_channel: srcChannel,
        p_project_id: srcProject || null,
        p_assign_mode: srcAssign,
        p_default_assignee: srcAssign === "fixed" ? srcAssignee || null : null,
        p_default_status: "new",
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      setFreshKey(row?.api_key || null);
      setSrcName("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not create the API key.");
    } finally {
      setCreatingSource(false);
    }
  };

  const deleteRow = async (table: string, id: string) => {
    await supabase.from(table).delete().eq("id", id);
    load();
  };

  const toggleActive = async (table: string, id: string, next: boolean) => {
    await supabase.from(table).update({ active: next }).eq("id", id);
    load();
  };

  const toggleRuleEnabled = async (id: string, next: boolean) => {
    await supabase.from("automation_rules").update({ enabled: next }).eq("id", id);
    load();
  };

  // ── Create an outbound webhook ─────────────────────────────
  const createWebhook = async () => {
    if (!hookName.trim() || !hookUrl.trim()) return;
    setSavingHook(true);
    setError(null);
    try {
      const { error } = await supabase.from("automation_webhooks").insert({
        name: hookName.trim(),
        target_url: hookUrl.trim(),
        events: hookEvents,
      });
      if (error) throw error;
      setShowHookDialog(false);
      setHookName("");
      setHookUrl("");
      setHookEvents(["lead.created"]);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not save the webhook.");
    } finally {
      setSavingHook(false);
    }
  };

  // ── Create a rule ──────────────────────────────────────────
  const createRule = async () => {
    if (!ruleName.trim()) return;
    setSavingRule(true);
    setError(null);
    try {
      const action: any = { type: ruleActionType };
      if (ruleActionType === "assign_user") action.user_id = ruleActionUser;
      if (ruleActionType === "set_status") action.status = ruleActionStatus;
      if (ruleActionType === "set_priority") action.priority = ruleActionPriority;
      if (ruleActionType === "set_followup") {
        action.days = Number(ruleActionDays) || 3;
        action.note = ruleActionNote || "Auto-scheduled follow-up";
      }
      if (ruleActionType === "add_note") action.note = ruleActionNote;
      if (ruleActionType === "webhook") action.url = ruleActionUrl;

      const conditions: any = {};
      if (ruleUnassignedOnly) conditions.unassigned_only = true;

      const trigger_config: any = {};
      if (ruleTrigger === "lead_idle") trigger_config.days = Number(ruleIdleDays) || 7;
      if (ruleTrigger === "lead_status_changed" && ruleToStatus !== "any") {
        trigger_config.to_status = ruleToStatus;
      }

      const { error } = await supabase.from("automation_rules").insert({
        name: ruleName.trim(),
        trigger_type: ruleTrigger,
        trigger_config,
        conditions,
        actions: [action],
        project_id: ruleProject === "all" ? null : ruleProject,
      });
      if (error) throw error;

      setShowRuleDialog(false);
      setRuleName("");
      setRuleActionNote("");
      setRuleActionUrl("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not save the rule.");
    } finally {
      setSavingRule(false);
    }
  };

  // ── Run the dispatcher now ─────────────────────────────────
  const runNow = async () => {
    setNotice(null);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("automation-dispatch", { body: {} });
      if (error) throw error;
      setNotice(
        `Dispatcher ran: ${data?.events_processed ?? 0} event(s) processed, ` +
          `${data?.webhook_deliveries ?? 0} webhook delivery(ies), ` +
          `${(data?.event_rules_fired ?? 0) + (data?.scheduled_rules_fired ?? 0)} rule(s) fired.`
      );
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not reach the dispatcher.");
    }
  };

  const projectName = (id: string | null) =>
    !id ? "All projects" : projects.find((p) => p.id === id)?.name || "Unknown project";

  const userName = (id: string | null) => {
    if (!id) return "—";
    const u = users.find((x) => x.id === id);
    return u?.full_name || u?.name || u?.email || "Unknown";
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar role="manager" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-slate-500">Loading automations…</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role="manager" />
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Zap className="w-7 h-7 text-amber-500" />
              Automations
            </h1>
            <p className="text-slate-500">
              Connect Instagram, LinkedIn and n8n, and let rules handle the routine work
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            <Button onClick={runNow} className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white">
              <Play className="w-4 h-4" />
              Run now
            </Button>
          </div>
        </div>

        {error && (
          <Alert className="mb-4 bg-red-50 border-red-200">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert className="mb-4 bg-green-50 border-green-200">
            <Check className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800">{notice}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="incoming">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="incoming" className="gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Incoming
            </TabsTrigger>
            <TabsTrigger value="outgoing" className="gap-1.5">
              <Webhook className="w-3.5 h-3.5" /> Outgoing
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5">
              <Workflow className="w-3.5 h-3.5" /> Rules
            </TabsTrigger>
            <TabsTrigger value="log" className="gap-1.5">
              <ScrollText className="w-3.5 h-3.5" /> Log
            </TabsTrigger>
          </TabsList>

          {/* ══ INCOMING ══════════════════════════════════════ */}
          <TabsContent value="incoming" className="mt-5 space-y-4">
            <Card className="p-5 bg-white">
              <h3 className="font-semibold text-slate-900 mb-1">Your lead intake endpoint</h3>
              <p className="text-sm text-slate-500 mb-3">
                Point n8n (or any service) at this URL and send the API key in the{" "}
                <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">x-api-key</code> header.
              </p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 text-xs bg-slate-900 text-slate-100 px-3 py-2.5 rounded-lg overflow-x-auto whitespace-nowrap">
                  POST {INTAKE_URL}
                </code>
                <CopyButton text={INTAKE_URL} />
              </div>
            </Card>

            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                API keys <span className="text-slate-400 font-normal">({sources.length})</span>
              </h3>
              <Button
                onClick={() => {
                  setFreshKey(null);
                  setShowSourceDialog(true);
                }}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                New key
              </Button>
            </div>

            {sources.length === 0 ? (
              <Card className="p-10 text-center text-slate-500 bg-white">
                No API keys yet. Create one per source — one for Instagram, one for LinkedIn — so you
                can see where each lead came from and revoke them independently.
              </Card>
            ) : (
              <div className="space-y-3">
                {sources.map((s) => {
                  const Icon = CHANNELS.find((c) => c.value === s.channel)?.icon || Globe;
                  return (
                    <Card key={s.id} className="p-4 bg-white">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <Icon className="w-4 h-4 text-slate-500" />
                            <span className="font-semibold text-slate-900">{s.name}</span>
                            <Badge variant="outline" className="text-xs capitalize">
                              {s.channel}
                            </Badge>
                            {!s.active && (
                              <Badge className="text-xs bg-slate-200 text-slate-600">Disabled</Badge>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 space-y-0.5">
                            <div>
                              Key <code className="bg-slate-100 px-1 rounded">{s.key_prefix}…</code> ·{" "}
                              {projectName(s.project_id)}
                            </div>
                            <div>
                              Assignment:{" "}
                              {s.assign_mode === "round_robin"
                                ? "auto (least busy rep)"
                                : s.assign_mode === "fixed"
                                ? userName(s.default_assignee)
                                : "leave unassigned"}
                            </div>
                            <div>
                              {s.request_count} request{s.request_count !== 1 ? "s" : ""}
                              {s.last_used_at
                                ? ` · last used ${new Date(s.last_used_at).toLocaleString()}`
                                : " · never used"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={s.active}
                            onCheckedChange={(v) => toggleActive("automation_sources", s.id, v)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteRow("automation_sources", s.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ══ OUTGOING ══════════════════════════════════════ */}
          <TabsContent value="outgoing" className="mt-5 space-y-4">
            <Card className="p-5 bg-white">
              <h3 className="font-semibold text-slate-900 mb-1">Send CRM events to n8n</h3>
              <p className="text-sm text-slate-500">
                Every delivery carries an{" "}
                <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">X-Techvitta-Signature</code>{" "}
                header — an HMAC-SHA256 of the body using the webhook's secret. Verify it in n8n so
                nobody can forge events at your workflow.
              </p>
            </Card>

            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                Webhooks <span className="text-slate-400 font-normal">({webhooks.length})</span>
              </h3>
              <Button onClick={() => setShowHookDialog(true)} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4" />
                New webhook
              </Button>
            </div>

            {webhooks.length === 0 ? (
              <Card className="p-10 text-center text-slate-500 bg-white">
                No webhooks yet. Add your n8n Webhook node's URL here to have the CRM push lead
                events to it.
              </Card>
            ) : (
              <div className="space-y-3">
                {webhooks.map((w) => (
                  <Card key={w.id} className="p-4 bg-white">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <Webhook className="w-4 h-4 text-slate-500" />
                          <span className="font-semibold text-slate-900">{w.name}</span>
                          {w.failure_count > 0 && (
                            <Badge className="text-xs bg-red-100 text-red-700">
                              {w.failure_count} failure{w.failure_count !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 space-y-1">
                          <div className="truncate font-mono">{w.target_url}</div>
                          <div className="flex flex-wrap gap-1">
                            {(w.events || []).map((e: string) => (
                              <Badge key={e} variant="outline" className="text-xs">
                                {e}
                              </Badge>
                            ))}
                          </div>
                          <div>
                            {w.last_fired_at
                              ? `Last fired ${new Date(w.last_fired_at).toLocaleString()} (HTTP ${w.last_status ?? "—"})`
                              : "Never fired"}
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <span>Signing secret:</span>
                            <code className="bg-slate-100 px-1 rounded">{w.secret.slice(0, 12)}…</code>
                            <CopyButton text={w.secret} label="Copy secret" />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={w.active}
                          onCheckedChange={(v) => toggleActive("automation_webhooks", w.id, v)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteRow("automation_webhooks", w.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ══ RULES ═════════════════════════════════════════ */}
          <TabsContent value="rules" className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                Rules <span className="text-slate-400 font-normal">({rules.length})</span>
              </h3>
              <Button onClick={() => setShowRuleDialog(true)} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4" />
                New rule
              </Button>
            </div>

            {rules.length === 0 ? (
              <Card className="p-10 text-center text-slate-500 bg-white">
                No rules yet. A good first one: "when a lead is created, auto-assign to the least busy
                rep."
              </Card>
            ) : (
              <div className="space-y-3">
                {rules.map((r) => (
                  <Card key={r.id} className="p-4 bg-white">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <Workflow className="w-4 h-4 text-slate-500" />
                          <span className="font-semibold text-slate-900">{r.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {projectName(r.project_id)}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-500 space-y-0.5">
                          <div>
                            <span className="text-slate-400">When:</span>{" "}
                            {TRIGGER_TYPES.find((t) => t.value === r.trigger_type)?.label || r.trigger_type}
                            {r.trigger_config?.days ? ` (${r.trigger_config.days} days)` : ""}
                            {r.trigger_config?.to_status ? ` → ${r.trigger_config.to_status}` : ""}
                          </div>
                          <div>
                            <span className="text-slate-400">Then:</span>{" "}
                            {(r.actions || [])
                              .map((a: any) => ACTION_TYPES.find((x) => x.value === a.type)?.label || a.type)
                              .join(", ")}
                          </div>
                          <div>
                            Ran {r.run_count} time{r.run_count !== 1 ? "s" : ""}
                            {r.last_run_at ? ` · last ${new Date(r.last_run_at).toLocaleString()}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={r.enabled} onCheckedChange={(v) => toggleRuleEnabled(r.id, v)} />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteRow("automation_rules", r.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ══ LOG ═══════════════════════════════════════════ */}
          <TabsContent value="log" className="mt-5">
            {runs.length === 0 ? (
              <Card className="p-10 text-center text-slate-500 bg-white">
                Nothing has run yet. The dispatcher checks for work every minute.
              </Card>
            ) : (
              <Card className="bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {["When", "Type", "Status", "Detail"].map((h) => (
                          <th key={h} className="text-left py-2.5 px-4 font-medium text-slate-500 text-xs">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4">
                            <Badge variant="outline" className="text-xs capitalize">
                              {r.kind}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4">
                            <Badge
                              className={`text-xs ${
                                r.status === "success"
                                  ? "bg-green-100 text-green-700"
                                  : r.status === "error"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {r.status}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 text-xs">{r.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* ══ New source dialog ══════════════════════════════ */}
        <Dialog
          open={showSourceDialog}
          onOpenChange={(o) => {
            if (!o) {
              setShowSourceDialog(false);
              setFreshKey(null);
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New intake API key</DialogTitle>
              <DialogDescription>
                One key per source, so you can tell Instagram leads from LinkedIn leads and revoke
                either without touching the other.
              </DialogDescription>
            </DialogHeader>

            {freshKey ? (
              <div className="space-y-4">
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <AlertDescription className="text-amber-900 text-sm">
                    Copy this key now — it is stored hashed and cannot be shown again. If you lose
                    it, delete the key and make a new one.
                  </AlertDescription>
                </Alert>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-xs bg-slate-900 text-green-300 px-3 py-2.5 rounded-lg overflow-x-auto whitespace-nowrap">
                    {freshKey}
                  </code>
                  <CopyButton text={freshKey} />
                </div>
                <div>
                  <Label className="text-xs text-slate-500 mb-1 block">Ready-to-paste test command</Label>
                  <Textarea
                    readOnly
                    rows={5}
                    className="text-xs font-mono"
                    value={`curl -X POST '${INTAKE_URL}' \\
  -H 'x-api-key: ${freshKey}' \\
  -H 'Content-Type: application/json' \\
  -d '{"company_name":"Test Co","contact_name":"Test User","email":"test@example.com","phone":"9876543210"}'`}
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setShowSourceDialog(false);
                      setFreshKey(null);
                    }}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={srcName}
                    onChange={(e) => setSrcName(e.target.value)}
                    placeholder="Instagram Lead Ads"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Channel</Label>
                    <Select value={srcChannel} onValueChange={setSrcChannel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Project</Label>
                    <Select value={srcProject} onValueChange={setSrcProject}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose…" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Assign incoming leads</Label>
                  <Select value={srcAssign} onValueChange={setSrcAssign}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round_robin">Automatically, to the least busy rep</SelectItem>
                      <SelectItem value="fixed">Always to one person</SelectItem>
                      <SelectItem value="none">Leave unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {srcAssign === "fixed" && (
                  <div>
                    <Label>Assign to</Label>
                    <Select value={srcAssignee} onValueChange={setSrcAssignee}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a person…" />
                      </SelectTrigger>
                      <SelectContent>
                        {salesUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name || u.name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowSourceDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createSource} disabled={creatingSource || !srcName.trim() || !srcProject}>
                    {creatingSource ? "Creating…" : "Create key"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ══ New webhook dialog ═════════════════════════════ */}
        <Dialog open={showHookDialog} onOpenChange={setShowHookDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New outgoing webhook</DialogTitle>
              <DialogDescription>
                The CRM will POST to this URL whenever one of the selected events happens.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={hookName} onChange={(e) => setHookName(e.target.value)} placeholder="n8n — new lead handler" />
              </div>
              <div>
                <Label>Target URL</Label>
                <Input
                  value={hookUrl}
                  onChange={(e) => setHookUrl(e.target.value)}
                  placeholder="https://your-n8n.app/webhook/abc123"
                />
              </div>
              <div>
                <Label className="mb-2 block">Events</Label>
                <div className="space-y-2">
                  {EVENT_TYPES.map((e) => (
                    <label key={e.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hookEvents.includes(e.value)}
                        onChange={() =>
                          setHookEvents((prev) =>
                            prev.includes(e.value) ? prev.filter((x) => x !== e.value) : [...prev, e.value]
                          )
                        }
                        className="rounded border-slate-300"
                      />
                      {e.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowHookDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createWebhook} disabled={savingHook || !hookName.trim() || !hookUrl.trim()}>
                {savingHook ? "Saving…" : "Add webhook"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══ New rule dialog ════════════════════════════════ */}
        <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New automation rule</DialogTitle>
              <DialogDescription>Runs inside the CRM — no external tool needed.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Rule name</Label>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Auto-assign new leads"
                />
              </div>

              <div>
                <Label>When</Label>
                <Select value={ruleTrigger} onValueChange={setRuleTrigger}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {ruleTrigger === "lead_idle" && (
                <div>
                  <Label>Untouched for how many days?</Label>
                  <Input
                    type="number"
                    min={1}
                    value={ruleIdleDays}
                    onChange={(e) => setRuleIdleDays(e.target.value)}
                  />
                </div>
              )}

              {ruleTrigger === "lead_status_changed" && (
                <div>
                  <Label>Only when the new status is</Label>
                  <Select value={ruleToStatus} onValueChange={setRuleToStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any status</SelectItem>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Project</Label>
                <Select value={ruleProject} onValueChange={setRuleProject}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {ruleTrigger !== "schedule_daily" && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ruleUnassignedOnly}
                    onChange={(e) => setRuleUnassignedOnly(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Only unassigned leads
                </label>
              )}

              <div className="pt-2 border-t border-slate-100">
                <Label>Then do this</Label>
                <Select value={ruleActionType} onValueChange={setRuleActionType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {ruleActionType === "assign_user" && (
                <div>
                  <Label>Assign to</Label>
                  <Select value={ruleActionUser} onValueChange={setRuleActionUser}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a person…" />
                    </SelectTrigger>
                    <SelectContent>
                      {salesUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {ruleActionType === "set_status" && (
                <div>
                  <Label>New status</Label>
                  <Select value={ruleActionStatus} onValueChange={setRuleActionStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {ruleActionType === "set_priority" && (
                <div>
                  <Label>New priority</Label>
                  <Select value={ruleActionPriority} onValueChange={setRuleActionPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {ruleActionType === "set_followup" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>In how many days?</Label>
                    <Input
                      type="number"
                      min={1}
                      value={ruleActionDays}
                      onChange={(e) => setRuleActionDays(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Note</Label>
                    <Input
                      value={ruleActionNote}
                      onChange={(e) => setRuleActionNote(e.target.value)}
                      placeholder="Call {{company_name}}"
                    />
                  </div>
                </div>
              )}

              {ruleActionType === "add_note" && (
                <div>
                  <Label>Note text</Label>
                  <Textarea
                    value={ruleActionNote}
                    onChange={(e) => setRuleActionNote(e.target.value)}
                    placeholder="No contact in 7 days — {{company_name}} needs a call"
                    rows={2}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Use {"{{company_name}}"}, {"{{contact_name}}"}, {"{{status}}"} to insert lead details.
                  </p>
                </div>
              )}

              {ruleActionType === "webhook" && (
                <div>
                  <Label>Webhook URL</Label>
                  <Input
                    value={ruleActionUrl}
                    onChange={(e) => setRuleActionUrl(e.target.value)}
                    placeholder="https://your-n8n.app/webhook/notify"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    For the daily digest this receives a pipeline summary; for lead rules it receives
                    the lead.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRuleDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createRule} disabled={savingRule || !ruleName.trim()}>
                {savingRule ? "Saving…" : "Create rule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
