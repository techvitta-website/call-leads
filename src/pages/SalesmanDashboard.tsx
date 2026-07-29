import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader, DollarSign, Target, TrendingUp, ArrowUpRight, Activity } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import SalesmanLeadsTable from "@/components/dashboard/SalesmanLeadsTable";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, getUserById, getUserRole, getLeads, subscribeToLeads } from "@/lib/supabase";
import { formatCurrencyCompact } from "@/utils/currency";
import type { Role as UserRole } from "@/lib/roles";


const SalesmanDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          navigate('/', { replace: true });
          return;
        }

        // Use centralized role check - always gets fresh data from DB
        const userRole = await getUserRole(currentUser.id);
        
        if (!userRole || userRole !== 'salesman') {
          const roleRoutes: Record<string, string> = { 
            owner: '/owner',
            manager: '/manager',
            salesman: '/salesman'
          };
          navigate(roleRoutes[userRole as UserRole] || '/', { replace: true });
          return;
        }

        setCurrentUserId(currentUser.id);

        // Fetch leads assigned to this salesman
        const leadsRes = await getLeads({ assignedTo: currentUser.id });
        setLeads(leadsRes.data || []);

        // Subscribe to realtime changes
        const subscription = subscribeToLeads(async () => {
          const updatedLeadsRes = await getLeads({ assignedTo: currentUser.id });
          setLeads(updatedLeadsRes.data || []);
        });

        return () => {
          if (subscription && typeof subscription.unsubscribe === 'function') {
            subscription.unsubscribe();
          }
        };
      } catch (error) {
        console.error("Error loading user:", error);
        navigate('/', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  // Normalize status to match leads page logic
  const normalizeStatus = (status: string) => {
    if (status === 'negotiation') return 'proposal';
    if (status === 'won') return 'closed_won';
    if (status === 'lost') return 'not_interested';
    return status;
  };

  const totalLeads = leads.length;
  const newLeads = leads.filter(l => normalizeStatus(l.status) === 'new').length;
  const qualifiedLeads = leads.filter(l => normalizeStatus(l.status) === 'qualified').length;
  const negotiationLeads = leads.filter(l => normalizeStatus(l.status) === 'proposal').length;
  const wonLeads = leads.filter(l => normalizeStatus(l.status) === 'closed_won').length;
  const lostLeads = leads.filter(l => normalizeStatus(l.status) === 'not_interested').length;
  const totalRevenue = leads.filter(l => normalizeStatus(l.status) === 'closed_won').reduce((sum, l) => sum + (l.value || 0), 0);
  const totalPipeline = leads.filter(l => ['new', 'qualified', 'proposal'].includes(normalizeStatus(l.status))).reduce((sum, l) => sum + (l.value || 0), 0);
  const winRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <DashboardSidebar role="salesman" />
      
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <Loader className="w-12 h-12 animate-spin text-slate-900 mx-auto mb-4" />
              <p className="text-slate-700">Loading your dashboard...</p>
            </div>
          </div>
        )}

        {!loading && (
          <>
            {/* Header */}
            <div className="mb-4 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">Dashboard</h1>
              <p className="text-sm sm:text-base text-slate-600">Welcome back! Here's what's happening today.</p>
            </div>

            {/* Key Metrics - Clean Cards (now clickable) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
              <Card
                className="p-3 sm:p-6 bg-white border-slate-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer rounded-2xl"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/sales/my-leads");
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between pointer-events-none gap-2">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-600 mb-1">Total Revenue</p>
                    <p className="text-xl sm:text-3xl font-bold text-slate-900">{formatCurrencyCompact(totalRevenue)}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <ArrowUpRight className="w-4 h-4 text-green-600" />
                      <span className="text-xs sm:text-sm font-medium text-green-600">12.5%</span>
                      <span className="text-xs sm:text-sm text-slate-500">vs last month</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-green-50 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </Card>

              <Card
                className="p-3 sm:p-6 bg-white border-slate-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer rounded-2xl"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/sales/my-leads");
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between pointer-events-none gap-2">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-600 mb-1">Active Leads</p>
                    <p className="text-xl sm:text-3xl font-bold text-slate-900">{totalLeads}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <ArrowUpRight className="w-4 h-4 text-blue-600" />
                      <span className="text-xs sm:text-sm font-medium text-blue-600">8.2%</span>
                      <span className="text-xs sm:text-sm text-slate-500">vs last month</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Target className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </Card>

              <Card
                className="p-3 sm:p-6 bg-white border-slate-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer rounded-2xl"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/sales/my-leads");
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between pointer-events-none gap-2">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-600 mb-1">Win Rate</p>
                    <p className="text-xl sm:text-3xl font-bold text-slate-900">{winRate}%</p>
                    <div className="flex items-center gap-1 mt-2">
                      <ArrowUpRight className="w-4 h-4 text-purple-600" />
                      <span className="text-xs sm:text-sm font-medium text-purple-600">4.3%</span>
                      <span className="text-xs sm:text-sm text-slate-500">vs last month</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-50 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </Card>

              <Card
                className="p-3 sm:p-6 bg-white border-slate-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer rounded-2xl"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/sales/pipeline");
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between pointer-events-none gap-2">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-600 mb-1">Pipeline Value</p>
                    <p className="text-xl sm:text-3xl font-bold text-slate-900">{formatCurrencyCompact(totalPipeline)}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Activity className="w-4 h-4 text-orange-600" />
                      <span className="text-xs sm:text-sm font-medium text-orange-600">{negotiationLeads + qualifiedLeads + newLeads}</span>
                      <span className="text-xs sm:text-sm text-slate-500">active</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-50 flex items-center justify-center">
                    <Activity className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </Card>
            </div>

            {/* Pipeline Overview - Clean Segmented Design */}
            <Card className="p-4 sm:p-6 bg-white border-slate-200 shadow-sm mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Leads Overview</h2>
                  <p className="text-sm text-slate-600 mt-1">Track your deals through each stage</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs sm:text-sm text-slate-600">Total Pipeline Value</p>
                  <p className="text-xl sm:text-2xl font-semibold text-slate-900">${(totalPipeline / 1000).toFixed(0)}K</p>
                </div>
              </div>
              
              {/* Pipeline Progress Bar */}
              <div className="mb-4 sm:mb-6">
                <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                  <div className="bg-slate-400" style={{ width: `${totalLeads > 0 ? (newLeads / totalLeads) * 100 : 0}%` }}></div>
                  <div className="bg-blue-500" style={{ width: `${totalLeads > 0 ? (qualifiedLeads / totalLeads) * 100 : 0}%` }}></div>
                  <div className="bg-orange-500" style={{ width: `${totalLeads > 0 ? (negotiationLeads / totalLeads) * 100 : 0}%` }}></div>
                  <div className="bg-green-500" style={{ width: `${totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
                <div 
                  className="text-center p-3 sm:p-4 rounded-lg border bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer"
                  onClick={() => navigate('/sales/my-leads?status=new')}
                >
                  <div className="w-3 h-3 rounded-full bg-slate-400 mx-auto mb-2"></div>
                  <p className="text-xl sm:text-2xl font-semibold text-slate-900">{newLeads}</p>
                  <p className="text-xs font-medium text-slate-600 mt-1">New</p>
                  <p className="text-xs text-slate-500 mt-1">${(leads.filter(l => normalizeStatus(l.status) === 'new').reduce((sum, l) => sum + (l.value || 0), 0) / 1000).toFixed(0)}K</p>
                </div>
                <div 
                  className="text-center p-3 sm:p-4 rounded-lg border bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-all cursor-pointer"
                  onClick={() => navigate('/sales/my-leads?status=qualified')}
                >
                  <div className="w-3 h-3 rounded-full bg-blue-500 mx-auto mb-2"></div>
                  <p className="text-xl sm:text-2xl font-semibold text-slate-900">{qualifiedLeads}</p>
                  <p className="text-xs font-medium text-blue-700 mt-1">Qualified</p>
                  <p className="text-xs text-slate-500 mt-1">${(leads.filter(l => normalizeStatus(l.status) === 'qualified').reduce((sum, l) => sum + (l.value || 0), 0) / 1000).toFixed(0)}K</p>
                </div>
                <div 
                  className="text-center p-3 sm:p-4 rounded-lg border bg-orange-50 border-orange-200 hover:bg-orange-100 hover:border-orange-300 transition-all cursor-pointer"
                  onClick={() => navigate('/sales/my-leads?status=proposal')}
                >
                  <div className="w-3 h-3 rounded-full bg-orange-500 mx-auto mb-2"></div>
                  <p className="text-xl sm:text-2xl font-semibold text-slate-900">{negotiationLeads}</p>
                  <p className="text-xs font-medium text-orange-700 mt-1">Negotiation</p>
                  <p className="text-xs text-slate-500 mt-1">${(leads.filter(l => normalizeStatus(l.status) === 'proposal').reduce((sum, l) => sum + (l.value || 0), 0) / 1000).toFixed(0)}K</p>
                </div>
                <div 
                  className="text-center p-3 sm:p-4 rounded-lg border bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-300 transition-all cursor-pointer"
                  onClick={() => navigate('/sales/my-leads?status=closed_won')}
                >
                  <div className="w-3 h-3 rounded-full bg-green-500 mx-auto mb-2"></div>
                  <p className="text-xl sm:text-2xl font-semibold text-slate-900">{wonLeads}</p>
                  <p className="text-xs font-medium text-green-700 mt-1">Won</p>
                  <p className="text-xs text-slate-500 mt-1">${(leads.filter(l => normalizeStatus(l.status) === 'closed_won').reduce((sum, l) => sum + (l.value || 0), 0) / 1000).toFixed(0)}K</p>
                </div>
                <div 
                  className="text-center p-3 sm:p-4 rounded-lg border bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300 transition-all cursor-pointer"
                  onClick={() => navigate('/sales/my-leads?status=not_interested')}
                >
                  <div className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-2"></div>
                  <p className="text-xl sm:text-2xl font-semibold text-slate-900">{lostLeads}</p>
                  <p className="text-xs font-medium text-red-700 mt-1">Lost</p>
                  <p className="text-xs text-slate-500 mt-1">${(leads.filter(l => normalizeStatus(l.status) === 'not_interested').reduce((sum, l) => sum + (l.value || 0), 0) / 1000).toFixed(0)}K</p>
                </div>
              </div>
            </Card>

            {/* Recent Leads Table - clearer display */}
            <Card className="p-4 sm:p-6 bg-white border-slate-200 shadow-sm mb-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Recent Leads</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500">Company</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500">Contact</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500">Status</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.slice(0, 5).map((lead) => (
                      <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-3 text-sm text-slate-900">{lead.company_name}</td>
                        <td className="py-2 px-3 text-sm text-slate-700">{lead.contact_name}</td>
                        <td className="py-2 px-3">
                          <Badge className="capitalize border px-2 py-1 text-xs" variant="outline">{lead.status.replace('_', ' ')}</Badge>
                        </td>
                        <td className="py-2 px-3 text-right text-sm font-semibold text-slate-900">${((lead.value || 0) / 1000).toFixed(0)}K</td>
                      </tr>
                    ))}
                    {leads.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">No leads found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Full Leads Table */}
            <Card className="p-4 sm:p-6 bg-white border-slate-200 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">All Leads</h2>
                <p className="text-sm text-slate-600 mt-1">Manage and track all your assigned leads</p>
              </div>
              <SalesmanLeadsTable />
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default SalesmanDashboard;


