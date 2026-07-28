# n8n workflows for Call-Leads CRM

Four ready-to-import workflows. In n8n: **Workflows → ⋯ menu → Import from File**.

Each one has `PASTE_YOUR_..._HERE` placeholders. Search for `PASTE_` after importing — that's everything you need to fill in.

Generate the API keys in the CRM at **Automations → Incoming → New key**. Make one key per source so you can see where each lead came from and revoke them independently.

| File | What it does | Needs |
|---|---|---|
| `1-instagram-facebook-leads-to-crm.json` | Instagram + Facebook lead ads land in the CRM | Meta App Review for `leads_retrieval` |
| `2-hosted-lead-form-to-crm.json` | n8n hosts a form; submissions become leads | Nothing — works today |
| `3-linkedin-bridge-to-crm.json` | Receives LinkedIn leads via Zapier (or Lead Sync) | A Zapier account, or LinkedIn approval |
| `4-crm-events-to-alerts.json` | CRM pushes lead events out to Slack/WhatsApp/email | Nothing |

## Notes per workflow

**1 — Instagram + Facebook Lead Ads.** Instagram is a *placement*; the leads belong to the connected Facebook Page, which is why there's no Instagram node here and none is needed. After importing, connect a Facebook Lead Ads credential and pick your Page and Form from the dropdowns.

Two gotchas worth knowing. Meta allows only **one webhook URL per app**, so n8n's test URL and production URL overwrite each other — unpublish the workflow while testing, then publish. And n8n permits only one Facebook Lead Ads trigger per Facebook App.

**2 — Hosted lead form.** The fastest path to working lead capture, with no platform review at all. Activate the workflow, copy the form URL, point your ads at it. If you rename a form field, update the matching expression in the *Map to CRM Fields* node — the keys are the field labels exactly as typed.

**3 — LinkedIn bridge.** Set up Zapier's *LinkedIn Lead Gen Forms* trigger, then a *Webhooks by Zapier* action POSTing to this workflow's URL. Zapier already holds LinkedIn's API approval, so you don't need your own. The same workflow accepts direct LinkedIn Lead Sync traffic if you're ever approved — it responds immediately, which satisfies LinkedIn's 3-second requirement.

**4 — Outbound alerts.** Copy the webhook node's Production URL into the CRM at **Automations → Outgoing**. Ships configured for a Slack incoming webhook; for WhatsApp swap the last node for your provider's (Twilio, Gupshup, WATI) and map `$json.message` into the body. The filter only alerts on leads ≥ ₹1,00,000 or marked urgent — adjust or delete that node to change it.

## Verifying webhook signatures (optional)

Outbound deliveries carry `X-Techvitta-Signature`, an HMAC-SHA256 of the raw body keyed with the webhook's secret (copyable from the Automations page). Verifying it stops anyone forging events at your workflow.

The Code node can't `require('crypto')` unless your n8n has `NODE_FUNCTION_ALLOW_BUILTIN=crypto` set. If you're on n8n Cloud you can't set that — use a **Crypto** node in HMAC mode instead, then compare its output to the header with an IF node.

Worth doing if your n8n is reachable from the public internet. Skip it if you're self-hosted behind a firewall.

## Testing without any platform

```bash
curl -X POST 'https://uvqlonqtlqypxqatgbih.supabase.co/functions/v1/lead-intake' \
  -H 'x-api-key: YOUR_KEY_HERE' \
  -H 'Content-Type: application/json' \
  -d '{"company_name":"Test Co","contact_name":"Test User","email":"test@example.com","phone":"9876543210"}'
```

Expect `{"ok": true, "created": 1, ...}`. Then check **Automations → Log** in the CRM.

## If an import fails

n8n is strict about node type strings and version numbers. These were verified against n8n's source, but if your n8n is older than the node versions used here (HTTP Request 4.5, Form Trigger 2.6, Webhook 2.1, Set 3.5, IF 2.3, Code 2), update n8n or lower the `typeVersion` on the offending node and re-check its parameters — older versions use different parameter names.
