import { useState, useEffect, useMemo } from "react";
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
import {
  MapPin,
  Search,
  Loader,
  AlertCircle,
  CheckCircle2,
  Phone,
  Globe,
  Building2,
  Info,
  Lock,
} from "lucide-react";
import { supabase, createBulkLeads } from "@/lib/supabase";

interface ProjectLike {
  id: string;
  name: string;
}

interface DiscoverLeadsDialogProps {
  open: boolean;
  onClose: () => void;
  projects: ProjectLike[];
  defaultProjectId?: string;
  salesUsers?: any[];
  onImported: (count: number) => void;
}

/** Mirrors the categories the edge function knows about. */
const CATEGORIES: Array<{ value: string; label: string; group: string }> = [
  { value: "school", label: "Schools", group: "Education" },
  { value: "college", label: "Colleges & universities", group: "Education" },
  { value: "coaching", label: "Coaching & training centres", group: "Education" },
  { value: "kindergarten", label: "Preschools & kindergartens", group: "Education" },
  { value: "clinic", label: "Clinics & doctors", group: "Healthcare" },
  { value: "dermatology", label: "Skin & cosmetic clinics", group: "Healthcare" },
  { value: "dentist", label: "Dental clinics", group: "Healthcare" },
  { value: "hospital", label: "Hospitals", group: "Healthcare" },
  { value: "pharmacy", label: "Pharmacies", group: "Healthcare" },
  { value: "veterinary", label: "Veterinary clinics", group: "Healthcare" },
  { value: "factory", label: "Factories & industrial", group: "Business" },
  { value: "company", label: "Company offices", group: "Business" },
  { value: "logistics", label: "Logistics & warehouses", group: "Business" },
  { value: "bank", label: "Banks & finance", group: "Business" },
  { value: "hotel", label: "Hotels & resorts", group: "Consumer" },
  { value: "restaurant", label: "Restaurants & cafes", group: "Consumer" },
  { value: "gym", label: "Gyms & fitness", group: "Consumer" },
  { value: "salon", label: "Salons & spas", group: "Consumer" },
  { value: "retail", label: "Shops & supermarkets", group: "Consumer" },
  { value: "automotive", label: "Car dealers & workshops", group: "Consumer" },
];

const GROUPS = ["Education", "Healthcare", "Business", "Consumer"];

