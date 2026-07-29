import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader, Users, Mail, Phone, Building2, DollarSign, Calendar, Package, Filter } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, getLeads, getUserRole, getUsers, getProjects, subscribeToLeads } from "@/lib/supabase";
import { formatCurrency } from "@/utils/currency";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isStaff, normalizeRole } from "@/lib/roles";

const ManagerClients = () => {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    project: "all",
    salesperson: "all",
    minValue: "",
    maxValue: "",
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          navigate('/', { replace: true });
          return;
        }

        const userRole = await getUserRole(user.id);
                // Authorization is enforced by the route's allow-list; this is a
        // second line of defence. It used to compare against 'manager'
        // exactly, which bounced owners and super admins off the page.
        if (!isStaff(normalizeRole(userRole))) {
          navigate('/', { replace: true });
          return;
        }

        const [{ data, error }, usersRes, projectsRes] = await Promise.all([
          getLeads(),
          getUsers(),
          getProjects(),
        ]);
        if (error) throw error;
        
        // Clients are leads with closed_won status (they have paid for the service)
        const clientLeads = (data || []).filter((lead: any) => 
          lead.status === 'closed_won' || lead.status === 'won'
        );
        setClients(clientLeads);
        setUsers(usersRes.data || []);
        setProjects(projectsRes.data || []);
      } catch (error) {
        console.error("Error fetching clients:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Realtime: listen for leads changes and refresh clients
    const leadSub = subscribeToLeads(async () => {
      try {
        const [{ data, error }] = await Promise.all([getLeads()]);
        if (error) throw error;
        
        // Clients are leads with closed_won status
        const clientLeads = (data || []).filter((lead: any) => 
          lead.status === 'closed_won' || lead.status === 'won'
        );
        setClients(clientLeads);
      } catch (e) {
        console.error("Failed to refresh clients after realtime event:", e);
      }
    });

    return () => {
      try { leadSub.unsubscribe?.(); } catch {}
    };
  }, [navigate]);

  const filteredClients = clients.filter((client) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      client.company_name?.toLowerCase().includes(query) ||
      client.contact_name?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.toLowerCase().includes(query);

    const matchesProject =
      filters.project === "all" || client.project_id === filters.project;

    const matchesSalesperson =
      filters.salesperson === "all" || client.assigned_to === filters.salesperson;

    const minVal = filters.minValue ? Number(filters.minValue) : null;
    const maxVal = filters.maxValue ? Number(filters.maxValue) : null;
    const valueNum = Number(client.value || 0);
    const matchesMin = minVal === null || valueNum >= minVal;
    const matchesMax = maxVal === null || valueNum <= maxVal;

    return matchesSearch && matchesProject && matchesSalesperson && matchesMin && matchesMax;
  });

  const totalValue = filteredClients.reduce((sum, client) => sum + (client.value || 0), 0);
  const totalClients = filteredClients.length;

  // Use all projects from database, not just those with clients
  const projectOptions = projects;

  const salespersonOptions = [
    { id: "all", name: "All Salespeople" },
    ...users
      // Anyone with a real role can own a client relationship. Naming the
      // roles inline left administrators out, so their clients rendered as
      // unattributed.
      .filter((u: any) => normalizeRole(u.role) !== null)
      .map((u: any) => ({ id: u.id, name: u.full_name || u.email || "Unknown" })),
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar role="manager" />
        <main className="flex-1 flex items-center justify-center">
          <Loader className="w-12 h-12 animate-spin text-slate-600" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role="manager" />
      <main className="flex-1 p-2 sm:p-4 lg:p-8 pt-16 sm:pt-16 lg:pt-8 overflow-auto bg-slate-50">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">Clients</h1>
              <p className="text-xs sm:text-sm text-slate-600">
                {totalClients} {totalClients === 1 ? 'client' : 'clients'} • Total Value: {formatCurrency(totalValue)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Closed won deals - Focus on delivery and retention
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => navigate('/manager/leads')}
                variant="outline"
              >
                View All Leads
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card className="p-4 bg-white border-slate-200 shadow-sm mb-4">
            <div className="flex items-center gap-2 mb-3 text-slate-900">
              <Filter className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-semibold">Filters</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-none min-w-[200px] max-w-[250px]">
                <input
                  type="text"
                  placeholder="Search company, contact, email, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                />
              </div>

              <div className="flex-none min-w-[150px] max-w-[200px]">
                <Select
                  value={filters.project}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, project: value }))}
                >
                  <SelectTrigger className="h-9 bg-white border-slate-300 text-slate-900 text-sm hover:bg-slate-50 font-medium">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="all" className="text-slate-900 text-sm hover:bg-slate-100 focus:bg-slate-100 font-medium">
                      All Projects
                    </SelectItem>
                    {projectOptions.map((project) => (
                      <SelectItem
                        key={project.id}
                        value={project.id}
                        className="text-slate-900 text-sm hover:bg-slate-100 focus:bg-slate-100 font-medium"
                      >
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-none min-w-[150px] max-w-[200px]">
                <Select
                  value={filters.salesperson}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, salesperson: value }))}
                >
                  <SelectTrigger className="h-9 bg-white border-slate-300 text-slate-900 text-sm hover:bg-slate-50 font-medium">
                    <SelectValue placeholder="All Salespeople" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="all" className="text-slate-900 text-sm hover:bg-slate-100 focus:bg-slate-100 font-medium">
                      All Salespeople
                    </SelectItem>
                    {salespersonOptions.slice(1).map((sp) => (
                      <SelectItem
                        key={sp.id}
                        value={sp.id}
                        className="text-slate-900 text-sm hover:bg-slate-100 focus:bg-slate-100 font-medium"
                      >
                        {sp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-none min-w-[200px] max-w-[250px]">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Min Value"
                    value={filters.minValue}
                    onChange={(e) => setFilters((prev) => ({ ...prev, minValue: e.target.value }))}
                    className="w-full h-9 px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                  />
                  <input
                    type="number"
                    placeholder="Max Value"
                    value={filters.maxValue}
                    onChange={(e) => setFilters((prev) => ({ ...prev, maxValue: e.target.value }))}
                    className="w-full h-9 px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {clients.length === 0 ? (
          <Card className="p-12 text-center">
            <Users className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 text-lg mb-2">No clients yet</p>
            <p className="text-sm text-slate-500 mb-4">
              Clients are created automatically when a lead is marked as "Won"
            </p>
            <Button
              onClick={() => navigate('/manager/leads')}
              variant="outline"
            >
              View Leads
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 text-sm">
              <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-blue-700 mb-1 font-medium">Total Clients</p>
                    <p className="text-xl font-bold text-blue-900">{totalClients}</p>
                  </div>
                  <Users className="w-8 h-8 text-blue-600" />
                </div>
              </Card>
              <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-700 mb-1 font-medium">Total Value</p>
                    <p className="text-xl font-bold text-green-900">{formatCurrency(totalValue)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
              </Card>
              <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-purple-700 mb-1 font-medium">Avg. Deal Value</p>
                    <p className="text-xl font-bold text-purple-900">
                      {totalClients > 0 ? formatCurrency(Math.round(totalValue / totalClients)) : '₹0'}
                    </p>
                  </div>
                  <Package className="w-8 h-8 text-purple-600" />
                </div>
              </Card>
            </div>

            {/* Clients Table */}
            <Card className="border-slate-200 shadow-sm">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="font-semibold text-slate-900 text-sm">Company</TableHead>
                      <TableHead className="font-semibold text-slate-900 text-sm">Contact</TableHead>
                      <TableHead className="font-semibold text-slate-900 text-sm">Email</TableHead>
                      <TableHead className="font-semibold text-slate-900 text-sm">Phone</TableHead>
                      <TableHead className="font-semibold text-slate-900 text-sm">Project</TableHead>
                      <TableHead className="text-right font-semibold text-slate-900 text-sm">Value</TableHead>
                      <TableHead className="font-semibold text-slate-900 text-sm">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                          No clients found matching your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredClients.map((client) => (
                        <TableRow
                          key={client.id}
                          className="hover:bg-blue-50/50 cursor-pointer transition-colors border-b border-slate-100"
                          onClick={() => navigate(`/manager/leads?leadId=${client.id}`)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-blue-500" />
                              <span className="font-semibold text-slate-900">{client.company_name || 'N/A'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-slate-700 font-medium">{client.contact_name || 'N/A'}</span>
                          </TableCell>
                          <TableCell>
                            {client.email ? (
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-blue-500" />
                                <span className="text-slate-700">{client.email}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {client.phone ? (
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-blue-500" />
                                <span className="text-slate-700">{client.phone}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-slate-700 font-medium">{client.projects?.name || 'N/A'}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-bold text-green-700">
                              {formatCurrency(client.value || 0)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-green-500 text-white border-green-600 font-semibold shadow-sm">
                              Client
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default ManagerClients;
