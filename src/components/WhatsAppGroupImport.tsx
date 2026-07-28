import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle,
  XCircle,
  Phone,
  Users,
  AlertCircle,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { createBulkLeads } from "@/lib/supabase";

// ─── Phone parsing helpers ────────────────────────────────────────────────────

/** Strip everything except digits */
const digitsOnly = (s: string) => s.replace(/\D/g, "");

/**
 * Try to normalise a raw token into an internationalised 10-digit Indian
 * mobile or an international number we can't fully validate.
 * Returns null if it looks definitely invalid.
 */
function normalisePhone(raw: string): { display: string; wa: string } | null {
  const d = digitsOnly(raw.trim());
  if (!d) return null;

  // Indian mobile: ends in 10-digit block starting with 6-9
  // Accept: 10 digits, 91+10 digits, 0+10 digits, +91+10 digits
  if (d.length === 10 && /^[6-9]/.test(d)) {
    return { display: `+91 ${d}`, wa: `91${d}` };
  }
  if (d.length === 11 && d.startsWith("0") && /^[6-9]/.test(d[1])) {
    const mobile = d.slice(1);
    return { display: `+91 ${mobile}`, wa: `91${mobile}` };
  }
  if (d.length === 12 && d.startsWith("91") && /^[6-9]/.test(d[2])) {
    const mobile = d.slice(2);
    return { display: `+91 ${mobile}`, wa: d };
  }
  // International (not Indian): must be at least 7 digits
  if (d.length >= 7 && d.length <= 15) {
    return { display: `+${d}`, wa: d };
  }
  return null;
}

/**
 * Parse the raw textarea: split on newlines, commas, semicolons, pipes, spaces.
 * WhatsApp group exports typically look like:
 *   +91 98765 43210, 9876543210
 *   John: +91-9876543210
 * We strip everything that is not a digit or '+', then validate.
 */
function parseNumbers(raw: string): {
  valid: { display: string; wa: string; original: string }[];
  invalid: string[];
} {
  // Split on common delimiters AND newlines
  const tokens = raw.split(/[\n,;|\t]+/).flatMap((t) =>
    // inside a line, also split on runs of spaces that are clearly separators
    t.split(/\s{2,}/)
  );

  const valid: { display: string; wa: string; original: string }[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    // Skip tokens that are clearly names, email-addresses, or very short
    if (trimmed.includes("@")) continue;
    if (digitsOnly(trimmed).length < 7) continue;

    const result = normalisePhone(trimmed);
    if (result && !seen.has(result.wa)) {
      seen.add(result.wa);
      valid.push({ ...result, original: trimmed });
    } else if (!result) {
      // Only report as invalid if it contained some digits
      if (/\d{4,}/.test(trimmed)) invalid.push(trimmed);
    }
  }

  return { valid, invalid };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string }[];
  salesUsers: { id: string; full_name?: string; email: string }[];
  defaultProjectId?: string;
  onImported?: (count: number) => void;
}

type Step = "paste" | "preview" | "importing" | "done";

