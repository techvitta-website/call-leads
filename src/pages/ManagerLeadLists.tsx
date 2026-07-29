import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Filter,
  ListChecks,
  Trash2,
  ArrowRight,
  AlertCircle,
  Users,
  Briefcase,
  Clock,
} from "lucide-react";
import {
  getLeadSegments,
  deleteLeadSegment,
  getStaticLists,
  deleteStaticList,
  getProjects,
  getUsers,
  type LeadSegment,
} from "@/lib/supabase";

/** Turn a stored filter object back into something a human can read. */
function describeFilters(
  filters: Record<string, any>,
  projectName: (id: string | null) => string,
  userName: (id: string) => string
): string[] {
  const f = filters || {};
  const out: string[] = [];

  if (f.projectId) out.push(`Project: ${projectName(f.projectId)}`);
  if (f.statusFilter && f.statusFilter !== "all") out.push(`Status: ${String(f.statusFilter).replace(/_/g, " ")}`);
  if (f.assigneeFilter && f.assigneeFilter !== "all") {
    out.push(`Assignee: ${f.assigneeFilter === "unassigned" ? "unassigned" : userName(f.assigneeFilter)}`);
  }
  if (f.searchTerm) out.push(`Search: “${f.searchTerm}”`);
  if (f.sourceFilter && f.sourceFilter !== "all") out.push(`Source: ${f.sourceFilter}`);
  if (f.priorityFilter && f.priorityFilter !== "all") out.push(`Priority: ${f.priorityFilter}`);
  if (f.industryFilter && f.industryFilter !== "all") out.push(`Industry: ${String(f.industryFilter).replace(/_/g, " ")}`);
  if (f.softwareCategoryFilter && f.softwareCategoryFilter !== "all") out.push(`Category: ${f.softwareCategoryFilter}`);
  if (f.countryFilter) out.push(`Country: ${f.countryFilter}`);
  if (f.stateFilter) out.push(`State: ${f.stateFilter}`);
  if (f.cityFilter) out.push(`City: ${f.cityFilter}`);
  if (f.valueMin || f.valueMax) out.push(`Value ₹${f.valueMin || "0"}–${f.valueMax || "any"}`);
  if (f.scoreMin || f.scoreMax) out.push(`Score ${f.scoreMin || "0"}–${f.scoreMax || "100"}`);
  if (f.followupAfter || f.followupBefore) {
    out.push(`Follow-up ${f.followupAfter || "any"} → ${f.followupBefore || "any"}`);
  }
  if (f.doNotFollowupOnly) out.push("Do-not-follow-up only");
  if (f.hasTags) out.push("Has tags");
  if (f.tagQuery) out.push(`Tag: ${f.tagQuery}`);

  return out;
}

export default function ManagerLeadLists() {
  const navigate = useNavigate();
  const [segments, setSegments] = useState<LeadSegment[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [segRes, listRes, projRes, userRes] = await Promise.all([
        getLeadSegments(),
        getStaticLists(),
        getProjects(),
        getUsers(),
      ]);
      setSegments(segRes.data);
      setLists(listRes.data);
      setProjects(projRes.data || []);
      setUsers(userRes.data || []);
    } catch (e: any) {
      setError(e?.message || "Could not load lists and saved searches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const projectName = (id: string | null) =>
    !id ? "All projects" : projects.find((p) => p.id === id)?.name || "Unknown project";

  const userName = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u?.full_name || u?.name || u?.email || "someone";
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar role="manager" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-slate-500">Loading…</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role="manager" />
      <main className="flex-1 overflow-auto p-4 pt-20 sm:pt-16 lg:p-8 lg:pt-8">
        <div className="mb-6">
          <h1 className="mb-1 text-3xl font-bold text-slate-900">Lists &amp; Saved Searches</h1>
          <p className="text-slate-500">Two different things, deliberately kept apart</p>
        </div>

        {error && (
          <Alert className="mb-4 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        <Card className="mb-6 border-slate-200 bg-white p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
                <Filter className="h-4 w-4 text-blue-600" />
                Saved searches are live
              </div>
              <p className="text-sm text-slate-600">
                A saved search stores your filters, not your leads. Apply it and it
                re-runs against everything in the CRM, so leads that start matching
                appear on their own. Good for “everything urgent in Hyderabad”.
              </p>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
                <ListChecks className="h-4 w-4 text-emerald-600" />
                Lists are fixed
              </div>
              <p className="text-sm text-slate-600">
                A list is the exact leads you picked. Nothing joins or leaves unless
                you say so. Good for “the 40 companies I'm calling this week”, where
                shifting membership would be maddening.
              </p>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="segments">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="segments" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Saved searches ({segments.length})
            </TabsTrigger>
            <TabsTrigger value="lists" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              Lists ({lists.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Saved searches ─────────────────────────────────── */}
          <TabsContent value="segments" className="mt-5">
            {segments.length === 0 ? (
              <Card className="border-slate-200 bg-white p-12 text-center">
                <Filter className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="mb-1 font-medium text-slate-900">No saved searches yet</p>
                <p className="mb-5 text-sm text-slate-500">
                  Set some filters on the Leads page, then hit “Save current filters”.
                </p>
                <Button onClick={() => navigate("/manager/leads")} className="gap-1.5">
                  Go to Leads
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {segments.map((seg) => {
                  const parts = describeFilters(seg.filters, projectName, userName);
                  return (
                    <Card key={seg.id} className="border-slate-200 bg-white p-4">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">{seg.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Briefcase className="h-3 w-3" />
                              {projectName(seg.project_id ?? null)}
                            </span>
                            {seg.last_used_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                used {new Date(seg.last_used_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-red-600 hover:bg-red-50"
                          onClick={async () => {
                            if (!confirm(`Delete the saved search “${seg.name}”?`)) return;
                            await deleteLeadSegment(seg.id);
                            setSegments((prev) => prev.filter((s) => s.id !== seg.id));
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mb-3 flex flex-wrap gap-1">
                        {parts.length === 0 ? (
                          <span className="text-xs text-amber-700">
                            No filters — this matches every lead.
                          </span>
                        ) : (
                          parts.map((p) => (
                            <Badge key={p} variant="outline" className="text-xs font-normal">
                              {p}
                            </Badge>
                          ))
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5"
                        onClick={() => navigate(`/manager/leads?segment=${seg.id}`)}
                      >
                        Apply on Leads
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Static lists ───────────────────────────────────── */}
          <TabsContent value="lists" className="mt-5">
            {lists.length === 0 ? (
              <Card className="border-slate-200 bg-white p-12 text-center">
                <ListChecks className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="mb-1 font-medium text-slate-900">No lists yet</p>
                <p className="mb-5 text-sm text-slate-500">
                  Tick some leads on the Leads page and choose “Add to List”.
                </p>
                <Button onClick={() => navigate("/manager/leads")} className="gap-1.5">
                  Go to Leads
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {lists.map((list) => (
                  <Card key={list.id} className="border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">{list.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {projectName(list.project_id)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          if (!confirm(`Delete the list “${list.name}”? The leads themselves stay.`)) return;
                          await deleteStaticList(list.id);
                          setLists((prev) => prev.filter((l) => l.id !== list.id));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <Users className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">
                        {list.member_count} lead{list.member_count !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {list.description && (
                      <p className="mt-2 text-xs text-slate-500">{list.description}</p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
