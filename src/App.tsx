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
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/whoami" element={<ProtectedRoute><WhoAmI /></ProtectedRoute>} />

          {/* Owner routes */}
          <Route path="/owner" element={<ProtectedRoute><OwnerDashboard /></ProtectedRoute>} />
          <Route path="/owner-dashboard" element={<ProtectedRoute><OwnerDashboard /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
          <Route path="/teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/regions" element={<ProtectedRoute><Regions /></ProtectedRoute>} />
          <Route path="/revenue" element={<ProtectedRoute><RevenueReports /></ProtectedRoute>} />

          {/* Manager routes */}
          <Route path="/manager" element={<ProtectedRoute><ManagerDashboard /></ProtectedRoute>} />
          <Route path="/manager-dashboard" element={<ProtectedRoute><ManagerDashboard /></ProtectedRoute>} />
          <Route path="/manager/leads" element={<ProtectedRoute><ManagerLeads /></ProtectedRoute>} />
          <Route path="/manager/deal-stages" element={<ProtectedRoute><ManagerDealStages /></ProtectedRoute>} />
          <Route path="/manager/won-deals" element={<ProtectedRoute><ManagerWonDeals /></ProtectedRoute>} />
          <Route path="/manager/lost-deals" element={<ProtectedRoute><ManagerLostDeals /></ProtectedRoute>} />
          <Route path="/manager/clients" element={<ProtectedRoute><ManagerClients /></ProtectedRoute>} />
          <Route path="/manager/quotations" element={<ProtectedRoute><ManagerQuotations /></ProtectedRoute>} />
          <Route path="/manager/invoices" element={<ProtectedRoute><ManagerInvoices /></ProtectedRoute>} />
          <Route path="/manager/receipts" element={<ProtectedRoute><ManagerReceipts /></ProtectedRoute>} />
          <Route path="/manager/suppliers" element={<ProtectedRoute><ManagerSuppliers /></ProtectedRoute>} />
          <Route path="/manager/purchase-orders" element={<ProtectedRoute><ManagerPurchaseOrders /></ProtectedRoute>} />
          <Route path="/manager/follow-ups" element={<ProtectedRoute><ManagerFollowUps /></ProtectedRoute>} />
          <Route path="/manager/automations" element={<ProtectedRoute><ManagerAutomations /></ProtectedRoute>} />
          <Route path="/manager/sales" element={<ProtectedRoute><ManagerSales /></ProtectedRoute>} />
          <Route path="/manager/sales-performance" element={<ProtectedRoute><ManagerSalesPerformance /></ProtectedRoute>} />
          <Route path="/manager/team" element={<ProtectedRoute><ManagerTeam /></ProtectedRoute>} />
          <Route path="/manager/pipeline" element={<ProtectedRoute><ManagerPipeline /></ProtectedRoute>} />
          <Route path="/manager/performance" element={<ProtectedRoute><ManagerPerformance /></ProtectedRoute>} />
          <Route path="/manager/activity" element={<ProtectedRoute><ManagerActivity /></ProtectedRoute>} />
          <Route path="/manager/reports" element={<ProtectedRoute><ManagerReports /></ProtectedRoute>} />
          <Route path="/manager/people" element={<ProtectedRoute><ManagerPeople /></ProtectedRoute>} />
          <Route path="/manager/lead-lists" element={<ProtectedRoute><ManagerLeadLists /></ProtectedRoute>} />
          <Route path="/manager/projects" element={<ProtectedRoute><ManagerProjects /></ProtectedRoute>} />
          <Route path="/manager/projects/:id" element={<ProtectedRoute><ManagerProjectDetails /></ProtectedRoute>} />

          {/* Salesman routes */}
          <Route path="/salesman" element={<ProtectedRoute><SalesmanDashboard /></ProtectedRoute>} />
          <Route path="/salesman-dashboard" element={<ProtectedRoute><SalesmanDashboard /></ProtectedRoute>} />
          <Route path="/sales/my-leads" element={<ProtectedRoute><SalesMyLeads /></ProtectedRoute>} />
          <Route path="/sales/follow-ups" element={<ProtectedRoute><SalesFollowUps /></ProtectedRoute>} />
          <Route path="/sales/pipeline" element={<ProtectedRoute><SalesPipeline /></ProtectedRoute>} />
          <Route path="/sales/leaderboard" element={<ProtectedRoute><SalesLeaderboard /></ProtectedRoute>} />
          <Route path="/sales/stats" element={<ProtectedRoute><SalesStats /></ProtectedRoute>} />
          <Route path="/sales/proposals" element={<ProtectedRoute><SalesProposals /></ProtectedRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
