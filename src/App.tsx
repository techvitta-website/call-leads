import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import OwnerDashboard from "./pages/OwnerDashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import ManagerLeads from "./pages/ManagerLeads";
import ManagerSales from "./pages/ManagerSales";
import ManagerSalesPerformance from "./pages/ManagerSalesPerformance";
import SalesmanDashboard from "./pages/SalesmanDashboard";
import ManagerTeam from "./pages/ManagerTeam";
import ManagerPipeline from "./pages/ManagerPipeline";
import ManagerPerformance from "./pages/ManagerPerformance";
import ManagerActivity from "./pages/ManagerActivity";
import ManagerReports from "./pages/ManagerReports";
import ManagerPeople from "./pages/ManagerPeople";
import ManagerLeadLists from "./pages/ManagerLeadLists";
import ManagerProjects from "./pages/ManagerProjects";
import ManagerProjectDetails from "./pages/ManagerProjectDetails";
import ManagerDealStages from "./pages/ManagerDealStages";
import ManagerWonDeals from "./pages/ManagerWonDeals";
import ManagerLostDeals from "./pages/ManagerLostDeals";
import ManagerClients from "./pages/ManagerClients";
import ManagerQuotations from "./pages/ManagerQuotations";
import ManagerInvoices from "./pages/ManagerInvoices";
import ManagerReceipts from "./pages/ManagerReceipts";
import ManagerSuppliers from "./pages/ManagerSuppliers";
import ManagerPurchaseOrders from "./pages/ManagerPurchaseOrders";
import ManagerFollowUps from "./pages/ManagerFollowUps";
import ManagerAutomations from "./pages/ManagerAutomations";
import ManagerSequences from "./pages/ManagerSequences";
import ManagerAccess from "./pages/ManagerAccess";
import SalesMyLeads from "./pages/SalesMyLeads";
import SalesFollowUps from "./pages/SalesFollowUps";
import SalesPipeline from "./pages/SalesPipeline";
import SalesLeaderboard from "./pages/SalesLeaderboard";
import SalesStats from "./pages/SalesStats";
import SalesProposals from "./pages/SalesProposals";
import Leads from "./pages/Leads";
import Teams from "./pages/Teams";
import Analytics from "./pages/Analytics";
import Regions from "./pages/Regions";
import RevenueReports from "./pages/RevenueReports";
import NotFound from "./pages/NotFound";
import WhoAmI from "./pages/WhoAmI";
import ProtectedRoute from "./components/ProtectedRoute";
import { ADMIN_ONLY, STAFF, EVERYONE, SALES_SCOPE } from "./lib/roles";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_relativeSplatPath: true }}>
        <Routes>
          {/* Public route — login/landing page */}
          <Route path="/" element={<Home />} />

          {/* All protected routes — require authentication */}
          <Route path="/dashboard" element={<ProtectedRoute allow={EVERYONE}><Dashboard /></ProtectedRoute>} />
          <Route path="/whoami" element={<ProtectedRoute allow={EVERYONE}><WhoAmI /></ProtectedRoute>} />

          {/* Owner routes */}
          <Route path="/owner" element={<ProtectedRoute allow={ADMIN_ONLY}><OwnerDashboard /></ProtectedRoute>} />
          <Route path="/owner-dashboard" element={<ProtectedRoute allow={ADMIN_ONLY}><OwnerDashboard /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute allow={STAFF}><Leads /></ProtectedRoute>} />
          <Route path="/teams" element={<ProtectedRoute allow={STAFF}><Teams /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute allow={STAFF}><Analytics /></ProtectedRoute>} />
          <Route path="/regions" element={<ProtectedRoute allow={STAFF}><Regions /></ProtectedRoute>} />
          <Route path="/revenue" element={<ProtectedRoute allow={ADMIN_ONLY}><RevenueReports /></ProtectedRoute>} />

          {/* Manager routes */}
          <Route path="/manager" element={<ProtectedRoute allow={STAFF}><ManagerDashboard /></ProtectedRoute>} />
          <Route path="/manager-dashboard" element={<ProtectedRoute allow={STAFF}><ManagerDashboard /></ProtectedRoute>} />
          <Route path="/manager/leads" element={<ProtectedRoute allow={STAFF}><ManagerLeads /></ProtectedRoute>} />
          <Route path="/manager/deal-stages" element={<ProtectedRoute allow={STAFF}><ManagerDealStages /></ProtectedRoute>} />
          <Route path="/manager/won-deals" element={<ProtectedRoute allow={STAFF}><ManagerWonDeals /></ProtectedRoute>} />
          <Route path="/manager/lost-deals" element={<ProtectedRoute allow={STAFF}><ManagerLostDeals /></ProtectedRoute>} />
          <Route path="/manager/clients" element={<ProtectedRoute allow={STAFF}><ManagerClients /></ProtectedRoute>} />
          <Route path="/manager/quotations" element={<ProtectedRoute allow={STAFF}><ManagerQuotations /></ProtectedRoute>} />
          <Route path="/manager/invoices" element={<ProtectedRoute allow={STAFF}><ManagerInvoices /></ProtectedRoute>} />
          <Route path="/manager/receipts" element={<ProtectedRoute allow={STAFF}><ManagerReceipts /></ProtectedRoute>} />
          <Route path="/manager/suppliers" element={<ProtectedRoute allow={STAFF}><ManagerSuppliers /></ProtectedRoute>} />
          <Route path="/manager/purchase-orders" element={<ProtectedRoute allow={STAFF}><ManagerPurchaseOrders /></ProtectedRoute>} />
          <Route path="/manager/follow-ups" element={<ProtectedRoute allow={STAFF}><ManagerFollowUps /></ProtectedRoute>} />
          <Route path="/manager/automations" element={<ProtectedRoute allow={STAFF}><ManagerAutomations /></ProtectedRoute>} />
          <Route path="/manager/sequences" element={<ProtectedRoute allow={STAFF}><ManagerSequences /></ProtectedRoute>} />
          {/* Users & Access. Owners reach it here too — the page gates every
              action on the caller's real role, so one route serves both. */}
          <Route path="/manager/access" element={<ProtectedRoute allow={STAFF}><ManagerAccess /></ProtectedRoute>} />
          <Route path="/access" element={<ProtectedRoute allow={ADMIN_ONLY}><ManagerAccess /></ProtectedRoute>} />
          <Route path="/manager/sales" element={<ProtectedRoute allow={STAFF}><ManagerSales /></ProtectedRoute>} />
          <Route path="/manager/sales-performance" element={<ProtectedRoute allow={STAFF}><ManagerSalesPerformance /></ProtectedRoute>} />
          <Route path="/manager/team" element={<ProtectedRoute allow={STAFF}><ManagerTeam /></ProtectedRoute>} />
          <Route path="/manager/pipeline" element={<ProtectedRoute allow={STAFF}><ManagerPipeline /></ProtectedRoute>} />
          <Route path="/manager/performance" element={<ProtectedRoute allow={STAFF}><ManagerPerformance /></ProtectedRoute>} />
          <Route path="/manager/activity" element={<ProtectedRoute allow={STAFF}><ManagerActivity /></ProtectedRoute>} />
          <Route path="/manager/reports" element={<ProtectedRoute allow={STAFF}><ManagerReports /></ProtectedRoute>} />
          <Route path="/manager/people" element={<ProtectedRoute allow={STAFF}><ManagerPeople /></ProtectedRoute>} />
          <Route path="/manager/lead-lists" element={<ProtectedRoute allow={STAFF}><ManagerLeadLists /></ProtectedRoute>} />
          <Route path="/manager/projects" element={<ProtectedRoute allow={STAFF}><ManagerProjects /></ProtectedRoute>} />
          <Route path="/manager/projects/:id" element={<ProtectedRoute allow={STAFF}><ManagerProjectDetails /></ProtectedRoute>} />

          {/* Salesman routes */}
          <Route path="/salesman" element={<ProtectedRoute allow={SALES_SCOPE}><SalesmanDashboard /></ProtectedRoute>} />
          <Route path="/salesman-dashboard" element={<ProtectedRoute allow={SALES_SCOPE}><SalesmanDashboard /></ProtectedRoute>} />
          <Route path="/sales/my-leads" element={<ProtectedRoute allow={SALES_SCOPE}><SalesMyLeads /></ProtectedRoute>} />
          <Route path="/sales/follow-ups" element={<ProtectedRoute allow={SALES_SCOPE}><SalesFollowUps /></ProtectedRoute>} />
          <Route path="/sales/pipeline" element={<ProtectedRoute allow={SALES_SCOPE}><SalesPipeline /></ProtectedRoute>} />
          <Route path="/sales/leaderboard" element={<ProtectedRoute allow={SALES_SCOPE}><SalesLeaderboard /></ProtectedRoute>} />
          <Route path="/sales/stats" element={<ProtectedRoute allow={SALES_SCOPE}><SalesStats /></ProtectedRoute>} />
          <Route path="/sales/proposals" element={<ProtectedRoute allow={SALES_SCOPE}><SalesProposals /></ProtectedRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
