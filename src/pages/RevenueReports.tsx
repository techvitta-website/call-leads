import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DollarSign, TrendingUp, Calendar, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { getLeads, getUsers } from "@/lib/supabase";
import { formatCurrencyCompact } from "@/utils/currency";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

const MONTHLY_TARGET = 500000; // ₹5L per month target

const RevenueReports = () => {
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [quarterlyData, setQuarterlyData] = useState<any[]>([]);
  const [topPerformers, setTopPerformers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("Last 6 Months");

  // Derived totals from loaded data
  const totalRevenue = monthlyData.reduce((s, m) => s + m.revenueRaw, 0);
  const totalTarget = monthlyData.length * MONTHLY_TARGET;
  const totalDeals = monthlyData.reduce((s, m) => s + m.deals, 0);
  const avgDealSize = totalDeals > 0 ? totalRevenue / totalDeals : 0;
  const quotaAchievement =
    totalTarget > 0
      ? Math.min(Math.round((totalRevenue / totalTarget) * 100), 999)
      : 0;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [leadsRes, usersRes] = await Promise.all([
        getLeads(),
        getUsers(),
      ]);

      const leads: any[] = leadsRes.data || [];
      const users: any[] = usersRes.data || [];

      // ── Monthly (last 6 months) ──────────────────────────
      const today = new Date();
      const monthBuckets: Record<
        string,
        { key: string; revenueRaw: number; deals: number }
      > = {};

      for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        monthBuckets[key] = {
          key,
          revenueRaw: 0,
          deals: 0,
        };
      }

      leads.forEach((lead) => {
        if (!lead.created_at) return;
        const d = new Date(lead.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!monthBuckets[key]) return;
        monthBuckets[key].deals++;
        if (lead.status === "closed_won") {
          monthBuckets[key].revenueRaw += lead.value || 0;
        }
      });

      const monthly = Object.values(monthBuckets).map((b) => {
        const [year, monthIdx] = b.key.split("-").map(Number);
        return {
          month: MONTH_NAMES[monthIdx],
          revenueRaw: b.revenueRaw,
          revenue: Math.round(b.revenueRaw / 1000), // display in K
          target: Math.round(MONTHLY_TARGET / 1000),
          deals: b.deals,
        };
      });

      // ── Quarterly ────────────────────────────────────────
      const qBuckets: Record<string, { revenue: number; target: number }> = {};
      const currentYear = today.getFullYear();
      for (let q = 1; q <= 4; q++) {
        qBuckets[`Q${q} ${currentYear}`] = { revenue: 0, target: MONTHLY_TARGET * 3 };
      }
      leads.forEach((lead) => {
        if (!lead.created_at || lead.status !== "closed_won") return;
        const d = new Date(lead.created_at);
        if (d.getFullYear() !== currentYear) return;
        const q = Math.floor(d.getMonth() / 3) + 1;
        const key = `Q${q} ${currentYear}`;
        qBuckets[key].revenue += lead.value || 0;
      });
      const quarterly = Object.entries(qBuckets).map(([quarter, v]) => ({
        quarter,
        revenue: Math.round(v.revenue / 1000),
        target: Math.round(v.target / 1000),
      }));

      // ── Top performers ────────────────────────────────────
      const performers = users
        .filter((u) => u.role === "salesman")
        .map((user) => {
          const userLeads = leads.filter((l) => l.assigned_to === user.id);
          const won = userLeads.filter((l) => l.status === "closed_won");
          const revenue = won.reduce((s, l) => s + (l.value || 0), 0);
          const quota = MONTHLY_TARGET * 6;
          return {
            id: user.id,
            name: user.name || user.full_name || user.email || "Unknown",
            revenue,
            deals: won.length,
            quota,
            achievement: quota > 0 ? Math.round((revenue / quota) * 100) : 0,
          };
        })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setMonthlyData(monthly);
      setQuarterlyData(quarterly);
      setTopPerformers(performers);
      setLoading(false);
    };

    fetchData();
  }, []);

  const handleExport = () => {
    const rows = [
      ["Name", "Revenue (₹)", "Deals Closed", "Quota (₹)", "Achievement %"],
      ...topPerformers.map((p) => [
        p.name,
        p.revenue,
        p.deals,
        p.quota,
        `${p.achievement}%`,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "revenue_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "rgba(15,23,42,0.95)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "8px",
      color: "#fff",
    },
    formatter: (value: number) => [`₹${value}K`, ""],
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <DashboardSidebar role="owner" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-white text-lg">Loading revenue data…</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <DashboardSidebar role="owner" />
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Revenue Reports
            </h1>
            <p className="text-slate-400">
              Comprehensive revenue analytics and forecasting
            </p>
          </div>
          <div className="flex gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10"
                >
                  <Calendar className="w-4 h-4" />
                  {selectedPeriod}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {["Last Month", "Last Quarter", "Last 6 Months", "Last Year"].map(
                  (p) => (
                    <DropdownMenuItem key={p} onClick={() => setSelectedPeriod(p)}>
                      {p}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={handleExport}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Total Revenue",
              value: formatCurrencyCompact(totalRevenue),
              sub: "Closed-won deals",
              icon: <DollarSign className="w-5 h-5 text-white" />,
              bg: "from-blue-600/20 to-blue-800/20 border-blue-500/20",
              iconBg: "bg-blue-600",
            },
            {
              label: "Quota Achievement",
              value: `${quotaAchievement}%`,
              sub: `Target: ${formatCurrencyCompact(totalTarget)}`,
              icon: <TrendingUp className="w-5 h-5 text-white" />,
              bg: "from-purple-600/20 to-purple-800/20 border-purple-500/20",
              iconBg: "bg-purple-600",
            },
            {
              label: "Avg Deal Size",
              value: formatCurrencyCompact(avgDealSize),
              sub: "Per closed deal",
              icon: <DollarSign className="w-5 h-5 text-white" />,
              bg: "from-amber-600/20 to-amber-800/20 border-amber-500/20",
              iconBg: "bg-amber-600",
            },
            {
              label: "Total Deals",
              value: totalDeals,
              sub: "Leads created",
              icon: <TrendingUp className="w-5 h-5 text-white" />,
              bg: "from-green-600/20 to-green-800/20 border-green-500/20",
              iconBg: "bg-green-600",
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`bg-gradient-to-br ${card.bg} backdrop-blur-sm border rounded-xl p-5`}
            >
              <div
                className={`w-10 h-10 rounded-lg ${card.iconBg} flex items-center justify-center mb-3`}
              >
                {card.icon}
              </div>
              <div className="text-sm text-slate-400 mb-1">{card.label}</div>
              <div className="text-2xl font-bold text-white">{card.value}</div>
              <div className="text-xs text-slate-500 mt-1">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Monthly */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Monthly Revenue vs Target (₹K)
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={tooltipStyle.contentStyle}
                  formatter={(v: any, name: string) => [`₹${v}K`, name]}
                />
                <Legend />
                <Bar
                  dataKey="revenue"
                  fill="#3b82f6"
                  name="Revenue"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="target"
                  fill="#8b5cf6"
                  name="Target"
                  radius={[6, 6, 0, 0]}
                  opacity={0.5}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Quarterly */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Quarterly Revenue Growth (₹K)
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={quarterlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="quarter" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={tooltipStyle.contentStyle}
                  formatter={(v: any, name: string) => [`₹${v}K`, name]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={3}
                  name="Revenue"
                  dot={{ fill: "#10b981", r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Target"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Performers */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Top Revenue Contributors
          </h2>
          {topPerformers.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">
              No salesman data yet. Assign leads to salespeople to see their performance.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-white/10">
                  <tr>
                    {["Rank", "Name", "Revenue", "Deals", "Quota", "Achievement"].map(
                      (h) => (
                        <th
                          key={h}
                          className={`py-3 px-4 font-medium text-sm text-slate-400 ${
                            h === "Rank" || h === "Name" ? "text-left" : "text-right"
                          }`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {topPerformers.map((p, i) => (
                    <tr
                      key={p.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                            i === 0
                              ? "bg-amber-500 text-white"
                              : i === 1
                              ? "bg-slate-400 text-white"
                              : i === 2
                              ? "bg-orange-700 text-white"
                              : "bg-white/10 text-slate-400"
                          }`}
                        >
                          {i + 1}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-white">
                        {p.name}
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-semibold text-white">
                        {formatCurrencyCompact(p.revenue)}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-slate-300">
                        {p.deals}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-slate-300">
                        {formatCurrencyCompact(p.quota)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`text-sm font-semibold ${
                            p.achievement >= 100
                              ? "text-green-400"
                              : p.achievement >= 50
                              ? "text-amber-400"
                              : "text-red-400"
                          }`}
                        >
                          {p.achievement}%
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

export default RevenueReports;
