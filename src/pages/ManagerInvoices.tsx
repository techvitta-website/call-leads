import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader, Receipt } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getUserRole } from "@/lib/supabase";
import { isStaff, normalizeRole } from "@/lib/roles";

const ManagerInvoices = () => {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          navigate("/", { replace: true });
          return;
        }
        const role = await getUserRole(user.id);
                // Authorization is enforced by the route's allow-list; this is a
        // second line of defence. It used to compare against 'manager'
        // exactly, which bounced owners and super admins off the page.
        if (!isStaff(normalizeRole(role))) {
          navigate("/", { replace: true });
          return;
        }
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar role="manager" />
        <main className="flex-1 flex items-center justify-center">
          <Loader className="w-10 h-10 animate-spin text-slate-600" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role="manager" />
      <main className="flex-1 p-2 sm:p-4 lg:p-8 pt-16 sm:pt-16 lg:pt-8 overflow-auto bg-slate-50">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">Invoices</h1>
            <p className="text-sm text-slate-600">Generate and track customer invoices.</p>
          </div>
        </div>

        <Card className="p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-700 mx-auto flex items-center justify-center">
            <Receipt className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Invoices module</h2>
          <p className="text-sm text-slate-600">
            Use this section to create, send, and track invoices. Coming soon—your data will appear here once invoices are added.
          </p>
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("/manager")}>
              Back to dashboard
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default ManagerInvoices;
