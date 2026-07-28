import { useState, useEffect, useRef, useCallback, DragEvent } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Search, Loader2, LayoutKanban, Building2, User, DollarSign, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getLeads, updateLead, getCurrentUser } from "@/lib/supabase";
import { formatCurrencyCompact } from "@/utils/currency";
import { Lead } from "@/types/lead";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadStatus = Lead["status"];

interface Column {
  id: LeadStatus;
  label: string;
  colorScheme: ColumnColorScheme;
}

interface ColumnColorScheme {
  header: string;         // header background
  headerText: string;     // header text
  dot: string;            // status dot
  border: string;         // column border (default)
  borderDragOver: string; // column border when a card is dragged over
  columnBg: string;       // column background
  badge: string;          // count badge
  badgeText: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: Column[] = [
  {
    id: "new",
    label: "New",
    colorScheme: {
      header: "bg-blue-50",
      headerText: "text-blue-700",
      dot: "bg-blue-500",
      border: "border-blue-100",
      borderDragOver: "border-blue-400 ring-2 ring-blue-200",
      columnBg: "bg-blue-50/40",
      badge: "bg-blue-100",
      badgeText: "text-blue-700",
    },
  },
  {
    id: "qualified",
    label: "Qualified",
    colorScheme: {
      header: "bg-violet-50",
      headerText: "text-violet-700",
      dot: "bg-violet-500",
      border: "border-violet-100",
      borderDragOver: "border-violet-400 ring-2 ring-violet-200",
      columnBg: "bg-violet-50/40",
      badge: "bg-violet-100",
      badgeText: "text-violet-700",
    },
  },
  {
    id: "proposal",
    label: "Proposal",
    colorScheme: {
      header: "bg-amber-50",
      headerText: "text-amber-700",
      dot: "bg-amber-500",
      border: "border-amber-100",
      borderDragOver: "border-amber-400 ring-2 ring-amber-200",
      columnBg: "bg-amber-50/40",
      badge: "bg-amber-100",
      badgeText: "text-amber-700",
    },
  },
  {
    id: "closed_won",
    label: "Closed Won",
    colorScheme: {
      header: "bg-emerald-50",
      headerText: "text-emerald-700",
      dot: "bg-emerald-500",
      border: "border-emerald-100",
      borderDragOver: "border-emerald-400 ring-2 ring-emerald-200",
      columnBg: "bg-emerald-50/40",
      badge: "bg-emerald-100",
      badgeText: "text-emerald-700",
    },
  },
  {
    id: "not_interested",
    label: "Not Interested",
    colorScheme: {
      header: "bg-rose-50",
      headerText: "text-rose-700",
      dot: "bg-rose-400",
      border: "border-rose-100",
      borderDragOver: "border-rose-400 ring-2 ring-rose-200",
      columnBg: "bg-rose-50/40",
      badge: "bg-rose-100",
      badgeText: "text-rose-600",
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0];
  const parts = local.split(/[._\-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

function derivePriority(lead: Lead): { label: string; classes: string } {
  const score = lead.lead_score ?? 0;
  const value = lead.value ?? 0;

  if (score >= 70 || value >= 500000) {
    return { label: "High", classes: "bg-red-100 text-red-700 border-red-200" };
  }
  if (score >= 40 || value >= 100000) {
    return { label: "Med", classes: "bg-amber-100 text-amber-700 border-amber-200" };
  }
  return { label: "Low", classes: "bg-slate-100 text-slate-600 border-slate-200" };
}

function columnTotal(leads: Lead[]): number {
  return leads.reduce((sum, l) => sum + (l.value ?? 0), 0);
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm animate-pulse space-y-3">
      <div className="h-3.5 bg-slate-200 rounded w-3/4" />
      <div className="h-3 bg-slate-100 rounded w-1/2" />
      <div className="flex items-center justify-between pt-1">
        <div className="h-5 bg-slate-200 rounded w-16" />
        <div className="h-6 w-6 bg-slate-200 rounded-full" />
      </div>
    </div>
  );
}

function SkeletonColumn() {
  return (
    <div className="flex flex-col min-w-[280px] w-[280px] shrink-0">
      <div className="rounded-t-xl px-4 py-3 bg-slate-100 animate-pulse mb-0.5">
        <div className="h-4 bg-slate-200 rounded w-24" />
      </div>
      <div className="flex-1 rounded-b-xl border border-slate-100 bg-slate-50/50 p-3 space-y-3">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

interface LeadCardProps {
  lead: Lead;
  onDragStart: (e: DragEvent<HTMLDivElement>, lead: Lead) => void;
  onDragEnd: (e: DragEvent<HTMLDivElement>) => void;
  isDragging: boolean;
}

function LeadCard({ lead, onDragStart, onDragEnd, isDragging }: LeadCardProps) {
  const priority = derivePriority(lead);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onDragEnd={onDragEnd}
      className={`
        group bg-white rounded-xl border border-slate-150 shadow-sm p-4 cursor-grab
        hover:shadow-md hover:border-slate-300 transition-all duration-150 select-none
        ${isDragging ? "opacity-40 scale-[0.97] shadow-none" : "opacity-100"}
      `}
    >
      {/* Company + Contact */}
      <div className="mb-3">
        <div className="flex items-start gap-2">
          <Building2 className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-1">
            {lead.company_name}
          </p>
        </div>
        {lead.contact_name && (
          <div className="flex items-center gap-2 mt-1">
            <User className="w-3 h-3 text-slate-300 shrink-0" />
            <p className="text-xs text-slate-500 line-clamp-1">{lead.contact_name}</p>
          </div>
        )}
      </div>

      {/* Value + Priority + Assignee */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <DollarSign className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="text-xs font-bold text-slate-700 truncate">
            {formatCurrencyCompact(lead.value)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant="outline"
            className={`text-[10px] font-semibold px-1.5 py-0 h-5 border ${priority.classes}`}
          >
            {priority.label}
          </Badge>

          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-semibold">
              {getInitials(lead.assigned_to)}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: Column;
  leads: Lead[];
  dragOverColumn: LeadStatus | null;
  draggingLead: Lead | null;
  onDragStart: (e: DragEvent<HTMLDivElement>, lead: Lead) => void;
  onDragEnd: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, columnId: LeadStatus) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, columnId: LeadStatus) => void;
}

function KanbanColumn({
  column,
  leads,
  dragOverColumn,
  draggingLead,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: KanbanColumnProps) {
  const cs = column.colorScheme;
  const isOver = dragOverColumn === column.id;
  const total = columnTotal(leads);

  return (
    <div className="flex flex-col min-w-[280px] w-[280px] shrink-0 h-full">
      {/* Column Header */}
      <div className={`rounded-t-xl px-4 py-3 ${cs.header}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${cs.dot}`} />
            <span className={`text-sm font-semibold ${cs.headerText}`}>
              {column.label}
            </span>
          </div>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${cs.badge} ${cs.badgeText}`}
          >
            {leads.length}
          </span>
        </div>
        {leads.length > 0 && (
          <p className={`text-xs mt-1 ml-4 font-medium ${cs.headerText} opacity-70`}>
            {formatCurrencyCompact(total)}
          </p>
        )}
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => onDragOver(e, column.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, column.id)}
        className={`
          flex-1 rounded-b-xl border-2 transition-all duration-150 p-3 space-y-2.5
          min-h-[120px] overflow-y-auto
          ${isOver
            ? `${cs.borderDragOver} ${cs.columnBg}`
            : `${cs.border} bg-slate-50/60`
          }
        `}
      >
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-center px-3">
            <AlertCircle className="w-5 h-5 text-slate-300 mb-1.5" />
            <p className="text-xs text-slate-400">No leads in this stage</p>
            <p className="text-[10px] text-slate-300 mt-0.5">Drop a card here to move it</p>
          </div>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isDragging={draggingLead?.id === lead.id}
            />
          ))
        )}

        {/* Ghost drop target when dragging over non-empty column */}
        {isOver && draggingLead && leads.length > 0 && (
          <div className="h-16 rounded-xl border-2 border-dashed border-current opacity-30 transition-all" />
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ManagerPipeline = () => {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [draggingLead, setDraggingLead] = useState<Lead | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  // Track the source column to prevent no-op drops
  const dragSourceColumn = useRef<LeadStatus | null>(null);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          setLoading(false);
          return;
        }
        const { data } = await getLeads();
        setLeads((data as Lead[]) || []);
      } catch (err) {
        console.error("Error fetching pipeline data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ── Derived Data ───────────────────────────────────────────────────────────

  const filteredLeads = useCallback((): Lead[] => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.company_name?.toLowerCase().includes(q) ||
        l.contact_name?.toLowerCase().includes(q) ||
        l.assigned_to?.toLowerCase().includes(q)
    );
  }, [leads, search]);

  const leadsForColumn = useCallback(
    (status: LeadStatus): Lead[] =>
      filteredLeads().filter((l) => l.status === status),
    [filteredLeads]
  );

  // ── Drag & Drop Handlers ───────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, lead: Lead) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", lead.id);
      setDraggingLead(lead);
      dragSourceColumn.current = lead.status;
    },
    []
  );

  const handleDragEnd = useCallback((_e: DragEvent<HTMLDivElement>) => {
    setDraggingLead(null);
    setDragOverColumn(null);
    dragSourceColumn.current = null;
  }, []);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, columnId: LeadStatus) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(columnId);
    },
    []
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Only clear if we're leaving the column entirely (not just entering a child)
    const related = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(related)) {
      setDragOverColumn(null);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>, targetStatus: LeadStatus) => {
      e.preventDefault();
      setDragOverColumn(null);

      const leadId = e.dataTransfer.getData("text/plain");
      if (!leadId || dragSourceColumn.current === targetStatus) {
        setDraggingLead(null);
        return;
      }

      // Optimistic update
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: targetStatus } : l))
      );
      setDraggingLead(null);
      dragSourceColumn.current = null;

      // Persist
      setUpdatingLeadId(leadId);
      try {
        const { error } = await updateLead(leadId, { status: targetStatus });
        if (error) {
          // Revert on failure
          setLeads((prev) =>
            prev.map((l) =>
              l.id === leadId
                ? { ...l, status: dragSourceColumn.current ?? l.status }
                : l
            )
          );
          console.error("Failed to update lead status:", error);
        }
      } catch (err) {
        console.error("Error persisting lead move:", err);
      } finally {
        setUpdatingLeadId(null);
      }
    },
    []
  );

  // ── Summary Stats ──────────────────────────────────────────────────────────

  const totalPipelineValue = leads.reduce((s, l) => s + (l.value ?? 0), 0);
  const closedWonLeads = leads.filter((l) => l.status === "closed_won");
  const conversionRate =
    leads.length > 0
      ? Math.round((closedWonLeads.length / leads.length) * 100)
      : 0;

  // ── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar role="manager" />
        <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-hidden">
          <div className="mb-8">
            <div className="h-8 bg-slate-200 rounded w-48 animate-pulse mb-2" />
            <div className="h-4 bg-slate-100 rounded w-72 animate-pulse" />
          </div>
          <div className="flex gap-5 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <SkeletonColumn key={col.id} />
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role="manager" />

      <main className="flex-1 flex flex-col p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-hidden">
        {/* Page Header */}
        <div className="mb-6 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <LayoutKanban className="w-6 h-6 text-slate-700" />
                <h1 className="text-2xl font-bold text-slate-900">Pipeline Board</h1>
              </div>
              <p className="text-sm text-slate-500">
                Drag and drop leads to update their stage
              </p>
            </div>

            {/* Stats Pills */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                <span className="text-xs text-slate-500">Total Pipeline</span>
                <span className="text-xs font-bold text-slate-800">
                  {formatCurrencyCompact(totalPipelineValue)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                <span className="text-xs text-slate-500">Deals</span>
                <span className="text-xs font-bold text-slate-800">{leads.length}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                <span className="text-xs text-slate-500">Conversion</span>
                <span className="text-xs font-bold text-emerald-700">{conversionRate}%</span>
              </div>
              {updatingLeadId && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving…
                </div>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-4 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search company, contact, assignee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg shadow-sm
                         placeholder:text-slate-400 text-slate-700
                         focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400
                         transition"
            />
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
          <div className="flex gap-4 h-full min-h-[500px]" style={{ minWidth: "max-content" }}>
            {COLUMNS.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                leads={leadsForColumn(column.id)}
                dragOverColumn={dragOverColumn}
                draggingLead={draggingLead}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ManagerPipeline;