export default function DiscoverLeadsDialog({
  open,
  onClose,
  projects,
  defaultProjectId,
  salesUsers = [],
  onImported,
}: DiscoverLeadsDialogProps) {
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [source, setSource] = useState<"osm" | "places">("osm");
  const [category, setCategory] = useState("school");
  const [place, setPlace] = useState("");
  const [limit, setLimit] = useState("40");
  const [requirePhone, setRequirePhone] = useState(true);
  const [assignTo, setAssignTo] = useState("unassigned");

  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    if (defaultProjectId) setProjectId(defaultProjectId);
    else if (projects.length === 1) setProjectId(projects[0].id);
  }, [open, defaultProjectId, projects]);

  const importable = useMemo(
    () => results.filter((r) => r.storable && !r.already_in_crm),
    [results],
  );

  const handleSearch = async () => {
    if (!place.trim()) {
      setError("Enter a city or area to search.");
      return;
    }
    setSearching(true);
    setError(null);
    setNotice(null);
    setResults([]);
    setSelected(new Set());

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("discover-leads", {
        body: {
          source,
          place: place.trim(),
          category,
          limit: Math.min(Math.max(Number(limit) || 40, 1), 120),
          requirePhone,
          projectId: projectId || null,
        },
      });

      if (fnErr) {
        let detail = "";
        try {
          const ctx = (fnErr as any)?.context;
          if (ctx && typeof ctx.json === "function") detail = (await ctx.json())?.error ?? "";
        } catch {
          /* fall through */
        }
        throw new Error(detail || (fnErr as any).message || "Search failed.");
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      const rows = (data as any)?.results ?? [];
      setResults(rows);
      setMeta(data);

      if ((data as any)?.unavailable) setNotice((data as any).unavailable);

      // Pre-tick everything importable — the common case is "take them all".
      setSelected(
        new Set(
          rows
            .filter((r: any) => r.storable && !r.already_in_crm)
            .map((r: any) => r.source_id),
        ),
      );

      if (rows.length === 0 && !(data as any)?.unavailable) {
        setNotice(
          `No ${CATEGORIES.find((c) => c.value === category)?.label.toLowerCase()} with contact details found there. Try a bigger city, a different category, or untick "only with a phone number".`,
        );
      }
    } catch (e: any) {
      setError(e?.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const handleImport = async () => {
    const rows = results.filter((r) => selected.has(r.source_id) && r.storable);
    if (rows.length === 0 || !projectId) return;

    setImporting(true);
    setError(null);
    try {
      const payload = rows.map((r) => ({
        company_name: r.company_name,
        contact_name: "",
        phone: r.phone || null,
        email: r.email || null,
        project_id: projectId,
        status: "new",
        value: 0,
        assigned_to: assignTo === "unassigned" ? null : assignTo,
        city: r.city || null,
        state: r.state || null,
        country: "India",
        lead_source: r.source,
        data_source: `${r.source} — ${r.category}`,
        industry: null,
        lead_notes: [
          r.address ? `Address: ${r.address}` : "",
          r.website ? `Website: ${r.website}` : "",
          r.operator ? `Operated by: ${r.operator}` : "",
          r.osm_kind ? `Type: ${r.osm_kind}` : "",
          `Source ref: ${r.source_id}`,
          "Contact person not known — ask for the decision maker when calling.",
        ]
          .filter(Boolean)
          .join("\n"),
        description: `${r.category} found via ${r.source}`,
      }));

      const res: any = await createBulkLeads(payload as any);
      if (res?.error) throw new Error(res.error.message || "Import failed");

      onImported(rows.length);
      setNotice(`Imported ${rows.length} lead${rows.length !== 1 ? "s" : ""}.`);

      // Mark them as present so a second click can't double-import.
      setResults((prev) =>
        prev.map((r) => (selected.has(r.source_id) ? { ...r, already_in_crm: true } : r)),
      );
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const reset = () => {
    setResults([]);
    setSelected(new Set());
    setMeta(null);
    setError(null);
    setNotice(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            Find local businesses
          </DialogTitle>
          <DialogDescription>
            Real businesses with real phone numbers, from public map data. Unlike
            AI generation, nothing here is invented.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search form */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
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
              <Label>What kind of business</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {GROUPS.map((g) => (
                    <div key={g}>
                      <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {g}
                      </div>
                      {CATEGORIES.filter((c) => c.group === g).map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>City or area</Label>
              <Input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="Hyderabad"
                onKeyDown={(e) => e.key === "Enter" && !searching && handleSearch()}
              />
            </div>

            <div>
              <Label>Maximum results</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <Checkbox
                checked={requirePhone}
                onCheckedChange={(v) => setRequirePhone(Boolean(v))}
              />
              Only businesses with a phone or email
            </label>

            <div className="flex items-center gap-2">
              <Label className="text-sm text-slate-600">Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as any)}>
                <SelectTrigger className="h-8 w-56 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="osm">OpenStreetMap (importable)</SelectItem>
                  <SelectItem value="places">Google Places (view only)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSearch}
              disabled={searching || !place.trim() || !projectId}
              className="ml-auto gap-1.5 bg-teal-600 hover:bg-teal-700"
            >
              {searching ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Searching…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Search
                </>
              )}
            </Button>
          </div>

          {source === "places" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Google results can be viewed but not imported.</strong>{" "}
                Google's terms permit storing only their internal place ID — not the
                name, address or phone. Use OpenStreetMap for anything you want to
                keep in the CRM.
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {notice && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {notice}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <div className="text-sm text-slate-600">
                  <strong>{meta?.count}</strong> found in{" "}
                  <span className="text-slate-500">
                    {String(meta?.place ?? "").split(",").slice(0, 2).join(", ")}
                  </span>
                  {" · "}
                  {meta?.with_phone} with a phone
                  {meta?.already_in_crm > 0 && (
                    <> · {meta.already_in_crm} already in this project</>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {selected.size} selected
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setSelected(
                        selected.size === importable.length
                          ? new Set()
                          : new Set(importable.map((r) => r.source_id)),
                      )
                    }
                  >
                    {selected.size === importable.length ? "Clear" : "Select all"}
                  </Button>
                </div>
              </div>

              <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                {results.map((r) => {
                  const blocked = !r.storable || r.already_in_crm;
                  return (
                    <div
                      key={r.source_id}
                      onClick={() => !blocked && toggle(r.source_id)}
                      className={`rounded-lg border p-3 transition-colors ${
                        blocked
                          ? "border-slate-200 bg-slate-50 opacity-70"
                          : selected.has(r.source_id)
                          ? "cursor-pointer border-teal-400 bg-teal-50"
                          : "cursor-pointer border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selected.has(r.source_id)}
                          disabled={blocked}
                          onCheckedChange={() => toggle(r.source_id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="flex items-center gap-1 font-medium text-slate-900">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              {r.company_name}
                            </span>
                            {r.already_in_crm && (
                              <Badge className="bg-slate-200 text-xs text-slate-600">
                                Already in CRM
                              </Badge>
                            )}
                            {!r.storable && (
                              <Badge className="bg-amber-100 text-xs text-amber-800">
                                View only
                              </Badge>
                            )}
                            {r.rating && (
                              <Badge variant="outline" className="text-xs">
                                ★ {r.rating} ({r.rating_count})
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                            {r.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {r.phone}
                              </span>
                            )}
                            {r.email && <span>{r.email}</span>}
                            {r.website && (
                              <span className="flex max-w-xs items-center gap-1 truncate">
                                <Globe className="h-3 w-3 shrink-0" />
                                {r.website.replace(/^https?:\/\//, "")}
                              </span>
                            )}
                            {r.address && (
                              <span className="flex max-w-md items-center gap-1 truncate">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {r.address}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-slate-500">Assign to</Label>
                  <Select value={assignTo} onValueChange={setAssignTo}>
                    <SelectTrigger className="h-8 w-48 text-sm">
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
                <Button
                  onClick={handleImport}
                  disabled={importing || selected.size === 0}
                  className="gap-1.5 bg-teal-600 hover:bg-teal-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {importing
                    ? "Importing…"
                    : `Import ${selected.size} lead${selected.size !== 1 ? "s" : ""}`}
                </Button>
              </div>

              {/* ODbL and Google both require attribution. */}
              <p className="text-center text-xs text-slate-400">{meta?.attribution}</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
