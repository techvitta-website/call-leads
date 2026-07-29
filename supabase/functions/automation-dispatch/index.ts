// ═══════════════════════════════════════════════════════════════
// automation-dispatch — the engine. Runs on a schedule (pg_cron)
// and can also be poked manually.
//
//   1. Drains the event outbox to every subscribed webhook (n8n)
//   2. Evaluates event-driven rules (lead created / status changed)
//   3. Evaluates time-driven rules (idle leads, follow-ups due, digests)
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function hmac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const log = (row: Record<string, unknown>) =>
  supabase.from("automation_runs").insert(row).then(() => {}, () => {});

// ─── 1. Fan events out to subscribed webhooks ─────────────────────
async function deliverWebhooks(events: any[]) {
  if (events.length === 0) return 0;

  const { data: hooks } = await supabase
    .from("automation_webhooks")
    .select("*")
    .eq("active", true);

  if (!hooks?.length) return 0;

  let delivered = 0;

  for (const evt of events) {
    for (const hook of hooks) {
      if (!hook.events?.includes(evt.event_type)) continue;

      const body = JSON.stringify({
        event: evt.event_type,
        occurred_at: evt.created_at,
        data: evt.payload,
      });

      let status = 0;
      let errMsg: string | null = null;

      try {
        const res = await fetch(hook.target_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Techvitta-Event": evt.event_type,
            "X-Techvitta-Signature": await hmac(hook.secret, body),
          },
          body,
          signal: AbortSignal.timeout(15000),
        });
        status = res.status;
        if (!res.ok) errMsg = (await res.text()).slice(0, 300);
      } catch (e) {
        errMsg = String((e as Error)?.message ?? e);
      }

      const ok = status >= 200 && status < 300;
      if (ok) delivered++;

      await supabase
        .from("automation_webhooks")
        .update({
          last_fired_at: new Date().toISOString(),
          last_status: status || null,
          failure_count: ok ? 0 : (hook.failure_count ?? 0) + 1,
        })
        .eq("id", hook.id);

      await log({
        kind: "webhook",
        webhook_id: hook.id,
        lead_id: evt.lead_id,
        status: ok ? "success" : "error",
        message: ok ? `Delivered ${evt.event_type} (${status})` : `Failed ${evt.event_type}: ${errMsg}`,
        detail: { status, event: evt.event_type },
      });
    }
  }
  return delivered;
}

// ─── Condition matching ───────────────────────────────────────
function matches(lead: any, cond: Record<string, any>): boolean {
  if (!cond || Object.keys(cond).length === 0) return true;

  if (cond.status && lead.status !== cond.status) return false;
  if (cond.priority && lead.priority !== cond.priority) return false;
  if (cond.project_id && lead.project_id !== cond.project_id) return false;
  if (cond.lead_source && !String(lead.lead_source ?? "").toLowerCase().includes(String(cond.lead_source).toLowerCase())) return false;
  if (cond.min_value !== undefined && Number(lead.value ?? 0) < Number(cond.min_value)) return false;
  if (cond.unassigned_only && lead.assigned_to) return false;
  if (cond.previous_status && lead.previous_status !== cond.previous_status) return false;

  return true;
}

// ─── Action execution ────────────────────────────────────────
// Shared with lead-intake via a DB function, so both honour the
// receives_leads flag and can never assign work to a dormant account.
async function leastLoadedRep(): Promise<string | null> {
  const { data } = await supabase.rpc("pick_least_loaded_rep");
  return (data as string) ?? null;
}

function render(tpl: string, lead: any): string {
  return String(tpl ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => String(lead?.[k] ?? ""));
}

