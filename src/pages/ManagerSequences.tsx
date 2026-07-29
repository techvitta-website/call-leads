import { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  Send,
  Plus,
  Trash2,
  MessageCircle,
  Mail,
  Phone,
  CheckSquare,
  GitBranch,
  Webhook,
  AlertCircle,
  Users,
  ArrowDown,
  Play,
} from "lucide-react";
import {
  getSequences,
  createSequence,
  deleteSequence,
  setSequenceEnabled,
  getProjects,
  supabase,
} from "@/lib/supabase";

const STEP_TYPES = [
  { value: "whatsapp", label: "WhatsApp message", icon: MessageCircle, color: "text-emerald-600" },
  { value: "email", label: "Email", icon: Mail, color: "text-blue-600" },
  { value: "call", label: "Phone call", icon: Phone, color: "text-violet-600" },
  { value: "task", label: "Task / reminder", icon: CheckSquare, color: "text-amber-600" },
  { value: "status_change", label: "Change lead status", icon: GitBranch, color: "text-slate-600" },
  { value: "webhook", label: "Call a webhook", icon: Webhook, color: "text-rose-600" },
];

const STATUSES = ["new", "qualified", "proposal", "closed_won", "not_interested"];

type DraftStep = {
  step_type: string;
  wait_days: number;
  subject: string;
  body: string;
  config: Record<string, any>;
};

const blankStep = (): DraftStep => ({
  step_type: "whatsapp",
  wait_days: 2,
  subject: "",
  body: "",
  config: {},
});

/** Three sensible starting points so the empty state isn't a blank page. */
const TEMPLATES: Record<string, { name: string; steps: DraftStep[] }> = {
  inbound: {
    name: "New inbound lead follow-up",
    steps: [
      { step_type: "whatsapp", wait_days: 0, subject: "", body: "Hi {{contact_name}}, thanks for your enquiry about {{company_name}}. When would be a good time for a quick call?", config: {} },
      { step_type: "call", wait_days: 2, subject: "Call {{company_name}}", body: "No WhatsApp reply — try a call.", config: {} },
      { step_type: "email", wait_days: 3, subject: "Following up — {{company_name}}", body: "Hi {{contact_name}},\n\nI tried reaching you earlier. Happy to share a short overview if it's useful.\n\nBest regards", config: {} },
      { step_type: "task", wait_days: 7, subject: "Final check on {{company_name}}", body: "Last attempt before marking not interested.", config: {} },
    ],
  },
  nurture: {
    name: "Slow nurture (monthly touch)",
    steps: [
      { step_type: "email", wait_days: 0, subject: "Keeping in touch — {{company_name}}", body: "Hi {{contact_name}},\n\nJust checking whether the timing is any better on your side.", config: {} },
      { step_type: "whatsapp", wait_days: 30, subject: "", body: "Hi {{contact_name}}, anything changed on your end since we last spoke?", config: {} },
      { step_type: "email", wait_days: 30, subject: "Still here if useful — {{company_name}}", body: "Hi {{contact_name}},\n\nNo pressure at all — do let me know if priorities shift.", config: {} },
    ],
  },
  demo: {
    name: "Post-demo follow-up",
    steps: [
      { step_type: "email", wait_days: 1, subject: "Thanks for your time, {{contact_name}}", body: "Hi {{contact_name}},\n\nThanks for the demo today. Sharing a summary and next steps below.", config: {} },
      { step_type: "call", wait_days: 3, subject: "Check in after demo — {{company_name}}", body: "Any questions from the team?", config: {} },
      { step_type: "status_change", wait_days: 5, subject: "", body: "", config: { status: "proposal" } },
      { step_type: "task", wait_days: 0, subject: "Send proposal to {{company_name}}", body: "Prepare and send the commercial proposal.", config: {} },
    ],
  },
};

