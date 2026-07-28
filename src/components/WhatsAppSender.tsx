import { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MessageCircle,
  CheckCircle2,
  AlertTriangle,
  Phone,
  Building2,
  User,
  Eye,
  Send,
  ChevronLeft,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppSenderLead {
  id: string;
  company_name: string;
  contact_name: string;
  phone?: string;
  mobile_phone?: string;
  email?: string;
  software_category?: string;
  industry?: string;
}

export interface WhatsAppSenderProps {
  open: boolean;
  onClose: () => void;
  leads: WhatsAppSenderLead[];
  mode: "single" | "bulk";
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

interface Template {
  id: string;
  label: string;
  body: string;
}

const TEMPLATES: Template[] = [
  {
    id: "blockchain_intro",
    label: "Blockchain ERP Introduction",
    body: `Hi {contact_name},

I'm reaching out from Techvitta regarding {product} — our blockchain-powered ERP solution trusted by businesses across industries.

{product} helps companies like {company_name} achieve:
• Tamper-proof document verification (TrustDoc.in)
• Real-time supply chain tracking (ChainTrack)
• Audit-ready compliance records

I'd love to show you how we've helped similar businesses reduce operational risk and improve transparency.

Would you be open to a quick 15-minute call this week?

Best regards,
Techvitta Team`,
  },
  {
    id: "follow_up",
    label: "Follow Up",
    body: `Hi {contact_name},

Just following up on our previous conversation about {product} for {company_name}.

I wanted to check if you had any questions or if there's anything I can help clarify. We're here to make sure you have all the information needed to make the best decision for your business.

Looking forward to hearing from you!

Best regards,
Techvitta Team`,
  },
  {
    id: "demo_invite",
    label: "Demo Invite",
    body: `Hi {contact_name},

I'd like to personally invite you to a live demo of {product} tailored specifically for {company_name}.

In just 30 minutes, you'll see:
✅ Live walkthrough of key features
✅ Use cases relevant to your industry
✅ Q&A with our product specialist

Please let me know your preferred time and we'll set it up right away.

Best regards,
Techvitta Team`,
  },
  {
    id: "quotation_sent",
    label: "Quotation Sent",
    body: `Hi {contact_name},

I've just sent over the quotation for {product} to your email address for {company_name}.

Please review it at your earliest convenience. The proposal includes:
• Pricing breakdown
• Implementation timeline
• Support & onboarding plan

Feel free to reply here or call us if you have any questions. We're happy to customise the package to fit your needs.

Best regards,
Techvitta Team`,
  },
  {
    id: "custom",
    label: "Custom",
    body: "",
  },
];

const PRODUCT_OPTIONS = ["TrustDoc.in", "ChainTrack", "Techvitta ERP"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the best available phone number for a lead, preferring mobile.
 */
function resolvePhone(lead: WhatsAppSenderLead): string | null {
  return lead.mobile_phone?.trim() || lead.phone?.trim() || null;
}

/**
 * Strips non-digit characters and returns a WhatsApp-safe number.
 * Adds country code 91 (India) if the number looks local (10 digits, starts with 6–9).
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  return digits;
}

/**
 * Interpolates template variables in the message body.
 */
function applyVariables(
  body: string,
  lead: WhatsAppSenderLead,
  product: string
): string {
  return body
    .replace(/\{contact_name\}/g, lead.contact_name || "")
    .replace(/\{company_name\}/g, lead.company_name || "")
    .replace(/\{product\}/g, product);
}

/**
 * Builds a wa.me deep-link URL.
 */
function buildWaLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface LeadPhoneStatusProps {
  lead: WhatsAppSenderLead;
}

function LeadPhoneStatus({ lead }: LeadPhoneStatusProps) {
  const phone = resolvePhone(lead);
  return (
    <div className="flex items-center gap-1.5">
      <Phone className="w-3 h-3 text-slate-400" />
      {phone ? (
        <span className="text-xs text-slate-600 font-mono">{phone}</span>
      ) : (
        <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> No phone
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Step = "compose" | "sending" | "done";

export default function WhatsAppSender({
  open,
  onClose,
  leads,
  mode,
}: WhatsAppSenderProps) {
  // ── Template state ──────────────────────────────────────────────────────
  const [templateId, setTemplateId] = useState<string>(TEMPLATES[0].id);
  const [customBody, setCustomBody] = useState<string>("");
  const [product, setProduct] = useState<string>(PRODUCT_OPTIONS[0]);

  // ── Bulk selection ──────────────────────────────────────────────────────
  const leadsWithPhone = useMemo(
    () => leads.filter((l) => resolvePhone(l) !== null),
    [leads]
  );
  const leadsWithoutPhone = useMemo(
    () => leads.filter((l) => resolvePhone(l) === null),
    [leads]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(leadsWithPhone.map((l) => l.id))
  );

  // ── Sending progress ────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("compose");
  const [sentCount, setSentCount] = useState(0);
  const [sendingIndex, setSendingIndex] = useState(0);

  // ── Derived values ──────────────────────────────────────────────────────
  const activeTemplate = useMemo(
    () => TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0],
    [templateId]
  );

  const messageBody = useMemo<string>(() => {
    return templateId === "custom" ? customBody : activeTemplate.body;
  }, [templateId, activeTemplate.body, customBody]);

  const previewLead = useMemo<WhatsAppSenderLead>(
    () =>
      mode === "single"
        ? leads[0]
        : leads.find((l) => selectedIds.has(l.id)) ?? leads[0],
    [leads, mode, selectedIds]
  );

  const previewMessage = useMemo<string>(() => {
    if (!previewLead) return messageBody;
    return applyVariables(messageBody, previewLead, product);
  }, [previewLead, messageBody, product]);

  const selectedLeads = useMemo<WhatsAppSenderLead[]>(
    () =>
      mode === "bulk"
        ? leads.filter((l) => selectedIds.has(l.id) && resolvePhone(l) !== null)
        : leads.slice(0, 1),
    [leads, mode, selectedIds]
  );

  // ── Handlers ────────────────────────────────────────────────────────────

  const toggleLead = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === leadsWithPhone.length
        ? new Set()
        : new Set(leadsWithPhone.map((l) => l.id))
    );
  }, [leadsWithPhone]);

  const handleSend = useCallback(async () => {
    if (selectedLeads.length === 0) return;

    setStep("sending");
    setSendingIndex(0);
    setSentCount(0);

    for (let i = 0; i < selectedLeads.length; i++) {
      const lead = selectedLeads[i];
      const phone = resolvePhone(lead);
      if (!phone) continue;

      const message = applyVariables(messageBody, lead, product);
      const url = buildWaLink(phone, message);

      setSendingIndex(i + 1);
      window.open(url, "_blank", "noopener,noreferrer");
      setSentCount((c) => c + 1);

      // Stagger tab openings so browsers don't block them as pop-ups
      if (i < selectedLeads.length - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
    }

    setStep("done");
  }, [selectedLeads, messageBody, product]);

  const handleClose = useCallback(() => {
    // Reset state on close so the dialog is fresh on next open
    setStep("compose");
    setSentCount(0);
    setSendingIndex(0);
    setTemplateId(TEMPLATES[0].id);
    setCustomBody("");
    setProduct(PRODUCT_OPTIONS[0]);
    setSelectedIds(new Set(leadsWithPhone.map((l) => l.id)));
    onClose();
  }, [leadsWithPhone, onClose]);

  const canSend =
    selectedLeads.length > 0 && messageBody.trim().length > 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <div className="w-8 h-8 rounded-lg bg-[#25D366] flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            Send WhatsApp Message
            {mode === "bulk" && (
              <Badge
                variant="secondary"
                className="ml-1 text-xs bg-slate-100 text-slate-600"
              >
                {leads.length} lead{leads.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── COMPOSE STEP ─────────────────────────────────────────────── */}
        {step === "compose" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">
            {/* Left column: controls */}
            <div className="space-y-4">
              {/* Product */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Product
                </Label>
                <Select value={product} onValueChange={setProduct}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Template */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Message Template
                </Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Custom body */}
              {templateId === "custom" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Your Message
                  </Label>
                  <Textarea
                    className="min-h-[160px] text-sm resize-none leading-relaxed"
                    placeholder={`Hi {contact_name},\n\nYour message here…\n\nYou can use: {contact_name}, {company_name}, {product}`}
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                  />
                  <p className="text-xs text-slate-400">
                    Variables: <code className="bg-slate-100 px-1 rounded">{"{contact_name}"}</code>{" "}
                    <code className="bg-slate-100 px-1 rounded">{"{company_name}"}</code>{" "}
                    <code className="bg-slate-100 px-1 rounded">{"{product}"}</code>
                  </p>
                </div>
              )}

              {/* Bulk lead selector */}
              {mode === "bulk" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Recipients
                    </Label>
                    <span className="text-xs text-slate-400">
                      {selectedIds.size} selected
                    </span>
                  </div>

                  {/* Select-all row */}
                  <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
                    <Checkbox
                      id="wa-select-all"
                      checked={
                        leadsWithPhone.length > 0 &&
                        selectedIds.size === leadsWithPhone.length
                      }
                      onCheckedChange={toggleAll}
                    />
                    <label
                      htmlFor="wa-select-all"
                      className="text-xs text-slate-600 cursor-pointer select-none"
                    >
                      Select all with phone numbers
                    </label>
                  </div>

                  {/* Lead list */}
                  <div className="space-y-1 max-h-[220px] overflow-y-auto pr-0.5">
                    {leads.map((lead) => {
                      const phone = resolvePhone(lead);
                      const disabled = phone === null;
                      const checked = selectedIds.has(lead.id);

                      return (
                        <div
                          key={lead.id}
                          onClick={() => !disabled && toggleLead(lead.id)}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors ${
                            disabled
                              ? "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                              : checked
                              ? "border-[#25D366]/40 bg-green-50 cursor-pointer"
                              : "border-slate-200 bg-white hover:border-slate-300 cursor-pointer"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={() => !disabled && toggleLead(lead.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                                <Building2 className="w-3 h-3 text-slate-400" />
                                {lead.company_name}
                              </span>
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-400" />
                                {lead.contact_name}
                              </span>
                            </div>
                            <LeadPhoneStatus lead={lead} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Warning: leads without phone */}
                  {leadsWithoutPhone.length > 0 && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        {leadsWithoutPhone.length} lead
                        {leadsWithoutPhone.length !== 1 ? "s have" : " has"} no
                        phone number and will be skipped.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Single mode: lead info */}
              {mode === "single" && leads[0] && (
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-800">
                      {leads[0].company_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-600">
                      {leads[0].contact_name}
                    </span>
                  </div>
                  <LeadPhoneStatus lead={leads[0]} />
                  {resolvePhone(leads[0]) === null && (
                    <div className="flex items-start gap-1.5 pt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      This lead has no phone number. Add a phone number before
                      sending via WhatsApp.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right column: preview */}
            <div className="space-y-2 flex flex-col">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Message Preview
                </Label>
                {previewLead && (
                  <span className="ml-auto text-xs text-slate-400 font-normal">
                    for {previewLead.contact_name}
                  </span>
                )}
              </div>

              <div className="flex-1 relative">
                {/* WhatsApp-style chat bubble */}
                <div className="h-full min-h-[260px] bg-[#ECE5DD] rounded-xl p-4 overflow-y-auto">
                  <div className="max-w-[85%]">
                    <div className="bg-white rounded-xl rounded-tl-none shadow-sm px-3.5 py-2.5">
                      {previewMessage ? (
                        <p className="text-[13px] text-slate-800 whitespace-pre-wrap leading-relaxed">
                          {previewMessage}
                        </p>
                      ) : (
                        <p className="text-[13px] text-slate-400 italic">
                          Select a template or type a custom message…
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1 text-right">
                        {new Date().toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Character count */}
              {previewMessage && (
                <p className="text-xs text-slate-400 text-right">
                  {previewMessage.length} characters
                </p>
              )}
            </div>

            {/* Footer actions — full width */}
            <div className="lg:col-span-2 flex items-center justify-between pt-2 border-t border-slate-100 gap-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={!canSend}
                className="bg-[#25D366] hover:bg-[#1EBE5A] text-white gap-2 font-medium"
              >
                <Send className="w-4 h-4" />
                {mode === "bulk"
                  ? `Open WhatsApp for ${selectedLeads.length} Lead${selectedLeads.length !== 1 ? "s" : ""}`
                  : "Open WhatsApp"}
              </Button>
            </div>
          </div>
        )}

        {/* ── SENDING STEP ─────────────────────────────────────────────── */}
        {step === "sending" && (
          <div className="flex flex-col items-center justify-center py-16 gap-5">
            <div className="w-16 h-16 rounded-full bg-[#25D366]/10 flex items-center justify-center animate-pulse">
              <MessageCircle className="w-8 h-8 text-[#25D366]" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold text-slate-800">Opening WhatsApp…</p>
              <p className="text-sm text-slate-500">
                {sendingIndex} of {selectedLeads.length} window
                {selectedLeads.length !== 1 ? "s" : ""} opened
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-64 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#25D366] rounded-full transition-all duration-300"
                style={{
                  width: `${(sendingIndex / selectedLeads.length) * 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-400 max-w-xs text-center">
              Each WhatsApp window is opened with a short delay to avoid
              browser pop-up blocking.
            </p>
          </div>
        )}

        {/* ── DONE STEP ────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-12 gap-5">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-lg font-semibold text-slate-900">
                {sentCount} WhatsApp Window{sentCount !== 1 ? "s" : ""} Opened
              </p>
              <p className="text-sm text-slate-500 max-w-xs">
                Each tab should have loaded with the pre-filled message ready to
                review and send inside WhatsApp.
              </p>
            </div>

            {leadsWithoutPhone.length > 0 && mode === "bulk" && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 max-w-xs">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  {leadsWithoutPhone.length} lead
                  {leadsWithoutPhone.length !== 1 ? "s were" : " was"} skipped
                  — no phone number on record.
                </span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setStep("compose")}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Send Another
              </Button>
              <Button
                className="bg-[#25D366] hover:bg-[#1EBE5A] text-white"
                onClick={handleClose}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
