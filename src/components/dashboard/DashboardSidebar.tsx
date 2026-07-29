import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  LogOut,
  TrendingUp,
  Menu,
  X,
  ChevronDown,
  Briefcase,
  Target,
  LineChart,
  PieChart,
  Award,
  Phone,
  Zap,
  Send,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarProps {
  role: "owner" | "manager" | "salesman";
}

const getMenuItems = (role: "owner" | "manager" | "salesman") => {
  const baseItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" + role },
  ];

  const ownerItems = [
    ...baseItems,
    { icon: BarChart3, label: "All Leads", path: "/leads" },
    { icon: Users, label: "Teams", path: "/teams" },
    { icon: LineChart, label: "Analytics", path: "/analytics" },
    { icon: Briefcase, label: "Regions", path: "/regions" },
    { icon: PieChart, label: "Revenue Reports", path: "/revenue" },
    { icon: ShieldCheck, label: "Users & Access", path: "/access" },
  ];

  const managerItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/manager" },
    { icon: Briefcase, label: "Projects", path: "/manager/projects" },
    { icon: Target, label: "Leads Overview", path: "/manager/pipeline" },
    { icon: Target, label: "Leads", path: "/manager/leads" },
    { icon: TrendingUp, label: "Sales Performance", path: "/manager/sales-performance" },
    { icon: ListChecks, label: "Lists & Searches", path: "/manager/lead-lists" },
    { icon: Send, label: "Sequences", path: "/manager/sequences" },
    { icon: Zap, label: "Automations", path: "/manager/automations" },
    // This page is an activity log, not a user manager — it was mislabelled.
    { icon: Award, label: "Activity Log", path: "/manager/activity" },
    { icon: ShieldCheck, label: "Users & Access", path: "/manager/access" },
  ];

  const salesmanItems = [
    ...baseItems,
    { icon: Phone, label: "My Leads", path: "/sales/my-leads" },
    { icon: Target, label: "Leads Overview", path: "/sales/pipeline" },
  ];

  if (role === "owner") return ownerItems;
  if (role === "manager") return managerItems;
  return salesmanItems;
};

const DashboardSidebar = ({ role }: SidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedRole = String(role || 'salesman').toLowerCase() as "owner" | "manager" | "salesman";
  const menuItems = getMenuItems(normalizedRole);

  // Always use normalizedRole for labels/colors
  const roleLabels = {
    owner: "Owner",
    manager: "Manager",
    salesman: "Salesman",
  };

  const roleColors = {
    owner: "bg-blue-600",
    manager: "bg-slate-900",
    salesman: "bg-orange-600",
  };

  const roleAccentColors = {
    owner: "bg-blue-50 text-blue-700",
    manager: "bg-slate-100 text-slate-900",
    salesman: "bg-orange-50 text-orange-700",
  };

  const handleLogout = async () => {
    // Import signOut function to track logout session
    const { signOut } = await import('@/lib/supabase');
    await signOut();
    navigate("/", { replace: true });
  };

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email || "User";
      setUserEmail(email);
    };
    fetchUser();
  }, []);

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-4 flex items-center justify-between border-b border-slate-200">
        <div className={cn("flex items-center gap-3", isCollapsed && "justify-center")}>
          <div className={`w-10 h-10 rounded-xl ${roleColors[normalizedRole]} flex items-center justify-center flex-shrink-0`}>
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          {!isCollapsed && (
            <div>
              <span className="text-xl font-bold text-slate-900 block">SalesFlow</span>
              <span className="text-xs text-slate-600">{roleLabels[normalizedRole]}</span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex text-slate-600 hover:bg-slate-100"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <button
                  onClick={() => {
                    navigate(item.path);
                    setIsMobileOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm",
                    isActive
                      ? `${roleColors[normalizedRole]} text-white shadow-sm`
                      : "text-slate-700 hover:text-slate-900 hover:bg-slate-100",
                    isCollapsed && "justify-center"
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Profile */}
      <div className="p-3 border-t border-slate-200">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 transition-colors",
                isCollapsed && "justify-center"
              )}
            >
              <Avatar className="w-10 h-10">
                <AvatarFallback className={`${roleColors[normalizedRole]} text-white font-medium`}>
                  JD
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-slate-900">{userEmail}</p>
                    <p className="text-xs text-slate-600">{roleLabels[normalizedRole]}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-600" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white border-slate-200">
            <DropdownMenuSeparator className="bg-slate-200" />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 hover:bg-red-50">
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white shadow-md text-slate-900 hover:bg-slate-50 border border-slate-200"
      >
        {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-white border-r border-slate-200 h-screen sticky top-0 transition-all duration-300",
          isCollapsed ? "w-[72px]" : "w-64"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-white w-64 shadow-xl transition-transform duration-300 ease-in-out lg:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          onClick={() => setIsMobileOpen(false)}
          className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-lg lg:hidden"
        >
          <X className="w-5 h-5 text-slate-900" />
        </button>
        <div className="mt-12">
          <SidebarContent />
        </div>
      </aside>
    </>
  );
};

export default DashboardSidebar;
