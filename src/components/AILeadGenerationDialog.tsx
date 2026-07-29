import { useState, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader,
  Sparkles,
  Bot,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Zap,
  Briefcase,
  Globe,
  TrendingUp,
} from "lucide-react";
import {
  generateLeadsWithAI,
  AIGeneratedLead,
  SENIORITY_TIERS,
  HEADCOUNT_BANDS,
  DEPARTMENTS,
} from "@/lib/gemini";
import { createBulkLeads, supabase } from "@/lib/supabase";

interface ProjectLike {
  id: string;
  name: string;
  description?: string | null;
}

interface AILeadGenerationDialogProps {
  open: boolean;
  onClose: () => void;
  /** All projects the user can pick from. */
  projects: ProjectLike[];
  /** Pre-selected project id (from the page filter), optional. */
  defaultProjectId?: string;
  /** Existing leads — used to avoid generating duplicates. */
  existingLeads?: any[];
  /** Sales users the new leads can be assigned to. */
  salesUsers?: any[];
  onLeadsImported: () => void;
}

const INDUSTRIES = [
  "Any / Mixed",
  "Manufacturing",
  "Retail & E-Commerce",
  "Healthcare & Hospitals",
  "Pharma & Life Sciences",
  "Dermatology & Aesthetic Clinics",
  "Logistics & Supply Chain",
  "Construction & Real Estate",
  "Agriculture & Agri-Tech",
  "Food Processing",
  "Finance & Banking",
  "Insurance",
  "Education & EdTech",
  "IT & Technology Services",
  "Staffing & Recruitment",
  "Hospitality & Tourism",
  "Automotive",
  "Aviation & Drones",
  "Textiles & Apparel",
  "Chemical & Petrochemical",
  "Energy & Utilities",
  "Mining",
  "Telecom",
  "Government & PSU",
];

const REGIONS = [
  "India",
  "South India",
  "North India",
  "West India",
  "East India",
  "Telangana & Andhra Pradesh",
  "Karnataka",
  "Tamil Nadu",
  "Maharashtra",
  "Gujarat",
  "Delhi NCR",
  "Kerala",
  "Middle East (UAE, Saudi Arabia)",
  "Southeast Asia",
  "United States",
  "United Kingdom",
  "Europe",
  "Australia & New Zealand",
  "Africa",
];

const ROLE_OPTIONS = [
  "Founder / CEO",
  "Managing Director",
  "CTO / Head of Technology",
  "COO / Head of Operations",
  "CFO / Finance Head",
  "HR Director / CHRO",
  "Head of Sales",
  "Head of Marketing",
  "Procurement / Purchase Manager",
  "Supply Chain Director",
  "Plant / Factory Manager",
  "IT Manager",
  "Compliance Officer",
  "Clinic Owner / Practice Manager",
  "Doctor / Consultant",
  "Business Owner / Proprietor",
];

const COMPANY_SIZES = [
  "Any size",
  "Micro (1–10 employees)",
  "Small (10–50 employees)",
  "SME (50–200 employees)",
  "Mid-Market (200–1000 employees)",
  "Enterprise (1000+ employees)",
];

/**
 * The leads table stores `industry` as one of a fixed set of slugs, and the
 * page's industry filter matches on those exactly. Map whatever the user picked
 * (and whatever free text Gemini returns) onto a slug so AI-generated leads are
 * still findable via that filter. The AI's specific sub-industry is preserved
 * verbatim in lead_notes.
 */
const INDUSTRY_SLUGS: Array<[RegExp, string]> = [
  [/manufactur|textile|apparel|chemical|petrochem|automotive|mining/i, "manufacturing"],
  [/retail|e-?commerce|ecommerce/i, "retail"],
  [/health|hospital|pharma|clinic|derma|medical|life science/i, "healthcare"],
  [/educat|edtech|school|college|university/i, "education"],
  [/construct|infrastructure/i, "construction"],
  [/logistic|supply chain|transport|shipping|freight|aviation|drone/i, "logistics"],
  [/hospitality|tourism|hotel|restaurant|travel/i, "hospitality"],
  [/financ|bank|insurance|fintech|lending/i, "finance"],
  [/\bit\b|technolog|software|saas|telecom|staffing|recruit/i, "it"],
  [/real estate|realty|property/i, "real_estate"],
  [/agricultur|agri|farming|food process/i, "agriculture"],
];

