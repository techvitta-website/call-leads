import { useState, useEffect } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Search, Filter, Plus, Eye, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLeads } from "@/lib/supabase";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  qualified: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  proposal: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  negotiation: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  closed_won: "bg-green-500/10 text-green-400 border-green-500/20",
  won: "bg-green-500/10 text-green-400 border-green-500/20",
  not_interested: "bg-red-500/10 text-red-400 border-red-500/20",
  lost: "bg-red-500/10 text-red-400 border-red-500/20",
};

const initials = (name: string) =>
  (name || "?")
    .split(" ")
    .map((n) => n[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";

const Leads = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeads = async () => {
      setLoading(true);
      const { data, error } = await getLeads();
      if (!error && data) setAllLeads(data);
      setLoading(false);
    };
    fetchLeads();
  }, []);

  const filteredLeads = allLeads.filter((lead) => {
    const companyName = lead.company_name || "";
    const contactName = lead.contact_name || "";
    const email = lead.email || "";
    const matchesSearch =
      companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeLeads = allLeads.filter((l) =>
    ["new", "qualified", "proposal", "negotiation"].includes(l.status)
  );
  const totalValue = allLeads.reduce((sum, l) => sum + (l.value || 0), 0);
  const wonLeads = allLeads.filter((l) =>
    ["won", "closed_won"].includes(l.status)
  );
  const conversionRate =
    allLeads.length > 0
      ? ((wonLeads.length / allLeads.length) * 100).toFixed(1)
      : "0.0";

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <DashboardSidebar role="owner" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-white text-lg">Loading leads…</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <DashboardSidebar role="owner" />
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">All Leads</h1>
          <p className="text-slate-400">
            Manage and track all leads across your organisation
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Leads", value: allLeads.length },
            { label: "Active Leads", value: activeLeads.length },
            {
              label: "Total Value",
              value:
                totalValue >= 1_000_000
                  ? `₹${(totalValue / 1_000_000).toFixed(1)}M`
                  : `₹${(totalValue / 1_000).toFixed(0)}K`,
            },
            { label: "Conversion Rate", value: `${conversionRate}%` },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4"
            >
              <div className="text-sm text-slate-400 mb-1">{s.label}</div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by company, contact or email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10"
                >
                  <Filter className="w-4 h-4" />
                  {statusFilter === "all" ? "All Status" : statusFilter.replace("_", " ")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {["all", "new", "qualified", "proposal", "negotiation", "closed_won", "not_interested"].map(
                  (s) => (
                    <DropdownMenuItem key={s} onClick={() => setStatusFilter(s)}>
                      {s === "all" ? "All Status" : s.replace("_", " ")}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
          {filteredLeads.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              {allLeads.length === 0
                ? "No leads yet. Managers can add leads from their dashboard."
                : "No leads match your search."}
            </div>
          ) : (
            <>
              {/* Mobile */}
              <div className="flex flex-col gap-3 p-3 sm:hidden">
                {filteredLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-white/10 rounded-xl p-4 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9">
                        <AvatarFallback className="bg-blue-500/20 text-blue-400 text-xs font-medium">
                          {initials(lead.company_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {lead.company_name || "—"}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {lead.contact_name || "—"}
                        </div>
                      </div>
                      <Badge
                        className={`text-xs ${STATUS_COLORS[lead.status] || STATUS_COLORS.new}`}
                      >
                        {(lead.status || "new").replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{lead.email || "No email"}</span>
                      <span className="font-semibold text-white">
                        {lead.value ? `₹${(lead.value / 1000).toFixed(0)}K` : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full">
                  <thead className="border-b border-white/10">
                    <tr>
                      {["Company", "Contact", "Email", "Status", "Value", "Source", "Actions"].map(
                        (h) => (
                          <th
                            key={h}
                            className={`py-3 px-4 font-medium text-sm text-slate-400 ${
                              h === "Value" || h === "Actions" ? "text-right" : "text-left"
                            }`}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              <AvatarFallback className="bg-blue-500/20 text-blue-400 text-xs font-medium">
                                {initials(lead.company_name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium text-white">
                              {lead.company_name || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-white">
                          {lead.contact_name || "—"}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-400">
                          {lead.email || "—"}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            className={`text-xs ${STATUS_COLORS[lead.status] || STATUS_COLORS.new}`}
                          >
                            {(lead.status || "new").replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-semibold text-white">
                          {lead.value ? `₹${(lead.value / 1000).toFixed(0)}K` : "—"}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-400">
                          {lead.lead_source || lead.source || "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>View Details</DropdownMenuItem>
                              <DropdownMenuItem>Reassign</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Leads;
