import { useState, useEffect, useMemo } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Users, Target, DollarSign, TrendingUp, Loader2,
} from "lucide-react";
import { getLeads, getUsers } from "@/lib/supabase";
import { formatCurrency, formatCurrencyCompact } from "@/utils/currency";

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "rgba(15, 23, 42, 0.95)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#fff",
};

const FUNNEL_COLORS: Record<string, string> = {
  New: "#3b82f6",
  Qualified: "#8b5cf6",
  Proposal: "#f59e0b",
  "Closed Won": "#10b981",
};

const STATUS_COLORS: Record<string, string> = {
  new: "#3b82f6",
  qualified: "#8b5cf6",
  proposal: "#f59e0b",
  closed_won: "#10b981",
  not_interested: "#ef4444",
};

const SOURCE_PALETTE = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#94a3b8",
];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getLastSixMonths(): { label: string; year: number; month: number }[] {
  const now = new Date();
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ label: MONTH_LABELS[d.getMonth()], year: d.getFullYear(), month: d.getMonth() });
  }
  return result;
}

const Analytics = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [leadsResult, usersResult] = await Promise.all([getLeads(), getUsers()]);
      setLeads(leadsResult.data || []);
      setUsers(usersResult.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  // ── KPI computations ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = leads.length;
    const closedWon = leads.filter((l) => l.status === "closed_won");
    const winRate = total > 0 ? ((closedWon.length / total) * 100).toFixed(1) : "0.0";
    const wonValue = closedWon.reduce((s, l) => s + (l.value || 0), 0);
    const avgDeal = closedWon.length > 0 ? wonValue / closedWon.length : 0;
    const activeStatuses = ["new", "qualified", "proposal"];
    const pipelineValue = leads
      .filter((l) => activeStatuses.includes(l.status))
      .reduce((s, l) => s + (l.value || 0), 0);
    return { total, winRate, avgDeal, pipelineValue };
  }, [leads]);

  // ── Funnel ────────────────────────────────────────────────────────────────
  const funnelData = useMemo(() => [
    { stage: "New", count: leads.filter((l) => l.status === "new").length },
    { stage: "Qualified", count: leads.filter((l) => l.status === "qualified").length },
    { stage: "Proposal", count: leads.filter((l) => l.status === "proposal").length },
    { stage: "Closed Won", count: leads.filter((l) => l.status === "closed_won").length },
  ], [leads]);

  // ── Lead Source Breakdown ─────────────────────────────────────────────────
  const sourceData = useMemo(() => {
    const map = new Map<string, number>();
    leads.forEach((l) => {
      const src = l.lead_source?.trim() || "Unknown";
      map.set(src, (map.get(src) || 0) + 1);
    });
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top6 = sorted.slice(0, 6);
    const otherCount = sorted.slice(6).reduce((s, [, c]) => s + c, 0);
    const result = top6.map(([name, value], i) => ({ name, value, color: SOURCE_PALETTE[i] }));
    if (otherCount > 0) result.push({ name: "Other", value: otherCount, color: SOURCE_PALETTE[6] });
    return result;
  }, [leads]);

  // ── Status Distribution ───────────────────────────────────────────────────
  const statusDistData = useMemo(() => {
    const statusLabels: Record<string, string> = {
      new: "New",
      qualified: "Qualified",
      proposal: "Proposal",
      closed_won: "Closed Won",
      not_interested: "Not Interested",
    };
    return Object.entries(statusLabels).map(([key, label]) => ({
      status: label,
      count: leads.filter((l) => l.status === key).length,
      fill: STATUS_COLORS[key],
    }));
  }, [leads]);

  // ── Monthly Trend ─────────────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const months = getLastSixMonths();
    return months.map(({ label, year, month }) => ({
      month: label,
      count: leads.filter((l) => {
        if (!l.created_at) return false;
        const d = new Date(l.created_at);
        return d.getFullYear() === year && d.getMonth() === month;
      }).length,
    }));
  }, [leads]);

  // ── Salesperson Leaderboard ───────────────────────────────────────────────
  const leaderboard = useMemo(() => {
    const salesmen = users.filter((u) => u.role === "salesman");
    return salesmen
      .map((user) => {
        const myLeads = leads.filter((l) => l.assigned_to === user.id);
        const won = myLeads.filter((l) => l.status === "closed_won").length;
        const rate = myLeads.length > 0 ? ((won / myLeads.length) * 100).toFixed(0) : "0";
        return { name: user.full_name || user.email || "Unknown", assigned: myLeads.length, won, rate };
      })
      .filter((s) => s.assigned > 0)
      .sort((a, b) => b.won - a.won)
      .slice(0, 10);
  }, [leads, users]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <DashboardSidebar role="owner" />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
            <span className="text-sm">Loading analytics…</span>
          </div>
        </main>
      </div>
    );
  }

  const isEmpty = leads.length === 0;

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <DashboardSidebar role="owner" />
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Analytics</h1>
          <p className="text-slate-400">Owner dashboard — real-time insights from all leads</p>
        </div>

        {isEmpty && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-10 text-center text-slate-400 mb-8">
            No lead data found. Add leads to see analytics.
          </div>
        )}

        {/* ── KPI Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard
            icon={<Users className="w-6 h-6 text-white" />}
            iconBg="bg-blue-600"
            cardGradient="from-blue-600/20 to-blue-800/20"
            borderColor="border-blue-500/20"
            label="Total Leads"
            value={kpis.total.toLocaleString("en-IN")}
          />
          <KpiCard
            icon={<Target className="w-6 h-6 text-white" />}
            iconBg="bg-emerald-600"
            cardGradient="from-emerald-600/20 to-emerald-800/20"
            borderColor="border-emerald-500/20"
            label="Win Rate"
            value={`${kpis.winRate}%`}
          />
          <KpiCard
            icon={<DollarSign className="w-6 h-6 text-white" />}
            iconBg="bg-amber-600"
            cardGradient="from-amber-600/20 to-amber-800/20"
            borderColor="border-amber-500/20"
            label="Avg Deal Value"
            value={formatCurrencyCompact(kpis.avgDeal)}
          />
          <KpiCard
            icon={<TrendingUp className="w-6 h-6 text-white" />}
            iconBg="bg-purple-600"
            cardGradient="from-purple-600/20 to-purple-800/20"
            borderColor="border-purple-500/20"
            label="Pipeline Value"
            value={formatCurrencyCompact(kpis.pipelineValue)}
          />
        </div>

        {/* ── Row 1: Funnel + Source ───────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          {/* Lead Funnel */}
          <ChartCard title="Lead Funnel" subtitle="New → Qualified → Proposal → Closed Won">
            {isEmpty ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={funnelData} layout="vertical" margin={{ left: 16, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis dataKey="stage" type="category" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} width={80} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="count" name="Leads" radius={[0, 6, 6, 0]}>
                    {funnelData.map((entry) => (
                      <Cell key={entry.stage} fill={FUNNEL_COLORS[entry.stage] || "#3b82f6"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Lead Source Breakdown */}
          <ChartCard title="Lead Source Breakdown" subtitle="Top sources by volume">
            {isEmpty || sourceData.length === 0 ? <EmptyChart /> : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={sourceData}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={40}
                      dataKey="value"
                      labelLine={false}
                      label={({ name, percent }) =>
                        percent > 0.06 ? `${(percent * 100).toFixed(0)}%` : ""
                      }
                    >
                      {sourceData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any) => [v, "Leads"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {sourceData.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-xs text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      {s.name} <span className="text-slate-500">({s.value})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>
        </div>

        {/* ── Row 2: Status Distribution + Monthly Trend ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          {/* Status Distribution */}
          <ChartCard title="Status Distribution" subtitle="Count per lead status">
            {isEmpty ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={statusDistData} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis dataKey="status" type="category" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} width={100} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="count" name="Leads" radius={[0, 6, 6, 0]}>
                    {statusDistData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Monthly Trend */}
          <ChartCard title="Monthly Lead Trend" subtitle="Leads created — last 6 months">
            {isEmpty ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthlyTrend} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="month" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any) => [v, "Leads"]} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={{ fill: "#3b82f6", r: 4 }}
                    activeDot={{ r: 6 }}
                    name="Leads Created"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* ── Leaderboard ──────────────────────────────────────────────── */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Top Performing Salespeople</h2>
          <p className="text-xs text-slate-400 mb-4">Ranked by closed won deals</p>

          {leaderboard.length === 0 ? (
            <p className="text-slate-500 text-sm py-6 text-center">
              No salesperson data available yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-white/10">
                    <th className="pb-2 pr-4 font-medium">#</th>
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium text-right">Leads Assigned</th>
                    <th className="pb-2 pr-4 font-medium text-right">Closed Won</th>
                    <th className="pb-2 font-medium text-right">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, idx) => (
                    <tr key={row.name} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 pr-4 text-slate-500">{idx + 1}</td>
                      <td className="py-3 pr-4 text-white font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-300 text-xs font-bold">
                            {row.name[0]?.toUpperCase()}
                          </div>
                          {row.name}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-300 text-right">{row.assigned}</td>
                      <td className="py-3 pr-4 text-right">
                        <span className="text-emerald-400 font-semibold">{row.won}</span>
                      </td>
                      <td className="py-3 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          Number(row.rate) >= 50
                            ? "bg-emerald-500/20 text-emerald-300"
                            : Number(row.rate) >= 25
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-red-500/20 text-red-300"
                        }`}>
                          {row.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  iconBg: string;
  cardGradient: string;
  borderColor: string;
  label: string;
  value: string;
}

const KpiCard = ({ icon, iconBg, cardGradient, borderColor, label, value }: KpiCardProps) => (
  <div className={`bg-gradient-to-br ${cardGradient} backdrop-blur-sm border ${borderColor} rounded-xl p-5`}>
    <div className={`w-11 h-11 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>
      {icon}
    </div>
    <div className="text-xs text-slate-400 mb-1 uppercase tracking-wide">{label}</div>
    <div className="text-2xl font-bold text-white">{value}</div>
  </div>
);

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const ChartCard = ({ title, subtitle, children }: ChartCardProps) => (
  <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
    <h2 className="text-base font-semibold text-white mb-0.5">{title}</h2>
    {subtitle && <p className="text-xs text-slate-400 mb-4">{subtitle}</p>}
    {children}
  </div>
);

const EmptyChart = () => (
  <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
    No data to display
  </div>
);

export default Analytics;