const WhatsAppGroupImport = ({
  open,
  onClose,
  projects,
  salesUsers,
  defaultProjectId,
  onImported,
}: Props) => {
  const [step, setStep] = useState<Step>("paste");

  // Step 1 – paste
  const [rawInput, setRawInput] = useState("");
  const [groupName, setGroupName] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [assignedTo, setAssignedTo] = useState("unassigned");
  const [contactNameTemplate, setContactNameTemplate] = useState("");

  // Step 2 – preview
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  // Parse numbers reactively while user types
  const parsed = useMemo(() => parseNumbers(rawInput), [rawInput]);

  const resetAll = () => {
    setStep("paste");
    setRawInput("");
    setGroupName("");
    setProjectId(defaultProjectId || "");
    setAssignedTo("unassigned");
    setContactNameTemplate("");
    setError(null);
    setImportedCount(0);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleNext = () => {
    if (parsed.valid.length === 0) {
      setError("No valid phone numbers found. Paste at least one number.");
      return;
    }
    if (!projectId) {
      setError("Please select a project.");
      return;
    }
    setError(null);
    setStep("preview");
  };

  const handleImport = async () => {
    setStep("importing");
    setError(null);

    const leadsToCreate = parsed.valid.map((p, i) => ({
      company_name: groupName
        ? `${groupName} Contact ${i + 1}`
        : `WA Group Contact ${i + 1}`,
      contact_name: contactNameTemplate
        ? `${contactNameTemplate} ${i + 1}`
        : `Contact ${i + 1}`,
      phone: p.display,
      mobile_phone: p.display,
      project_id: projectId,
      assigned_to: assignedTo === "unassigned" ? null : assignedTo,
      lead_source: "WhatsApp Group",
      list_name: groupName || "WhatsApp Group Import",
      status: "new" as const,
      value: 0,
    }));

    const { data, error: err } = await createBulkLeads(leadsToCreate);

    if (err) {
      setError(`Import failed: ${err.message || "Unknown error"}`);
      setStep("preview");
      return;
    }

    const count = data?.length || leadsToCreate.length;
    setImportedCount(count);
    setStep("done");
    onImported?.(count);
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderPaste = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-slate-300 text-sm mb-1.5 block">
          WhatsApp Group Name <span className="text-slate-500">(optional)</span>
        </Label>
        <Input
          placeholder="e.g. Blockchain ERP Prospects"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
        />
      </div>

      <div>
        <Label className="text-slate-300 text-sm mb-1.5 block">
          Paste phone numbers <span className="text-slate-400 font-normal">— any format, one per line or comma-separated</span>
        </Label>
        <Textarea
          rows={10}
          placeholder={`Examples of accepted formats:\n+91 98765 43210\n9876543210\n91-9876543210\n0987-654-3210\n+1 415 555 0100\n\nYou can also paste the full WhatsApp group member list — numbers will be extracted automatically.`}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 font-mono text-sm resize-none"
        />
      </div>

      {rawInput.trim() && (
        <div className="flex gap-3 text-sm">
          <span className="flex items-center gap-1.5 text-green-400">
            <CheckCircle className="w-4 h-4" />
            {parsed.valid.length} valid
          </span>
          {parsed.invalid.length > 0 && (
            <span className="flex items-center gap-1.5 text-amber-400">
              <AlertCircle className="w-4 h-4" />
              {parsed.invalid.length} skipped
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-slate-300 text-sm mb-1.5 block">Project *</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-slate-300 text-sm mb-1.5 block">
            Assign to <span className="text-slate-500">(optional)</span>
          </Label>
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {salesUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-slate-300 text-sm mb-1.5 block">
          Contact name prefix <span className="text-slate-500">(optional — e.g. "Prospect" → Prospect 1, Prospect 2…)</span>
        </Label>
        <Input
          placeholder="Contact"
          value={contactNameTemplate}
          onChange={(e) => setContactNameTemplate(e.target.value)}
          className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
        />
      </div>

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-red-400 text-sm">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  const renderPreview = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
        <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
        <div className="text-sm">
          <span className="text-white font-medium">{parsed.valid.length} numbers</span>
          <span className="text-slate-400"> will be imported as leads</span>
          {groupName && <span className="text-slate-400"> into <span className="text-white">{groupName}</span></span>}
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 sticky top-0 bg-slate-800">
            <tr>
              <th className="text-left py-2 px-3 text-slate-400 font-medium">#</th>
              <th className="text-left py-2 px-3 text-slate-400 font-medium">Phone</th>
              <th className="text-left py-2 px-3 text-slate-400 font-medium">Lead Name</th>
            </tr>
          </thead>
          <tbody>
            {parsed.valid.map((p, i) => (
              <tr key={p.wa} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 px-3 text-slate-500">{i + 1}</td>
                <td className="py-2 px-3 text-white font-mono">{p.display}</td>
                <td className="py-2 px-3 text-slate-300">
                  {groupName
                    ? `${groupName} Contact ${i + 1}`
                    : `WA Group Contact ${i + 1}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {parsed.invalid.length > 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-amber-400 text-xs font-medium mb-1 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {parsed.invalid.length} entries skipped (not valid phone numbers)
          </p>
          <p className="text-slate-500 text-xs font-mono truncate">
            {parsed.invalid.slice(0, 5).join(", ")}
            {parsed.invalid.length > 5 && ` …and ${parsed.invalid.length - 5} more`}
          </p>
        </div>
      )}

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-red-400 text-sm">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  const renderImporting = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <Loader2 className="w-12 h-12 text-green-400 animate-spin" />
      <p className="text-white font-medium">Creating {parsed.valid.length} leads…</p>
      <p className="text-slate-400 text-sm">Please wait</p>
    </div>
  );

  const renderDone = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
        <CheckCircle className="w-8 h-8 text-green-400" />
      </div>
      <div>
        <p className="text-white text-lg font-bold mb-1">
          {importedCount} leads imported!
        </p>
        <p className="text-slate-400 text-sm">
          WhatsApp group contacts are now in your leads list.
          {assignedTo !== "unassigned" && " They've been assigned to the selected salesperson."}
        </p>
      </div>
      <div className="flex gap-3 mt-2">
        <Button
          onClick={resetAll}
          variant="outline"
          className="bg-white/5 border-white/10 text-white hover:bg-white/10"
        >
          Import Another Group
        </Button>
        <Button
          onClick={handleClose}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          Done
        </Button>
      </div>
    </div>
  );

  const stepTitle: Record<Step, string> = {
    paste: "Import WhatsApp Group Numbers",
    preview: "Preview Import",
    importing: "Importing…",
    done: "Import Complete",
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl bg-slate-900 border-white/10 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <div className="w-8 h-8 rounded-lg bg-green-600/30 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-green-400" />
            </div>
            {stepTitle[step]}
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {step === "paste" && renderPaste()}
          {step === "preview" && renderPreview()}
          {step === "importing" && renderImporting()}
          {step === "done" && renderDone()}
        </div>

        {(step === "paste" || step === "preview") && (
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            {step === "preview" && (
              <Button
                variant="outline"
                onClick={() => setStep("paste")}
                className="bg-white/5 border-white/10 text-white hover:bg-white/10"
              >
                ← Back
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleClose}
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            {step === "paste" && (
              <Button
                onClick={handleNext}
                disabled={parsed.valid.length === 0 || !projectId}
                className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                <Users className="w-4 h-4 mr-2" />
                Preview {parsed.valid.length > 0 ? `${parsed.valid.length} numbers` : ""}
              </Button>
            )}
            {step === "preview" && (
              <Button
                onClick={handleImport}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Phone className="w-4 h-4 mr-2" />
                Import {parsed.valid.length} Leads
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppGroupImport;
