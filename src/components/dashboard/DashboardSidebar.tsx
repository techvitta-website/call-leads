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
  CalendarClock,
  Layers,
  Trophy,
  XCircle,
  Building2,
  FileText,
  Receipt,
  BadgeIndianRupee,
  Package,
  ShoppingCart,
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
import { normalizeRole, ROLE_LABEL, ADMIN_ONLY, STAFF, EVERYONE, SALES_SCOPE, type Role } from "@/lib/roles";
import { getCurrentRole } from "@/lib/currentRole";

interface SidebarProps {
  role?: Role | string;
}

/**
 * The whole application, grouped.
 *
 * A super admin sees every section. Previously the owner navigation listed
 * seven items against the manager's ten, so the highest role in the system
 * had the narrowest menu and no way to reach projects, automations,
 * sequences, invoicing or purchasing at all.
 */
const SECTIONS: {
  heading: string;
  allow: Role[];
  items: { icon: any; label: string; path: string; allow?: Role[] }[];
}[] = [
  {
    heading: "Overview",
    allow: EVERYONE,
    items: [
      { icon: LayoutDashboard, label: "Executive Dashboard", path: "/owner", allow: ADMIN_ONLY },
      { icon: LayoutDashboard, label: "Dashboard", path: "/manager", allow: ["manager"] },
      { icon: LayoutDashboard, label: "Dashboard", path: "/salesman", allow: ["salesman"] },
      { icon: LineChart, label: "Analytics", path: "/analytics", allow: STAFF },
      { icon: PieChart, label: "Revenue Reports", path: "/revenue", allow: ADMIN_ONLY },
      { icon: Briefcase, label: "Regions", path: "/regions", allow: STAFF },
    ],
  },
  {
    heading: "Leads",
    allow: STAFF,
    items: [
      { icon: Target, label: "Leads", path: "/manager/leads" },
      { icon: BarChart3, label: "All Leads", path: "/leads", allow: STAFF },
      { icon: Target, label: "Leads Overview", path: "/manager/pipeline" },
      { icon: Briefcase, label: "Projects", path: "/manager/projects" },
      { icon: ListChecks, label: "Lists & Searches", path: "/manager/lead-lists" },
      { icon: CalendarClock, label: "Follow-ups", path: "/manager/follow-ups" },
    ],
  },
  {
    heading: "Outreach",
    allow: STAFF,
    items: [
      { icon: Send, label: "Sequences", path: "/manager/sequences" },
      { icon: Zap, label: "Automations", path: "/manager/automations" },
    ],
  },
  {
    heading: "Deals",
    allow: STAFF,
    items: [
      { icon: Layers, label: "Deal Stages", path: "/manager/deal-stages" },
      { icon: Trophy, label: "Won Deals", path: "/manager/won-deals" },
      { icon: XCircle, label: "Lost Deals", path: "/manager/lost-deals" },
      { icon: Building2, label: "Clients", path: "/manager/clients" },
    ],
  },
  {
    heading: "Sales & Purchasing",
    allow: STAFF,
    items: [
      { icon: FileText, label: "Quotations", path: "/manager/quotations" },
      { icon: Receipt, label: "Invoices", path: "/manager/invoices" },
      { icon: BadgeIndianRupee, label: "Receipts", path: "/manager/receipts" },
      { icon: Package, label: "Suppliers", path: "/manager/suppliers" },
      { icon: ShoppingCart, label: "Purchase Orders", path: "/manager/purchase-orders" },
    ],
  },
  {
    heading: "My Work",
    allow: SALES_SCOPE,
    items: [
      { icon: Phone, label: "My Leads", path: "/sales/my-leads" },
      { icon: Target, label: "My Pipeline", path: "/sales/pipeline" },
      { icon: CalendarClock, label: "My Follow-ups", path: "/sales/follow-ups" },
      { icon: Award, label: "Leaderboard", path: "/sales/leaderboard" },
    ],
  },
  {
    heading: "People",
    allow: STAFF,
    items: [
      { icon: Users, label: "Teams", path: "/teams", allow: STAFF },
      { icon: TrendingUp, label: "Sales Performance", path: "/manager/sales-performance" },
      { icon: Award, label: "Activity Log", path: "/manager/activity" },
      { icon: ShieldCheck, label: "Users & Access", path: "/manager/access" },
    ],
  },
];

const getSections = (role: Role) =>
  SECTIONS.filter((sec) => sec.allow.includes(role))
    .map((sec) => ({
      ...sec,
      items: sec.items.filter((it) => !it.allow || it.allow.includes(role)),
    }))
    .filter((sec) => sec.items.length > 0);

const DashboardSidebar = ({ role }: SidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [actualRole, setActualRole] = useState<Role | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Every page passes this prop as a hardcoded literal — most manager pages
  // say role="manager" regardless of who is looking. Treat the prop as a
  // first-paint hint only and trust the database, or an administrator gets
  // the manager's narrow menu on two thirds of the app.
  // Fail closed: an unrecognised role gets the narrowest menu, not the widest.
  const normalizedRole: Role = actualRole ?? normalizeRole(role) ?? "salesman";
  const sections = getSections(normalizedRole);

  // Always use normalizedRole for labels/colors
  const roleLabels = ROLE_LABEL;

  const roleColors: Record<Role, string> = {
    super_admin: "bg-emerald-700",
    owner: "bg-blue-600",
    manager: "bg-slate-900",
    salesman: "bg-orange-600",
  };

  const handleLogout = async () => {
    // Import signOut function to track logout session
    const { signOut } = await import('@/lib/supabase');
    await signOut();
    navigate("/", { replace: true });
  };

  useEffect(() => {
    let cancelled = false;

    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserEmail(data?.user?.email || "User");
      if (!data?.user) return;

      // Shared with the route guard, so this is usually already resolved.
      const role = await getCurrentRole();
      if (!cancelled) setActualRole(role);
    };

    fetchUser();
    return () => {
      cancelled = true;
    };
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

      {/* Navigation. Grouped under headings because a super admin sees every
          section at once and a flat list of 25 links is unreadable. */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, i) => (
          <div key={section.heading} className={i > 0 ? "mt-5" : undefined}>
            {!isCollapsed && sections.length > 1 && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {section.heading}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <li key={item.path}>
                    <button
                      onClick={() => {
                        navigate(item.path);
                        setIsMobileOpen(false);
                      }}
                      title={isCollapsed ? item.label : undefined}
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
          </div>
        ))}
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
