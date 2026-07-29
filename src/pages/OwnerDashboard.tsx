import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, TrendingUp, DollarSign, Activity, Target, Zap, ArrowUpRight, Loader } from "lucide-react";
import StatsCard from "@/components/dashboard/StatsCard";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import OwnerLeadsOverview from "@/components/dashboard/OwnerLeadsOverview";
import TeamPerformance from "@/components/dashboard/TeamPerformance";
import RevenueChart from "@/components/dashboard/RevenueChart";
import { Card } from "@/components/ui/card";
import { getLeads, getUsers, getCurrentUser, getUserRole } from "@/lib/supabase";
import { formatCurrency, formatCurrencyCompact } from "@/utils/currency";
import { isAdmin, normalizeRole, homeFor } from "@/lib/roles";



const OwnerDashboard = () => {
  const [stats, setStats] = useState([
    {
      title: "Total Revenue",
      value: "₹0",
      icon: DollarSign,
      trend: { value: 0, isPositive: true },
    },
    {
      title: "Active Leads",
      value: "0",
      icon: Target,
      trend: { value: 0, isPositive: true },
    },
    {
      title: "Team Members",
      value: "0",
      icon: Users,
      trend: { value: 0, isPositive: true },
    },
    {
      title: "Conversion Rate",
      value: "0%",
      icon: Zap,
      trend: { value: 0, isPositive: true },
      variant: "success" as const,
    },
    {
      title: "Pipeline Health",
      value: "0%",
      icon: Activity,
      trend: { value: 0, isPositive: true },
      variant: "success" as const,
    },
    {
      title: "MRR Growth",
      value: "+₹0",
      icon: TrendingUp,
      trend: { value: 0, isPositive: true },
    },
  ]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          navigate('/', { replace: true });
          return;
        }
        
        // Use centralized role check - always gets fresh data from DB
        const userRole = await getUserRole(currentUser.id);
        
        // A super admin outranks an owner, so they belong here too. Comparing
        // against 'owner' exactly would send them away from their own dashboard.
        if (!isAdmin(normalizeRole(userRole))) {
          navigate(homeFor(normalizeRole(userRole)), { replace: true });
          return;
        }

        const [leadsRes, usersRes] = await Promise.all([
          getLeads(),
          getUsers(),
        ]);

        const leads = leadsRes.data || [];
        const users = usersRes.data || [];

        // Calculate metrics
        const totalRevenue = leads.reduce((sum: number, lead: any) => 
          lead.status === 'won' ? sum + (lead.value || 0) : sum, 0
        );
        const activeLeads = leads.filter((l: any) => 
          ['new', 'qualified', 'negotiation'].includes(l.status)
        ).length;
        const teamMembers = users.filter((u: any) => String(u.role || '').toLowerCase() !== 'owner').length;
        const wonLeads = leads.filter((l: any) => l.status === 'won').length;
        const conversionRate = leads.length > 0 ? ((wonLeads / leads.length) * 100).toFixed(1) : 0;

        setStats([
          {
            title: "Total Revenue",
            value: formatCurrencyCompact(totalRevenue),
            icon: DollarSign,
            trend: { value: 23, isPositive: true },
          },
          {
            title: "Active Leads",
            value: activeLeads.toString(),
            icon: Target,
            trend: { value: 12, isPositive: true },
          },
          {
            title: "Team Members",
            value: teamMembers.toString(),
            icon: Users,
            trend: { value: 4, isPositive: true },
          },
          {
            title: "Conversion Rate",
            value: `${conversionRate}%`,
            icon: Zap,
            trend: { value: 8, isPositive: true },
            variant: "success" as const,
          },
          {
            title: "Pipeline Health",
            value: `${((activeLeads / leads.length) * 100).toFixed(0)}%`,
            icon: Activity,
            trend: { value: 5, isPositive: true },
            variant: "success" as const,
          },
          {
            title: "MRR Growth",
            value: `+${formatCurrencyCompact((totalRevenue / 12))}`,
            icon: TrendingUp,
            trend: { value: 15, isPositive: true },
          },
        ]);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [navigate]);

  // Dynamic calculations for Key Insights
  const calculateInsights = () => {
    const allLeads = (stats[1]?.value ? parseInt(stats[1].value) : 0);
    return {
      topRegion: "Based on Team Performance",
      topRevenue: "₹0",
      topRevenuePct: "0%",
      teamUtilization: "0%",
      activeTeam: "0",
    };
  };

  const insights = calculateInsights();

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <DashboardSidebar role="owner" />
      
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <Loader className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-white">Loading dashboard data...</p>
            </div>
          </div>
        )}

        {!loading && (
          <>
            {/* Hero Section */}
            <div className="mb-8 animate-fade-in">
              <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-8 text-white shadow-2xl">
                <h1 className="text-4xl font-bold mb-2">Welcome to SalesFlow Executive Hub</h1>
                <p className="text-blue-100 text-lg">
                  Real-time insights into your entire sales organization's performance
                </p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-8">
              {stats.map((stat, index) => (
                <div key={stat.title} style={{ animationDelay: `${0.1 * index}s` }}>
                  <StatsCard {...stat} />
                </div>
              ))}
            </div>

            {/* Key Insights Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card className="p-6 bg-card border-l-4 border-l-green-500">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4">TOTAL DEALS WON</h3>
                <p className="text-2xl font-bold text-foreground mb-2">{stats[0]?.value || '₹0'}</p>
                <p className="text-sm text-muted-foreground">All closed won deals in pipeline</p>
                <div className="flex items-center gap-2 mt-4 text-green-600">
                  <ArrowUpRight className="w-4 h-4" />
                  <span className="text-sm font-medium">{stats[0]?.trend?.value || 0}% growth</span>
                </div>
              </Card>
              
              <Card className="p-6 bg-card border-l-4 border-l-amber-500">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4">TEAM CONVERSION RATE</h3>
                <p className="text-2xl font-bold text-foreground mb-2">{stats[3]?.value || '0%'}</p>
                <p className="text-sm text-muted-foreground">{stats[2]?.value || '0'} active team members</p>
                <div className="flex items-center gap-2 mt-4 text-amber-600">
                  <ArrowUpRight className="w-4 h-4" />
                  <span className="text-sm font-medium">{stats[3]?.trend?.value || 0}% conversion</span>
                </div>
              </Card>
            </div>

            {/* Charts and Reports */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2">
                <RevenueChart />
              </div>
              <div>
                <TeamPerformance />
              </div>
            </div>

            {/* Leads Overview */}
            <OwnerLeadsOverview />
          </>
        )}
      </main>
    </div>
  );
};

export default OwnerDashboard;