const toIndustrySlug = (...candidates: (string | undefined)[]): string => {
  for (const text of candidates) {
    if (!text) continue;
    for (const [pattern, slug] of INDUSTRY_SLUGS) {
      if (pattern.test(text)) return slug;
    }
  }
  return "other";
};

const CONFIDENCE_STYLES: Record<string, { cls: string; label: string; hint: string }> = {
  high:   { cls: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "Verified-ish", hint: "Model recognises this company" },
  medium: { cls: "bg-amber-100 text-amber-800 border-amber-200",       label: "Check first",  hint: "Plausible, but confirm details before calling" },
  low:    { cls: "bg-rose-100 text-rose-800 border-rose-200",          label: "Unverified",   hint: "Contact details are likely guessed \u2014 verify before use" },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

/** Sensible starting brief when a project has no description saved yet. */
const inferOffering = (projectName: string) => {
  const n = (projectName || "").toLowerCase();
  if (n.includes("hrms"))
    return "HRMS — a cloud HR management platform covering employee records, attendance, payroll, leave management and performance reviews. Sold to HR heads and business owners who are still running HR on spreadsheets.";
  if (n.includes("drone"))
    return "Drone solutions — commercial drone hardware and services for agricultural spraying, land survey, mapping and industrial inspection, plus the software to manage fleets and flight data.";
  if (n.includes("derma") || n.includes("clinic"))
    return "Derma Clinic CRM — practice management software for dermatology and aesthetic clinics: appointment booking, patient records, treatment plans, before/after photo tracking, billing and automated follow-up reminders.";
  if (n.includes("kanchii"))
    return "Kanchii — describe the product and the buyer here so the AI can find the right prospects.";
  return `${projectName} — describe what this project sells, who the ideal customer is, and the main problem it solves. The more specific you are, the better the generated leads.`;
};

export default function AILeadGenerationDialog({
  open,
  onClose,
  projects,
  defaultProjectId,
  existingLeads = [],
  salesUsers = [],
  onLeadsImported,
}: AILeadGenerationDialogProps) {
  const [step, setStep] = useState<"configure" | "results" | "importing" | "done">(
    "configure"
  );

  // ── Targeting configuration ──────────────────────────────
  const [projectId, setProjectId] = useState<string>(defaultProjectId || "");
  const [offering, setOffering] = useState("");
  const [industry, setIndustry] = useState("Any / Mixed");
  const [region, setRegion] = useState("India");
  const [location, setLocation] = useState("");
  const [companySize, setCompanySize] = useState("Any size");
  const [roles, setRoles] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [dealSizeHint, setDealSizeHint] = useState("");
  const [count, setCount] = useState("10");
  const [headcountBands, setHeadcountBands] = useState<string[]>([]);
  const [seniorities, setSeniorities] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [revenueMin, setRevenueMin] = useState("");
  const [revenueMax, setRevenueMax] = useState("");
  const [foundedAfter, setFoundedAfter] = useState("");
  const [foundedBefore, setFoundedBefore] = useState("");
  const [technologies, setTechnologies] = useState("");
  const [keywordsInclude, setKeywordsInclude] = useState("");
  const [keywordsExclude, setKeywordsExclude] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const clampedCount = Math.min(Math.max(parseInt(count) || 10, 1), 30);
  const [avoidDuplicates, setAvoidDuplicates] = useState(true);
  const [assignTo, setAssignTo] = useState<string>("unassigned");
  const [saveBrief, setSaveBrief] = useState(true);

  // ── Results ──────────────────────────────────────────────
  const [generatedLeads, setGeneratedLeads] = useState<AIGeneratedLead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );

  // The dialog stays mounted, so re-sync to the page's project filter every
  // time it opens — otherwise it would keep showing whichever project was
  // chosen last time and silently import leads into the wrong one.
  useEffect(() => {
    if (!open) return;
    const initial = defaultProjectId || (projects.length === 1 ? projects[0].id : "");
    if (initial) setProjectId(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultProjectId]);

  // Load the brief when the chosen project changes. Deliberately keyed on
  // projectId alone so re-renders never wipe out what the user has typed.
  const loadedBriefFor = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || loadedBriefFor.current === projectId) return;
    const p = projects.find((x) => x.id === projectId);
    if (!p) return;
    loadedBriefFor.current = projectId;
    setOffering(p.description?.trim() ? p.description : inferOffering(p.name));
  }, [projectId, projects]);

  // Companies already in this project — sent to the model as an exclusion list.
  const existingCompanies = useMemo(() => {
    if (!avoidDuplicates) return [];
    return Array.from(
      new Set(
        existingLeads
          .filter((l) => !projectId || l.project_id === projectId)
          .map((l) => (l.company_name || "").trim())
          .filter(Boolean)
      )
    );
  }, [existingLeads, projectId, avoidDuplicates]);

  const toggleRole = (role: string) =>
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );

  const handleGenerate = async () => {
    if (!projectId) {
      setError("Choose which project these leads belong to.");
      return;
    }
    if (offering.trim().length < 20) {
      setError(
        "Describe what this project sells in a bit more detail — the AI uses this to find matching companies."
      );
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const leads = await generateLeadsWithAI({
        offering,
        projectName: selectedProject?.name,
        industry: industry === "Any / Mixed" ? "any relevant industry" : industry,
        region,
        location: location.trim() || undefined,
        count: clampedCount,
        companySize: companySize === "Any size" ? undefined : companySize,
        roles,
        keywords: keywords.trim() || undefined,
        dealSizeHint: dealSizeHint.trim() || undefined,
        excludeCompanies: existingCompanies,
        headcountBands: headcountBands.length ? headcountBands : undefined,
        seniorities: seniorities.length ? seniorities : undefined,
        departments: departments.length ? departments : undefined,
        revenueMin: revenueMin.trim() || undefined,
        revenueMax: revenueMax.trim() || undefined,
        foundedAfter: foundedAfter.trim() || undefined,
        foundedBefore: foundedBefore.trim() || undefined,
        technologies: technologies.trim()
          ? technologies.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined,
        keywordsInclude: keywordsInclude.trim() || undefined,
        keywordsExclude: keywordsExclude.trim() || undefined,
      });

      if (leads.length === 0) {
        setError("The AI returned no usable leads. Try broadening the filters.");
        return;
      }

      // Persist the brief so the next run remembers it.
      if (
        saveBrief &&
        selectedProject &&
        offering.trim() !== (selectedProject.description || "").trim()
      ) {
        // Fire-and-forget: a failed brief save must not block the results.
        supabase
          .from("projects")
          .update({ description: offering.trim() })
          .eq("id", projectId)
          .then(
            () => {},
            () => {}
          );
      }

      setGeneratedLeads(leads);
      setSelectedIds(new Set(leads.map((l) => l.id)));
      setStep("results");
    } catch (err: any) {
      setError(err?.message || "Failed to generate leads.");
    } finally {
      setGenerating(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds((prev) =>
      prev.size === generatedLeads.length
        ? new Set()
        : new Set(generatedLeads.map((l) => l.id))
    );

  const handleImport = async () => {
    const toImport = generatedLeads.filter((l) => selectedIds.has(l.id));
    if (toImport.length === 0) return;
    setStep("importing");
    setError(null);

    try {
      const leadsPayload = toImport.map((lead) => ({
        company_name: lead.company_name,
        contact_name: lead.contact_name,
        designation: lead.designation || null,
        email: lead.email || null,
        phone: lead.phone || null,
        city: lead.city || null,
        state: lead.state || null,
        country: lead.country || null,
        linkedin: lead.linkedin || null,
        value: lead.estimated_value || 0,
        description:
          lead.fit_reason || lead.notes || `AI generated for ${selectedProject?.name || "project"}`,
        lead_notes: [
          lead.fit_reason ? `Why they fit: ${lead.fit_reason}` : "",
          lead.buying_signal ? `Buying signal: ${lead.buying_signal}` : "",
          lead.company_size ? `Company size: ${lead.company_size}` : "",
          lead.website ? `Website: ${lead.website}` : "",
          lead.industry ? `Sub-industry: ${lead.industry}` : "",
          lead.notes || "",
        ]
          .filter(Boolean)
          .join("\n"),
        lead_source: "AI Generated",
        data_source: "Gemini AI",
        priority: lead.priority,
        industry: toIndustrySlug(lead.industry, industry === "Any / Mixed" ? undefined : industry),
        status: "new",
        project_id: projectId,
        assigned_to: assignTo === "unassigned" ? null : assignTo,
      }));

      const res: any = await createBulkLeads(leadsPayload as any);
      if (res?.error) throw new Error(res.error.message || "Import failed");

      setImportedCount(toImport.length);
      setStep("done");
      onLeadsImported();
    } catch (err: any) {
      setError(err?.message || "Import failed. Please try again.");
      setStep("results");
    }
  };

  const handleClose = () => {
    setStep("configure");
    setGeneratedLeads([]);
    setSelectedIds(new Set());
    setError(null);
    setImportedCount(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            AI Lead Generation
          </DialogTitle>
          <DialogDescription>
            Gemini AI researches prospects that match your project's offering and filters
          </DialogDescription>
        </DialogHeader>

        {/* ── CONFIGURE ── */}
        {step === "configure" && (
          <div className="space-y-5 pt-1">
            {/* Project + brief */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-semibold text-slate-800 mb-1.5 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5" />
                    Project *
                  </Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Choose a project…" />
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
                <div>
                  <Label className="text-sm font-semibold text-slate-800 mb-1.5 block">
                    Assign generated leads to
                  </Label>
                  <Select value={assignTo} onValueChange={setAssignTo}>
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Leave unassigned</SelectItem>
                      {salesUsers.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold text-slate-800 mb-1.5 block">
                  What this project sells (the AI targets against this) *
                </Label>
                <Textarea
                  value={offering}
                  onChange={(e) => setOffering(e.target.value)}
                  rows={4}
                  placeholder="e.g. HRMS — cloud HR platform for attendance, payroll and leave. Sold to HR heads at 50–500 person companies still using spreadsheets."
                  className="bg-white text-sm resize-y"
                />
                <label className="flex items-center gap-2 mt-2 text-xs text-slate-600 cursor-pointer">
                  <Checkbox
                    checked={saveBrief}
                    onCheckedChange={(v) => setSaveBrief(Boolean(v))}
                  />
                  Save this as the project brief so it's remembered next time
                </label>
              </div>
            </div>

            {/* Targeting filters */}
            <div>
              <Label className="text-sm font-semibold text-slate-800 mb-3 block">
                Targeting filters
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Industry / vertical
                  </Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {INDUSTRIES.map((ind) => (
                        <SelectItem key={ind} value={ind}>
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Region
                  </Label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {REGIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    Specific cities (optional)
                  </Label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Hyderabad, Bengaluru, Pune"
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Company size
                  </Label>
                  <Select value={companySize} onValueChange={setCompanySize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_SIZES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Buying signals / must-have criteria (optional)
                  </Label>
                  <Input
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="expanding, hiring, no HR software yet"
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3" />
                    Typical deal size (optional)
                  </Label>
                  <Input
                    value={dealSizeHint}
                    onChange={(e) => setDealSizeHint(e.target.value)}
                    placeholder="₹1L – ₹5L per year"
                  />
                </div>
              </div>
            </div>

            {/* Who to reach — seniority, department, titles */}
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-semibold text-slate-800 mb-2 block">
                  Seniority{" "}
                  <span className="font-normal text-xs text-slate-500">
                    ({seniorities.length === 0 ? "any level" : `${seniorities.length} selected`})
                  </span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {SENIORITY_TIERS.map((tier) => {
                    const active = seniorities.includes(tier.value);
                    return (
                      <button
                        key={tier.value}
                        type="button"
                        onClick={() =>
                          setSeniorities((prev) =>
                            prev.includes(tier.value)
                              ? prev.filter((v) => v !== tier.value)
                              : [...prev, tier.value]
                          )
                        }
                        className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                          active
                            ? "bg-violet-600 text-white border-violet-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-700"
                        }`}
                      >
                        {tier.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold text-slate-800 mb-2 block">
                  Department{" "}
                  <span className="font-normal text-xs text-slate-500">
                    ({departments.length === 0 ? "any" : `${departments.length} selected`})
                  </span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {DEPARTMENTS.map((dept) => {
                    const active = departments.includes(dept);
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() =>
                          setDepartments((prev) =>
                            prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
                          )
                        }
                        className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                          active
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700"
                        }`}
                      >
                        {dept}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold text-slate-800 mb-2 block">
                  Specific job titles{" "}
                  <span className="font-normal text-xs text-slate-500">
                    ({roles.length === 0 ? "optional" : `${roles.length} selected`})
                  </span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_OPTIONS.map((role) => {
                    const active = roles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                          active
                            ? "bg-violet-600 text-white border-violet-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-700"
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Company headcount */}
            <div>
              <Label className="text-sm font-semibold text-slate-800 mb-2 block">
                Company headcount{" "}
                <span className="font-normal text-xs text-slate-500">
                  ({headcountBands.length === 0 ? "any size" : `${headcountBands.length} bands`})
                </span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {HEADCOUNT_BANDS.map((band) => {
                  const active = headcountBands.includes(band);
                  return (
                    <button
                      key={band}
                      type="button"
                      onClick={() =>
                        setHeadcountBands((prev) =>
                          prev.includes(band) ? prev.filter((b) => b !== band) : [...prev, band]
                        )
                      }
                      className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                        active
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
                      }`}
                    >
                      {band}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Advanced: revenue, founded, tech, keyword include/exclude */}
            <div className="rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <span>Advanced filters</span>
                <span className="text-xs text-slate-400">{showAdvanced ? "Hide" : "Show"}</span>
              </button>

              {showAdvanced && (
                <div className="space-y-4 border-t border-slate-200 p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Annual revenue, minimum (₹)
                      </Label>
                      <Input
                        value={revenueMin}
                        onChange={(e) => setRevenueMin(e.target.value)}
                        placeholder="1 crore"
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Annual revenue, maximum (₹)
                      </Label>
                      <Input
                        value={revenueMax}
                        onChange={(e) => setRevenueMax(e.target.value)}
                        placeholder="50 crore"
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Founded after
                      </Label>
                      <Input
                        value={foundedAfter}
                        onChange={(e) => setFoundedAfter(e.target.value)}
                        placeholder="2010"
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Founded before
                      </Label>
                      <Input
                        value={foundedBefore}
                        onChange={(e) => setFoundedBefore(e.target.value)}
                        placeholder="2023"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="mb-1.5 block text-xs font-medium text-slate-600">
                      Already uses these tools (comma separated)
                    </Label>
                    <Input
                      value={technologies}
                      onChange={(e) => setTechnologies(e.target.value)}
                      placeholder="Tally, Zoho, SAP, Shopify"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="mb-1.5 block text-xs font-medium text-emerald-700">
                        Must mention
                      </Label>
                      <Input
                        value={keywordsInclude}
                        onChange={(e) => setKeywordsInclude(e.target.value)}
                        placeholder="multi-branch, ISO certified"
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-medium text-red-700">
                        Exclude if it mentions
                      </Label>
                      <Input
                        value={keywordsExclude}
                        onChange={(e) => setKeywordsExclude(e.target.value)}
                        placeholder="franchise, reseller, agency"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Count + dedupe */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <Label className="text-xs font-medium text-slate-600 mb-1.5 block">
                  Number of leads (1–30)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="h-10"
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer pb-2">
                <Checkbox
                  checked={avoidDuplicates}
                  onCheckedChange={(v) => setAvoidDuplicates(Boolean(v))}
                  className="mt-0.5"
                />
                <span>
                  Skip companies already in this project
                  {existingCompanies.length > 0 && (
                    <span className="text-slate-400">
                      {" "}
                      ({Math.min(existingCompanies.length, 120)} excluded)
                    </span>
                  )}
                </span>
              </label>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating || !projectId}
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white gap-2"
              >
                {generating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Researching prospects…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate {clampedCount} Leads
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === "results" && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-violet-600" />
                <span className="font-semibold text-slate-800 text-sm">
                  {generatedLeads.length} leads for{" "}
                  <span className="text-violet-700">{selectedProject?.name}</span> ·{" "}
                  {industry} · {region}
                </span>
              </div>
              <Badge variant="outline" className="text-xs">
                {selectedIds.size} / {generatedLeads.length} selected
              </Badge>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <Checkbox
                checked={selectedIds.size === generatedLeads.length}
                onCheckedChange={toggleAll}
                id="ai-select-all"
              />
              <label
                htmlFor="ai-select-all"
                className="text-sm text-slate-600 cursor-pointer select-none"
              >
                Select all
              </label>
            </div>

            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              {generatedLeads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => toggleSelect(lead.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedIds.has(lead.id)
                      ? "border-violet-400 bg-violet-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedIds.has(lead.id)}
                      onCheckedChange={() => toggleSelect(lead.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="font-semibold text-slate-900 flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          {lead.company_name}
                        </span>
                        <Badge
                          className={`text-xs border ${PRIORITY_COLORS[lead.priority] || PRIORITY_COLORS.medium}`}
                        >
                          {lead.priority}
                        </Badge>
                        {(() => {
                          const c = CONFIDENCE_STYLES[lead.confidence ?? "medium"];
                          return (
                            <Badge className={`text-xs border ${c.cls}`} title={c.hint}>
                              {c.label}
                            </Badge>
                          );
                        })()}
                        {lead.company_size && (
                          <Badge variant="outline" className="text-xs text-slate-600">
                            {lead.company_size}
                          </Badge>
                        )}
                        {!!lead.estimated_value && (
                          <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-200">
                            ~₹{Number(lead.estimated_value).toLocaleString("en-IN")}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600 mb-2">
                        <span className="flex items-center gap-1 truncate">
                          <User className="w-3 h-3 shrink-0" />
                          {lead.contact_name} · {lead.designation}
                        </span>
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3 shrink-0" />
                          {lead.email}
                        </span>
                        <span className="flex items-center gap-1 truncate">
                          <Phone className="w-3 h-3 shrink-0" />
                          {lead.phone}
                        </span>
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {[lead.city, lead.state, lead.country].filter(Boolean).join(", ")}
                        </span>
                        <span className="flex items-center gap-1 truncate">
                          <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                          {lead.industry}
                        </span>
                        {lead.website && (
                          <span className="flex items-center gap-1 truncate">
                            <Globe className="w-3 h-3 shrink-0" />
                            {lead.website}
                          </span>
                        )}
                      </div>

                      {lead.fit_reason && (
                        <p className="text-xs text-violet-800 bg-violet-100/60 rounded px-2 py-1 mb-1">
                          <span className="font-medium">Why they fit:</span> {lead.fit_reason}
                        </p>
                      )}
                      {lead.buying_signal && (
                        <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1 mb-1">
                          <span className="font-medium">Signal:</span> {lead.buying_signal}
                        </p>
                      )}
                      {lead.notes && (
                        <p className="text-xs text-slate-500 leading-relaxed">{lead.notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setStep("configure")}>
                ← Change filters
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedIds.size === 0}
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Import {selectedIds.size} Lead{selectedIds.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {/* ── IMPORTING ── */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center">
              <Loader className="w-7 h-7 text-violet-600 animate-spin" />
            </div>
            <p className="text-slate-700 font-medium">Adding leads to your pipeline…</p>
            <p className="text-xs text-slate-500">
              Creating {selectedIds.size} leads in {selectedProject?.name}
            </p>
          </div>
        )}

        {/* ── DONE ── */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900 mb-1">
                {importedCount} Leads Imported
              </p>
              <p className="text-sm text-slate-500">
                Added to{" "}
                <span className="font-medium text-violet-700">{selectedProject?.name}</span>,
                tagged as <span className="font-medium">AI Generated</span>
              </p>
            </div>
            <Button
              className="mt-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white"
              onClick={handleClose}
            >
              View Leads
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
