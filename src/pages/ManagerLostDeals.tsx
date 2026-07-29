import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader, XCircle } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, getLeads, getUserRole } from "@/lib/supabase";
import { formatCurrency } from "@/utils/currency";
import { Button } from "@/components/ui/button";
import { isStaff, normalizeRole } from "@/lib/roles";

const ManagerLostDeals = () => {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<any[]>([]);
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

        const { data, error } = await getLeads();
        if (error) throw error;
        
        // Filter for lost deals (not_interested status)
        const lostLeads = (data || []).filter((lead: any) => 
          lead.status === 'not_interested' || lead.status === 'lost'
        );
        setLeads(lostLeads);
      } catch (error) {
        console.error("Error fetching lost deals:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const totalValue = leads.reduce((sum, lead) => sum + (lead.value || 0), 0);

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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">Lost Deals</h1>
              <p className="text-sm sm:text-base text-slate-600">
                {leads.length} lost {leads.length === 1 ? 'deal' : 'deals'} • Lost Value: {formatCurrency(totalValue)}
              </p>
            </div>
            <Button
              onClick={() => navigate('/manager/leads')}
              variant="outline"
            >
              View All Leads
            </Button>
          </div>
        </div>

        {leads.length === 0 ? (
          <Card className="p-12 text-center">
            <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <p className="text-slate-600 text-lg mb-2">No lost deals yet</p>
            <p className="text-sm text-slate-500">Deals marked as "Lost" or "Not Interested" will appear here</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {leads.map((lead) => (
              <Card key={lead.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-slate-900 text-lg">{lead.company_name}</h3>
                      <Badge className="bg-red-100 text-red-800 border-red-200">
                        Lost
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">
                      <span className="font-medium">Contact:</span> {lead.contact_name || 'N/A'}
                    </p>
                    {lead.projects?.name && (
                      <p className="text-sm text-slate-600 mb-2">
                        <span className="font-medium">Project:</span> {lead.projects.name}
                      </p>
                    )}
                    {lead.do_not_followup_reason && (
                      <p className="text-sm text-slate-600 mb-2">
                        <span className="font-medium">Reason:</span> {lead.do_not_followup_reason}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-3">
                      <div>
                        <span className="text-xs text-slate-500">Value</span>
                        <p className="text-lg font-semibold text-slate-900">
                          {formatCurrency(lead.value || 0)}
                        </p>
                      </div>
                      {lead.email && (
                        <div>
                          <span className="text-xs text-slate-500">Email</span>
                          <p className="text-sm text-slate-700">{lead.email}</p>
                        </div>
                      )}
                      {lead.phone && (
                        <div>
                          <span className="text-xs text-slate-500">Phone</span>
                          <p className="text-sm text-slate-700">{lead.phone}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ManagerLostDeals;