async function runActions(rule: any, lead: any): Promise<string[]> {
  const done: string[] = [];

  for (const action of rule.actions ?? []) {
    const t = action?.type;
    try {
      if (t === "assign_round_robin") {
        const rep = await leastLoadedRep();
        if (rep) {
          await supabase.from("leads").update({ assigned_to: rep }).eq("id", lead.id);
          done.push(`assigned to ${rep}`);
        } else {
          done.push("no eligible salesperson (check 'Receives new leads')");
        }
      } else if (t === "assign_user" && action.user_id) {
        await supabase.from("leads").update({ assigned_to: action.user_id }).eq("id", lead.id);
        done.push(`assigned to ${action.user_id}`);
      } else if (t === "set_status" && action.status) {
        await supabase.from("leads").update({ status: action.status }).eq("id", lead.id);
        done.push(`status -> ${action.status}`);
      } else if (t === "set_priority" && action.priority) {
        await supabase.from("leads").update({ priority: action.priority }).eq("id", lead.id);
        done.push(`priority -> ${action.priority}`);
      } else if (t === "set_followup") {
        const days = Number(action.days ?? 3);
        const d = new Date();
        d.setDate(d.getDate() + days);
        await supabase
          .from("leads")
          .update({
            next_followup_date: d.toISOString().slice(0, 10),
            followup_notes: render(action.note ?? "Auto-scheduled follow-up", lead),
          })
          .eq("id", lead.id);
        done.push(`follow-up in ${days}d`);
      } else if (t === "add_note") {
        await supabase.from("lead_activities").insert({
          lead_id: lead.id,
          type: "note",
          description: render(action.note ?? "", lead),
        });
        done.push("note added");
      } else if (t === "webhook" && action.url) {
        const body = JSON.stringify({ rule: rule.name, lead });
        const res = await fetch(action.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(15000),
        });
        done.push(`webhook ${res.status}`);
      }
    } catch (e) {
      done.push(`FAILED ${t}: ${String((e as Error)?.message ?? e)}`);
    }
  }
  return done;
}

// ─── 2. Event-driven rules ───────────────────────────────────
async function runEventRules(events: any[]) {
  if (!events.length) return 0;

  const { data: rules } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("enabled", true)
    .in("trigger_type", ["lead_created", "lead_status_changed", "lead_assigned"]);

  if (!rules?.length) return 0;

  const wanted: Record<string, string> = {
    "lead.created": "lead_created",
    "lead.status_changed": "lead_status_changed",
    "lead.assigned": "lead_assigned",
  };

  let fired = 0;

  for (const evt of events) {
    const triggerType = wanted[evt.event_type];
    if (!triggerType) continue;

    for (const rule of rules) {
      if (rule.trigger_type !== triggerType) continue;
      if (rule.project_id && rule.project_id !== evt.payload?.project_id) continue;

      // For status-change rules, honour an explicit target status.
      const target = rule.trigger_config?.to_status;
      if (target && evt.payload?.status !== target) continue;

      if (!matches(evt.payload, rule.conditions)) continue;

      const results = await runActions(rule, evt.payload);
      fired++;

      await supabase
        .from("automation_rules")
        .update({ last_run_at: new Date().toISOString(), run_count: (rule.run_count ?? 0) + 1 })
        .eq("id", rule.id);

      await log({
        kind: "rule",
        rule_id: rule.id,
        lead_id: evt.lead_id,
        status: results.some((r) => r.startsWith("FAILED")) ? "error" : "success",
        message: `${rule.name}: ${results.join(", ") || "no actions"}`,
        detail: { event: evt.event_type, results },
      });
    }
  }
  return fired;
}

