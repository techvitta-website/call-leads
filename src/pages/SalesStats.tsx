import { useState, useEffect, useMemo } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, CheckCircle2, TrendingUp, DollarSign, Loader2,
} from "lucide-react";
import { getCurrentUser, getLeads } from "@/lib/supabase";
import { formatCurrency, formatCurrencyCompact } from "@/utils/currency";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_CONFIG: Record<string, { label: string; color: string; badge: string }> = {
  new:           { label: "New",           color: "#3b82f6", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  qualified:     { label: "Qualified",     color: "#6366f1", badge: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  proposal:      { label: "Proposal",      color: "#f59e0b", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  closed_won:    { label: "Closed Won",    color: "#10b981", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  not_interested:{ label: "Not Interested",color: "#ef4444", badge: "bg-rose-50 text-rose-700 border-rose-200" },
};

const MONTHLY_GOAL = 5; // deals per month

function getLastSixMonths(): { label: string; year: number; month: number }[] {
  const now = new Date();
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ label: MONTH_LABELS[d.getMonth()], year: d.getFullYear(), month: d.getMonth() });
  }
  return result;
}

const SalesStats = () => {
  const [loading, setLoading] = useState(true);
  const [myLeads, setMyLeads] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const user = await getCurrentUser();
      if (!user) { setLoading(false); return; }

      const { data: allLeads } = await getLeads();
      const filtered = (allLeads || []).filter((l: any) => l.assigned_to === user.id);
      setMyLeads(filtered);
      setLoading(false);
    };
    fetchData();
  }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = myLeads.length;
    const closedWon = myLeads.filter((l) => l.status === "closed_won");
    const winRate = total > 0 ? ((closedWon.length / total) * 100).toFixed(1) : "0.0";
    const revenue = closedWon.reduce((s, l) => s + (l.value || 0), 0);
    return { total, closedWon: closedWon.length, winRate, revenue };
  }, [myLeads]);

  // ── Monthly Bar Chart ─────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const months = getLastSixMonths();
    return months.map(({ label, year, month }) => ({
      month: label,
      leads: myLeads.filter((l) => {
        if (!l.created_at) return false;
        const d = new Date(l.created_at);
        return d.getFullYear() === year && d.getMonth() === month;
      }).length,
    }));
  }, [myLeads]);

  // ── Status Donut ──────────────────────────────────────────────────────────
  const donutData = useMemo(() =>
    Object.entries(STATUS_CONFIG)
      .map(([key, cfg]) => ({
        name: cfg.label,
        value: myLeads.filter((l) => l.status === key).length,
        color: cfg.color,
      }))
      .filter((d) => d.value > 0),
    [myLeads]
  );

  // ── Recent Activity ───────────────────────────────────────────────────────
  const recentLeads = useMemo(() =>
    [...myLeads]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10),
    [myLeads]
  );

  // ── Goal Progress ─────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthWon = useMemo(() =>
    myLeads.filter((l) => {
      if (l.status !== "closed_won" || !l.created_at) return false;
      const d = new Date(l.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length,
    [myLeads]
  );
  const goalPct = Math.min(100, Math.round((thisMonthWon / MONTHLY_GOAL) * 100));

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar role="salesman" />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-9 h-9 animate-spin text-slate-700" />
            <span className="text-sm text-slate-500">Loading your stats…</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <DashboardSidebar role="salesman" />
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Stats</h1>
            <p className="text-slate-500 text-sm mt-0.5">Your personal performance dashboard</p>
          </div>
          <Badge className="bg-slate-900 text-white border-transparent flex items-center gap-1.5 px-3 py-1">
            <TrendingUp className="w-4 h-4" />
            {myLeads.length > 0 ? `${kpis.winRate}% win rate` : "No data yet"}
          </Badge>
        </div>

        {/* ── KPI Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard icon={<Users className="w-5 h-5" />} iconBg="bg-blue-500" label="My Leads" value={String(kpis.total)} />
          <KpiCard icon={<CheckCircle2 className="w-5 h-5" />} iconBg="bg-emerald-500" label="Closed Won" value={String(kpis.closedWon)} />
          <KpiCard icon={<TrendingUp className="w-5 h-5" />} iconBg="bg-indigo-500" label="Win Rate" value={`${kpis.winRate}%`} />
          <KpiCard icon={<DollarSign className="w-5 h-5" />} iconBg="bg-amber-500" label="Total Revenue" value={formatCurrencyCompact(kpis.revenue)} />
        </div>

        {/* ── Goal Progress ──────────────────────────────────────────────── */}
        <Card className="p-5 bg-white border border-slate-200 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Monthly Goal Progress</h3>
              <p className="text-xs text-slate-500">Closed won deals this month vs target of {MONTHLY_GOAL}</p>
            </div>
            <span className={`text-sm font-bold ${goalPct >= 100 ? "text-emerald-600" : "text-slate-700"}`}>
              {thisMonthWon} / {MONTHLY_GOAL} deals
            </span>
          </div>
          <Progress value={goalPct} className="h-3" />
          <p className="text-xs text-slate-400 mt-1.5">
            {goalPct >= 100
              ? "Goal achieved this month!"
              : `${MONTHLY_GOAL - thisMonthWon} more deal${MONTHLY_GOAL - thisMonthWon !== 1 ? "s" : ""} needed to hit your goal`}
          </p>
        </Card>

        {/* ── Charts Row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          {/* Monthly Leads Bar Chart */}
          <Card className="p-5 bg-white border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Monthly Leads</h3>
            <p className="text-xs text-slate-500 mb-4">Leads assigned to you — last 6 months</p>
            {myLeads.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#0f172a" }}
                    formatter={(v: any) => [v, "Leads"]}
                  />
                  <Bar dataKey="leads" fill="#1e293b" radius={[4, 4, 0, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Status Donut */}
          <Card className="p-5 bg-white border border-slate-200 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Status Breakdown</h3>
            <p className="text-xs text-slate-500 mb-4">My leads by current status</p>
            {donutData.length === 0 ? (
              <EmptyChart />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      labelLine={false}
                      label={({ percent }) =>
                        percent > 0.07 ? `${(percent * 100).toFixed(0)}%` : ""
                      }
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#0f172a" }}
                      formatter={(v: any, name: any) => [v, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      {d.name} <span className="text-slate-400">({d.value})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* ── Recent Activity ───────────────────────────────────────────── */}
        <Card className="p-5 bg-white border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Recent Activity</h3>
          <p className="text-xs text-slate-500 mb-4">Last 10 leads sorted by date added</p>

          {recentLeads.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No leads assigned to you yet.</p>
          ) : (
            <div className="space-y-2">
              {recentLeads.map((lead) => {
                const cfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG["new"];
                const date = lead.created_at
                  ? new Date(lead.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                  : "—";
                return (
                  <div
                    key={lead.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {lead.company_name || "Unnamed Company"}
                      </p>
                      {lead.contact_name && (
                        <p className="text-xs text-slate-400 truncate">{lead.contact_name}</p>
                      )}
                    </div>
                    <Badge className={`border text-xs shrink-0 ${cfg.badge}`}>
                      {cfg.label}
                    </Badge>
                    {lead.value > 0 && (
                      <span className="text-xs font-medium text-slate-700 shrink-0">
                        {formatCurrencyCompact(lead.value)}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 shrink-0 hidden sm:block">{date}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
}

const KpiCard = ({ icon, iconBg, label, value }: KpiCardProps) => (
  <Card className="p-4 bg-white border border-slate-200 shadow-sm">
    <div className="flex items-center gap-3 mb-3">
      <div className={`w-10 h-10 rounded-full text-white flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 truncate">{label}</div>
        <div className="text-xl font-bold text-slate-900 truncate">{value}</div>
      </div>
    </div>
  </Card>
);

const EmptyChart = () => (
  <div className="h-44 flex items-center justify-center text-slate-400 text-sm">
    No data to display yet
  </div>
);

export default SalesStats;
