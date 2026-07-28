import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader, Sparkles, Bot, CheckCircle2, AlertCircle, Building2, User, Mail, Phone, MapPin, Zap, FileCheck, Link } from "lucide-react";
import { generateLeadsWithAI, AIGeneratedLead } from "@/lib/gemini";
import { createBulkLeads } from "@/lib/supabase";

interface AILeadGenerationDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onLeadsImported: () => void;
}

const INDUSTRIES = [
  "Manufacturing",
  "Retail & E-Commerce",
  "Healthcare & Pharma",
  "Logistics & Supply Chain",
  "Construction & Real Estate",
  "Agriculture & Food Processing",
  "Finance & Banking",
  "Education",
  "IT & Technology",
  "Hospitality & Tourism",
  "Automotive",
  "Textiles & Apparel",
  "Chemical & Petrochemical",
  "Energy & Utilities",
];

const REGIONS = [
  "India",
  "South India",
  "North India",
  "Maharashtra",
  "Gujarat",
  "Tamil Nadu",
  "Telangana & Andhra Pradesh",
  "Karnataka",
  "Middle East (UAE, Saudi Arabia)",
  "Southeast Asia",
  "United States",
  "United Kingdom",
  "Europe",
];

const PRODUCT_FIT_COLORS: Record<string, string> = {
  "TrustDoc.in": "bg-blue-100 text-blue-800 border-blue-200",
  ChainTrack: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Both: "bg-purple-100 text-purple-800 border-purple-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

export default function AILeadGenerationDialog({
  open,
  onClose,
  projectId,
  onLeadsImported,
}: AILeadGenerationDialogProps) {
  const [step, setStep] = useState<"configure" | "results" | "importing" | "done">("configure");

  // Configuration
  const [selectedProducts, setSelectedProducts] = useState<string[]>(["TrustDoc.in", "ChainTrack"]);
  const [industry, setIndustry] = useState("Manufacturing");
  const [region, setRegion] = useState("India");
  const [count, setCount] = useState("10");
  const [companySize, setCompanySize] = useState("SME to Enterprise");

  // Results
  const [generatedLeads, setGeneratedLeads] = useState<AIGeneratedLead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  const toggleProduct = (product: string) => {
    setSelectedProducts((prev) =>
      prev.includes(product) ? prev.filter((p) => p !== product) : [...prev, product]
    );
  };

  const handleGenerate = async () => {
    if (selectedProducts.length === 0) {
      setError("Select at least one product.");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const leads = await generateLeadsWithAI({
        products: selectedProducts,
        industry,
        region,
        count: Math.min(Math.max(parseInt(count) || 10, 3), 25),
        companySize,
      });
      setGeneratedLeads(leads);
      setSelectedIds(new Set(leads.map((l) => l.id)));
      setStep("results");
    } catch (err: any) {
      setError(err.message || "Failed to generate leads. Check your Gemini API key.");
    } finally {
      setGenerating(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === generatedLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(generatedLeads.map((l) => l.id)));
    }
  };

  const handleImport = async () => {
    const toImport = generatedLeads.filter((l) => selectedIds.has(l.id));
    if (toImport.length === 0) return;
    setStep("importing");

    try {
      const leadsPayload = toImport.map((lead) => ({
        company_name: lead.company_name,
        contact_name: lead.contact_name,
        designation: lead.designation,
        email: lead.email,
        phone: lead.phone,
        city: lead.city,
        country: lead.country,
        description: lead.notes,
        lead_notes: `Product Fit: ${lead.product_fit}\n\n${lead.notes}`,
        lead_source: "AI Generated",
        data_source: "Gemini AI",
        priority: lead.priority,
        software_category: "blockchain_erp",
        industry: lead.industry,
        status: "new",
        project_id: projectId,
      }));

      await createBulkLeads(leadsPayload as any);
      setImportedCount(toImport.length);
      setStep("done");
      onLeadsImported();
    } catch (err: any) {
      setError(err.message || "Import failed. Please try again.");
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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            AI Lead Generation
          </DialogTitle>
          <DialogDescription>
            Gemini AI generates targeted prospects for your blockchain ERP products
          </DialogDescription>
        </DialogHeader>

        {/* ── CONFIGURE STEP ── */}
        {step === "configure" && (
          <div className="space-y-6 pt-2">
            {/* Product Selection */}
            <div>
              <Label className="text-sm font-semibold text-slate-800 mb-3 block">
                Select Products to Pitch
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    id: "TrustDoc.in",
                    name: "TrustDoc.in",
                    icon: <FileCheck className="w-5 h-5 text-blue-600" />,
                    desc: "Blockchain document verification & management",
                    color: "border-blue-200 bg-blue-50",
                    activeColor: "border-blue-500 bg-blue-100 ring-2 ring-blue-300",
                  },
                  {
                    id: "ChainTrack",
                    name: "ChainTrack",
                    subtitle: "trustchainvault.com",
                    icon: <Link className="w-5 h-5 text-emerald-600" />,
                    desc: "Blockchain supply chain tracking",
                    color: "border-emerald-200 bg-emerald-50",
                    activeColor: "border-emerald-500 bg-emerald-100 ring-2 ring-emerald-300",
                  },
                ].map((product) => (
                  <button
                    key={product.id}
                    onClick={() => toggleProduct(product.id)}
                    className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                      selectedProducts.includes(product.id)
                        ? product.activeColor
                        : product.color + " opacity-70 hover:opacity-100"
                    }`}
                  >
                    {selectedProducts.includes(product.id) && (
                      <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-green-600" />
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      {product.icon}
                      <span className="font-semibold text-slate-800">{product.name}</span>
                      {product.subtitle && (
                        <span className="text-xs text-slate-500">{product.subtitle}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">{product.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Targeting */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Target Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium mb-1.5 block">Target Region</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium mb-1.5 block">Company Size</Label>
                <Select value={companySize} onValueChange={setCompanySize}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Startups & SME (10–200 employees)">
                      Startups & SME
                    </SelectItem>
                    <SelectItem value="Mid-Market (200–1000 employees)">
                      Mid-Market
                    </SelectItem>
                    <SelectItem value="Enterprise (1000+ employees)">Enterprise</SelectItem>
                    <SelectItem value="SME to Enterprise">All sizes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium mb-1.5 block">
                  Number of Leads (max 25)
                </Label>
                <Input
                  type="number"
                  min={3}
                  max={25}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating || selectedProducts.length === 0}
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white gap-2"
              >
                {generating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Generating with Gemini AI…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate {count} Leads
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── RESULTS STEP ── */}
        {step === "results" && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-violet-600" />
                <span className="font-semibold text-slate-800">
                  {generatedLeads.length} leads generated for{" "}
                  <span className="text-violet-700">{industry}</span> in{" "}
                  <span className="text-violet-700">{region}</span>
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

            {/* Select all */}
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <Checkbox
                checked={selectedIds.size === generatedLeads.length}
                onCheckedChange={toggleAll}
                id="select-all"
              />
              <label
                htmlFor="select-all"
                className="text-sm text-slate-600 cursor-pointer select-none"
              >
                Select all
              </label>
            </div>

            {/* Lead cards */}
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
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          {lead.company_name}
                        </span>
                        <Badge
                          className={`text-xs border ${PRODUCT_FIT_COLORS[lead.product_fit] || "bg-gray-100 text-gray-600 border-gray-200"}`}
                        >
                          {lead.product_fit}
                        </Badge>
                        <Badge
                          className={`text-xs ${PRIORITY_COLORS[lead.priority] || "bg-gray-100 text-gray-600"}`}
                        >
                          {lead.priority}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-slate-600 mb-2">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {lead.contact_name} · {lead.designation}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {lead.city}, {lead.country}
                        </span>
                        <span className="flex items-center gap-1 col-span-2">
                          <Zap className="w-3 h-3 text-amber-500" />
                          {lead.industry}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 leading-relaxed">{lead.notes}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-3 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("configure")}
              >
                ← Regenerate
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedIds.size === 0}
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Import {selectedIds.size} Selected Lead{selectedIds.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {/* ── IMPORTING STEP ── */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center">
              <Loader className="w-7 h-7 text-violet-600 animate-spin" />
            </div>
            <p className="text-slate-700 font-medium">Importing leads to your pipeline…</p>
            <p className="text-xs text-slate-500">Creating {selectedIds.size} leads in Supabase</p>
          </div>
        )}

        {/* ── DONE STEP ── */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900 mb-1">
                {importedCount} Leads Imported!
              </p>
              <p className="text-sm text-slate-500">
                Your blockchain ERP leads are now in the pipeline, tagged as{" "}
                <span className="font-medium text-violet-700">Blockchain ERP · AI Generated</span>
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