// ─── 3. Time-driven rules ────────────────────────────────────
async function runScheduledRules() {
  const { data: rules } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("enabled", true)
    .in("trigger_type", ["lead_idle", "followup_due", "schedule_daily"]);

  if (!rules?.length) return 0;

  let fired = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const rule of rules) {
    // Time rules run at most once per calendar day.
    if (rule.last_run_at && String(rule.last_run_at).slice(0, 10) === today) continue;

    let leads: any[] = [];

    if (rule.trigger_type === "lead_idle") {
      const days = Number(rule.trigger_config?.days ?? 7);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      let q = supabase
        .from("leads")
        .select("*")
        .lt("created_at", cutoff.toISOString())
        .not("status", "in", '("closed_won","not_interested")');
      if (rule.project_id) q = q.eq("project_id", rule.project_id);

      const { data } = await q.limit(200);
      leads = data ?? [];
    } else if (rule.trigger_type === "followup_due") {
      let q = supabase.from("leads").select("*").lte("next_followup_date", today).not("next_followup_date", "is", null);
      if (rule.project_id) q = q.eq("project_id", rule.project_id);

      const { data } = await q.limit(200);
      leads = data ?? [];
    } else if (rule.trigger_type === "schedule_daily") {
      // Digest: summarise, POST once, no per-lead actions.
      let q = supabase.from("leads").select("status, value, created_at, company_name");
      if (rule.project_id) q = q.eq("project_id", rule.project_id);
      const { data } = await q;

      const all = data ?? [];
      const since = new Date();
      since.setDate(since.getDate() - 1);
      const newToday = all.filter((l: any) => new Date(l.created_at) >= since);

      const summary = {
        total_leads: all.length,
        new_last_24h: newToday.length,
        by_status: all.reduce((acc: Record<string, number>, l: any) => {
          acc[l.status] = (acc[l.status] ?? 0) + 1;
          return acc;
        }, {}),
        pipeline_value: all
          .filter((l: any) => !["closed_won", "not_interested"].includes(l.status))
          .reduce((s: number, l: any) => s + Number(l.value ?? 0), 0),
        new_companies: newToday.map((l: any) => l.company_name).slice(0, 25),
      };

      const url = rule.actions?.find((a: any) => a.type === "webhook")?.url;
      let status = "success";
      let message = `Digest: ${summary.new_last_24h} new, ${summary.total_leads} total`;

      if (url) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rule: rule.name, digest: summary }),
            signal: AbortSignal.timeout(15000),
          });
          message += ` (posted ${res.status})`;
        } catch (e) {
          status = "error";
          message += ` (post failed: ${String((e as Error)?.message ?? e)})`;
        }
      }

      await supabase
        .from("automation_rules")
        .update({ last_run_at: new Date().toISOString(), run_count: (rule.run_count ?? 0) + 1 })
        .eq("id", rule.id);

      await log({ kind: "rule", rule_id: rule.id, status, message, detail: summary });
      fired++;
      continue;
    }

    const eligible = leads.filter((l) => matches(l, rule.conditions));
    const capped = eligible.slice(0, 50);
    const results: string[] = [];

    for (const lead of capped) {
      results.push(...(await runActions(rule, lead)));
    }

    await supabase
      .from("automation_rules")
      .update({ last_run_at: new Date().toISOString(), run_count: (rule.run_count ?? 0) + 1 })
      .eq("id", rule.id);

    await log({
      kind: "rule",
      rule_id: rule.id,
      status: "success",
      message: `${rule.name}: matched ${eligible.length} lead(s), acted on ${capped.length}${eligible.length > capped.length ? ` (capped at 50 — ${eligible.length - capped.length} deferred to the next run)` : ""}`,
      detail: {
        matched: eligible.length,
        acted_on: capped.length,
        capped: eligible.length > capped.length,
        results: results.slice(0, 100),
      },
    });

    if (capped.length) fired++;
  }
  return fired;
}

// ─── Entrypoint ────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // Claim a batch of pending events.
    const { data: events } = await supabase
      .from("automation_events")
      .select("*")
      .is("processed_at", null)
      .order("id", { ascending: true })
      .limit(100);

    const batch = events ?? [];

    const [delivered, eventRulesFired] = await Promise.all([
      deliverWebhooks(batch),
      runEventRules(batch),
    ]);

    if (batch.length) {
      await supabase
        .from("automation_events")
        .update({ processed_at: new Date().toISOString() })
        .in("id", batch.map((e: any) => e.id));
    }

    const scheduledFired = await runScheduledRules();

    return json({
      ok: true,
      events_processed: batch.length,
      webhook_deliveries: delivered,
      event_rules_fired: eventRulesFired,
      scheduled_rules_fired: scheduledFired,
    });
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    await log({ kind: "dispatch", status: "error", message });
    return json({ ok: false, error: message }, 500);
  }
});
