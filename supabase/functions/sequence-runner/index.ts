// ═══════════════════════════════════════════════════════════════
// sequence-runner — advances outreach cadences.
//
// Runs on a schedule. For every enrolment whose next action is due:
//   1. Check stop conditions (status moved on, or the lead engaged)
//   2. Fire the next step — usually by creating a task for the rep
//   3. Schedule the step after that
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

const log = (row: Record<string, unknown>) =>
  supabase.from("automation_runs").insert(row).then(() => {}, () => {});

/**
 * Fill {{placeholders}} from the lead.
 *
 * Real CRM data is patchy — a fifth of leads here have no contact name and
 * none have a city — so naive substitution yields "Hi , following up".
 * Fallbacks are chosen to read naturally in a sentence: a missing person's
 * name becomes "there", never the company name ("Hi Acme Pvt Ltd," is worse
 * than the bug it replaces). Punctuation left behind is then tidied.
 */
function render(tpl: string | null | undefined, lead: any): string {
  const val = (key: string): string => {
    const raw = String(lead?.[key] ?? "").trim();
    if (raw) return raw;

    switch (key) {
      case "contact_name":
        return "there";
      case "company_name":
        return "your team";
      case "city":
      case "state":
      case "country":
        return "your area";
      case "designation":
        return "your role";
      default:
        return "";
    }
  };

  let out = String(tpl ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => val(k));

  // Tidy what an unavoidably-empty placeholder leaves behind, and normalise
  // the stray punctuation that messy company names often carry.
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,;:])\s*([,.!?;:])/g, "$2")
    .replace(/([,;:])\s*\./g, ".")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+$/gm, "")
    .trim();

  return out;
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  // Land on 09:00 rather than the middle of the night.
  d.setHours(9, 0, 0, 0);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const now = new Date();
  let advanced = 0;
  let stopped = 0;
  let completed = 0;
  let tasksCreated = 0;

  try {
    const { data: due, error } = await supabase
      .from("sequence_enrollments")
      .select("*, sequences(*), leads(*)")
      .eq("status", "active")
      .lte("next_action_at", now.toISOString())
      .order("next_action_at", { ascending: true })
      .limit(200);

    if (error) throw error;

    for (const enrolment of due ?? []) {
      const seq: any = enrolment.sequences;
      const lead: any = enrolment.leads;

      // Sequence deleted or lead gone — retire the enrolment.
      if (!seq || !lead) {
        await supabase
          .from("sequence_enrollments")
          .update({
            status: "stopped",
            stop_reason: "sequence or lead no longer exists",
            completed_at: now.toISOString(),
          })
          .eq("id", enrolment.id);
        stopped++;
        continue;
      }

      if (!seq.enabled) continue; // paused; leave it due so it resumes later

      const retire = async (reason: string) => {
        await supabase
          .from("sequence_enrollments")
          .update({ status: "stopped", stop_reason: reason, completed_at: now.toISOString() })
          .eq("id", enrolment.id);

        // Cancel outstanding tasks so reps aren't chasing a dead lead.
        await supabase
          .from("sequence_tasks")
          .update({ skipped: true, completed_at: now.toISOString() })
          .eq("enrollment_id", enrolment.id)
          .is("completed_at", null);

        stopped++;
      };

      // ── Stop conditions ──────────────────────────────────
      const stopStatuses: string[] = seq.stop_on_status ?? [];
      if (stopStatuses.includes(lead.status)) {
        await retire(`lead status became "${lead.status}"`);
        continue;
      }

      // Engagement proxy: any activity logged against the lead since the
      // enrolment started. We have no inbox integration, so a rep logging a
      // call or note is the closest signal to "they replied" we can get.
      if (seq.stop_on_reply) {
        const { count } = await supabase
          .from("lead_activities")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id)
          .gt("created_at", enrolment.enrolled_at);

        if ((count ?? 0) > 0) {
          await retire("lead engaged (activity logged since enrolment)");
          continue;
        }
      }

      // ── Find the next step ───────────────────────────────
      const nextOrder = (enrolment.current_step ?? 0) + 1;

      const { data: step } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", seq.id)
        .eq("step_order", nextOrder)
        .maybeSingle();

      if (!step) {
        await supabase
          .from("sequence_enrollments")
          .update({ status: "completed", completed_at: now.toISOString() })
          .eq("id", enrolment.id);
        completed++;
        continue;
      }

      // ── Fire the step ──────────────────────────────────
      let note = "";

      if (step.step_type === "status_change" && step.config?.status) {
        await supabase.from("leads").update({ status: step.config.status }).eq("id", lead.id);
        note = `status → ${step.config.status}`;
      } else if (step.step_type === "webhook" && step.config?.url) {
        try {
          const res = await fetch(step.config.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sequence: seq.name,
              step: step.step_order,
              lead,
              subject: render(step.subject, lead),
              body: render(step.body, lead),
            }),
            signal: AbortSignal.timeout(15000),
          });
          note = `webhook ${res.status}`;
        } catch (e) {
          note = `webhook failed: ${String((e as Error)?.message ?? e)}`;
        }
      } else {
        // whatsapp | email | call | task — all need a human, so queue a task.
        await supabase.from("sequence_tasks").insert({
          enrollment_id: enrolment.id,
          step_id: step.id,
          lead_id: lead.id,
          assigned_to: lead.assigned_to,
          step_type: step.step_type,
          subject: render(step.subject, lead) || `${step.step_type} — ${lead.company_name}`,
          body: render(step.body, lead),
          due_at: now.toISOString(),
        });
        tasksCreated++;
        note = `${step.step_type} task queued`;
      }

      // ── Schedule the following step ────────────────────────
      const { data: following } = await supabase
        .from("sequence_steps")
        .select("wait_days")
        .eq("sequence_id", seq.id)
        .eq("step_order", nextOrder + 1)
        .maybeSingle();

      if (following) {
        await supabase
          .from("sequence_enrollments")
          .update({
            current_step: nextOrder,
            next_action_at: addDays(now, Number(following.wait_days ?? 1)).toISOString(),
          })
          .eq("id", enrolment.id);
      } else {
        await supabase
          .from("sequence_enrollments")
          .update({
            current_step: nextOrder,
            status: "completed",
            completed_at: now.toISOString(),
          })
          .eq("id", enrolment.id);
        completed++;
      }

      advanced++;

      await log({
        kind: "sequence",
        lead_id: lead.id,
        status: note.includes("failed") ? "error" : "success",
        message: `${seq.name} step ${nextOrder} (${step.step_type}) — ${lead.company_name}: ${note}`,
        detail: { sequence_id: seq.id, step_order: nextOrder, step_type: step.step_type },
      });
    }

    return json({
      ok: true,
      due: due?.length ?? 0,
      advanced,
      tasks_created: tasksCreated,
      stopped,
      completed,
    });
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    await log({ kind: "sequence", status: "error", message });
    return json({ ok: false, error: message }, 500);
  }
});