export default function ManagerSequences() {
  const [sequences, setSequences] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [taskCounts, setTaskCounts] = useState<{ open: number }>({ open: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showBuilder, setShowBuilder] = useState(false);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [stopOnReply, setStopOnReply] = useState(true);
  const [steps, setSteps] = useState<DraftStep[]>([blankStep()]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [seqRes, projRes, taskRes] = await Promise.all([
        getSequences(),
        getProjects(),
        supabase
          .from("sequence_tasks")
          .select("id", { count: "exact", head: true })
          .is("completed_at", null),
      ]);
      setSequences(seqRes.data);
      setProjects(projRes.data || []);
      setTaskCounts({ open: (taskRes as any)?.count ?? 0 });
    } catch (e: any) {
      setError(e?.message || "Could not load sequences.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetBuilder = () => {
    setName("");
    setProjectId("all");
    setStopOnReply(true);
    setSteps([blankStep()]);
  };

  const applyTemplate = (key: string) => {
    const t = TEMPLATES[key];
    if (!t) return;
    setName(t.name);
    setSteps(t.steps.map((s) => ({ ...s, config: { ...s.config } })));
  };

  const updateStep = (i: number, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const handleSave = async () => {
    if (!name.trim() || steps.length === 0) return;
    setSaving(true);
    setError(null);
    const { error: err } = await createSequence({
      name: name.trim(),
      project_id: projectId === "all" ? null : projectId,
      stop_on_reply: stopOnReply,
      steps: steps.map((s) => ({
        step_type: s.step_type,
        wait_days: Number(s.wait_days) || 0,
        subject: s.subject || null,
        body: s.body || null,
        config: s.config || {},
      })),
    });
    setSaving(false);
    if (err) {
      setError(err.message || "Could not save the sequence.");
      return;
    }
    setShowBuilder(false);
    resetBuilder();
    load();
  };

  const projectName = (id: string | null) =>
    !id ? "All projects" : projects.find((p) => p.id === id)?.name || "Unknown project";

  const totalDays = steps.reduce((sum, s) => sum + (Number(s.wait_days) || 0), 0);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar role="manager" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-slate-500">Loading sequences…</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role="manager" />
      <main className="flex-1 overflow-auto p-4 pt-20 sm:pt-16 lg:p-8 lg:pt-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1 flex items-center gap-2 text-3xl font-bold text-slate-900">
              <Send className="h-7 w-7 text-indigo-600" />
              Sequences
            </h1>
            <p className="text-slate-500">
              Multi-step follow-up cadences. Each step becomes a task for whoever owns the lead.
            </p>
          </div>
          <Button
            onClick={() => {
              resetBuilder();
              setShowBuilder(true);
            }}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New sequence
          </Button>
        </div>

        {error && (
          <Alert className="mb-4 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        {taskCounts.open > 0 && (
          <Card className="mb-5 border-indigo-200 bg-indigo-50 p-4">
            <div className="flex items-center gap-2 text-sm text-indigo-900">
              <CheckSquare className="h-4 w-4" />
              <strong>{taskCounts.open}</strong> open sequence task
              {taskCounts.open !== 1 ? "s" : ""} across the team.
            </div>
          </Card>
        )}

        {sequences.length === 0 ? (
          <Card className="border-slate-200 bg-white p-12 text-center">
            <Send className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="mb-1 font-medium text-slate-900">No sequences yet</p>
            <p className="mx-auto mb-6 max-w-lg text-sm text-slate-500">
              A sequence is a series of touches spread over days — WhatsApp on day
              zero, a call on day two, an email on day five. It stops on its own the
              moment the lead engages or the deal closes, so nobody gets chased after
              they've replied.
            </p>
            <Button
              onClick={() => {
                resetBuilder();
                setShowBuilder(true);
              }}
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Build your first sequence
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {sequences.map((seq) => (
              <Card key={seq.id} className="border-slate-200 bg-white p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-slate-900">{seq.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {projectName(seq.project_id)}
                      </Badge>
                      {!seq.enabled && (
                        <Badge className="bg-slate-200 text-xs text-slate-600">Paused</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {seq.active_count} active · {seq.total_enrolled} enrolled overall
                      </span>
                      <span>{seq.steps?.length ?? 0} steps</span>
                      {seq.stop_on_reply && <span>Stops when the lead engages</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={seq.enabled}
                      onCheckedChange={async (v) => {
                        setSequences((prev) =>
                          prev.map((s) => (s.id === seq.id ? { ...s, enabled: v } : s))
                        );
                        await setSequenceEnabled(seq.id, v);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={async () => {
                        if (
                          !confirm(
                            `Delete “${seq.name}”? Any leads currently in it will stop receiving steps.`
                          )
                        )
                          return;
                        await deleteSequence(seq.id);
                        setSequences((prev) => prev.filter((s) => s.id !== seq.id));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Step timeline */}
                <div className="flex flex-wrap items-center gap-2">
                  {(seq.steps || []).map((st: any, i: number) => {
                    const meta = STEP_TYPES.find((t) => t.value === st.step_type);
                    const Icon = meta?.icon ?? CheckSquare;
                    const cumulative = (seq.steps || [])
                      .slice(0, i + 1)
                      .reduce((sum: number, x: any) => sum + (x.wait_days || 0), 0);
                    return (
                      <div key={st.id} className="flex items-center gap-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Icon className={`h-3.5 w-3.5 ${meta?.color ?? "text-slate-500"}`} />
                            <span className="text-xs font-medium text-slate-700">
                              {meta?.label ?? st.step_type}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {cumulative === 0 ? "same day" : `day ${cumulative}`}
                          </div>
                        </div>
                        {i < (seq.steps?.length ?? 0) - 1 && (
                          <ArrowDown className="h-3 w-3 -rotate-90 text-slate-300" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── Builder ──────────────────────────────────────────── */}
        <Dialog open={showBuilder} onOpenChange={setShowBuilder}>
          <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New sequence</DialogTitle>
              <DialogDescription>
                Steps fire in order. Wait days are counted from the step before,
                so 0 / 2 / 3 means day 0, day 2, then day 5.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {/* Templates */}
              <div>
                <Label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
                  Start from a template
                </Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(TEMPLATES).map(([key, t]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyTemplate(key)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="seq-name">Name</Label>
                  <Input
                    id="seq-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="New inbound lead follow-up"
                  />
                </div>
                <div>
                  <Label>Project</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
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
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 p-3">
                <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} className="mt-0.5" />
                <span className="text-sm text-slate-600">
                  <span className="font-medium text-slate-800">Stop when the lead engages.</span>{" "}
                  Any activity logged against the lead ends the cadence. Without an
                  inbox connection this is the closest signal to “they replied” we
                  have, so log calls and notes as you go.
                </span>
              </label>

              {/* Steps */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wide text-slate-400">
                    Steps ({steps.length}) · runs {totalDays} day{totalDays !== 1 ? "s" : ""}
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setSteps((prev) => [...prev, blankStep()])}
                  >
                    <Plus className="h-3 w-3" />
                    Add step
                  </Button>
                </div>

                <div className="space-y-3">
                  {steps.map((step, i) => {
                    const meta = STEP_TYPES.find((t) => t.value === step.step_type);
                    const Icon = meta?.icon ?? CheckSquare;
                    const needsMessage = ["whatsapp", "email", "call", "task"].includes(step.step_type);
                    return (
                      <Card key={i} className="border-slate-200 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                            {i + 1}
                          </span>
                          <Icon className={`h-4 w-4 shrink-0 ${meta?.color ?? "text-slate-500"}`} />
                          <Select
                            value={step.step_type}
                            onValueChange={(v) => updateStep(i, { step_type: v })}
                          >
                            <SelectTrigger className="h-8 flex-1 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STEP_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex shrink-0 items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              value={step.wait_days}
                              onChange={(e) => updateStep(i, { wait_days: Number(e.target.value) })}
                              className="h-8 w-16 text-sm"
                            />
                            <span className="text-xs text-slate-500">days later</span>
                          </div>
                          {steps.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 shrink-0 px-2 text-red-600 hover:bg-red-50"
                              onClick={() => setSteps((prev) => prev.filter((_, x) => x !== i))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>

                        {step.step_type === "status_change" && (
                          <Select
                            value={step.config.status ?? "qualified"}
                            onValueChange={(v) => updateStep(i, { config: { ...step.config, status: v } })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="New status" />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s.replace(/_/g, " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {step.step_type === "webhook" && (
                          <Input
                            value={step.config.url ?? ""}
                            onChange={(e) => updateStep(i, { config: { ...step.config, url: e.target.value } })}
                            placeholder="https://your-n8n.app/webhook/..."
                            className="h-8 text-sm"
                          />
                        )}

                        {needsMessage && (
                          <div className="space-y-2">
                            {step.step_type !== "whatsapp" && (
                              <Input
                                value={step.subject}
                                onChange={(e) => updateStep(i, { subject: e.target.value })}
                                placeholder={
                                  step.step_type === "email"
                                    ? "Subject line"
                                    : "What the rep should do"
                                }
                                className="h-8 text-sm"
                              />
                            )}
                            <Textarea
                              value={step.body}
                              onChange={(e) => updateStep(i, { body: e.target.value })}
                              rows={2}
                              placeholder="Hi {{contact_name}}, ..."
                              className="resize-y text-sm"
                            />
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Placeholders: <code>{"{{contact_name}}"}</code>,{" "}
                  <code>{"{{company_name}}"}</code>, <code>{"{{city}}"}</code>,{" "}
                  <code>{"{{status}}"}</code>
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBuilder(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !name.trim() || steps.length === 0}
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
              >
                <Play className="h-4 w-4" />
                {saving ? "Saving…" : "Create sequence"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
