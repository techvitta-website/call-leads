import { useState, useEffect } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Phone, Mail, FileText, CheckCircle2, Loader, Plus, Users, Edit, Trash2 } from "lucide-react";
import { getCurrentUser, getUsers, getLeads, getActivities, subscribeToActivities, getUsersByRole, getTeams, createTeam, supabase, createSalesmanAccount, updateUser, deleteUser, updateTeam, deleteTeam, updateTeamMembers } from "@/lib/supabase";
import { useCallback } from "react";

const iconMap: Record<string, any> = {
  call: Phone,
  email: Mail,
  note: FileText,
  deal: CheckCircle2,
};

const colorMap: Record<string, string> = {
  call: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  email: "bg-amber-500/15 text-amber-200 border-amber-500/20",
  note: "bg-slate-500/15 text-slate-200 border-slate-500/20",
  deal: "bg-green-500/15 text-green-200 border-green-500/20",
};

interface ActivityWithDetails {
  id: string;
  type: string;
  title: string;
  description?: string;
  owner: string;
  created_at: string;
  user_id: string;
}


type Salesman = {
  id: string;
  full_name: string;
  email: string;
};

type Team = {
  id: string;
  name: string;
  members: string[]; // user ids
};

// Helper to fetch team members for each team
async function fetchTeamMembers(teamId: string) {
  const { data, error } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId);
  if (error) return [];
  return (data || []).map((row: any) => row.user_id);
}

const ManagerActivity = () => {
  // Edit Team states
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamLoading, setEditTeamLoading] = useState(false);
  const [editTeamMembers, setEditTeamMembers] = useState<string[]>([]);
  const [activities, setActivities] = useState<ActivityWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<Record<string, string>>({});
  // Teams state
  const [teams, setTeams] = useState<Team[]>([]);
  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamMembers, setNewTeamMembers] = useState<string[]>([]);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [modalTeam, setModalTeam] = useState<Team | null>(null);
  const [teamLeads, setTeamLeads] = useState<Record<string, any[]>>({}); // teamId -> leads
  const [teamLeadsLoading, setTeamLeadsLoading] = useState<Record<string, boolean>>({});
  // Create Salesman states
  const [showCreateSalesmanModal, setShowCreateSalesmanModal] = useState(false);
  const [salesmanForm, setSalesmanForm] = useState({ email: "", fullName: "", password: "" });
  const [creatingSalesman, setCreatingSalesman] = useState(false);
  const [createdSalesman, setCreatedSalesman] = useState<{ email: string; password: string; fullName: string } | null>(null);
  const [currentManagerId, setCurrentManagerId] = useState<string | null>(null);
  // Edit/Delete Salesman states
  const [editingSalesman, setEditingSalesman] = useState<Salesman | null>(null);
  const [editSalesmanForm, setEditSalesmanForm] = useState({ fullName: "", email: "" });
  const [updatingSalesman, setUpdatingSalesman] = useState(false);
  const [deletingSalesmanId, setDeletingSalesmanId] = useState<string | null>(null);
  const [deletingSalesman, setDeletingSalesman] = useState(false);
  // Fetch leads for a team (by member ids)
  const fetchLeadsForTeam = useCallback(async (team: Team) => {
    setTeamLeadsLoading(prev => ({ ...prev, [team.id]: true }));
    // Get all leads assigned to any of the team members
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .in('assigned_to', team.members);
    setTeamLeads(prev => ({ ...prev, [team.id]: data || [] }));
    setTeamLeadsLoading(prev => ({ ...prev, [team.id]: false }));
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const fetchData = async () => {
      try {
        const manager = await getCurrentUser();
        if (!manager) {
          setLoading(false);
          return;
        }
        setCurrentManagerId(manager.id);


        // Get all users to map IDs to names
        const { data: users } = await getUsers();
        const userMap: Record<string, string> = {};
        (users || []).forEach((u: any) => {
          userMap[u.id] = u.full_name || u.email?.split("@")[0] || u.id;
        });
        setTeamMembers(userMap);

        // Get all salesmen for team assignment
        const { data: salesmenData } = await getUsersByRole('salesman');
        setSalesmen(salesmenData || []);


        // Fetch teams and their members
        const { data: teamsData } = await getTeams();
        const teamsWithMembers: Team[] = [];
        if (teamsData && Array.isArray(teamsData)) {
          for (const t of teamsData) {
            const members = await fetchTeamMembers(t.id);
            teamsWithMembers.push({ id: t.id, name: t.name, members });
          }
        }
        setTeams(teamsWithMembers);

        // Get all activities (manager can see team's activities)
        const { data: allActivities } = await getActivities();
        const enriched = (allActivities || [])
          .map((a: any) => ({
            ...a,
            type: (a.activity_type || a.type || "note").toLowerCase(),
            owner: userMap[a.user_id] || "Unknown",
          }))
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 50); // Last 50 activities

        setActivities(enriched);

        // Subscribe to all activities for realtime updates
        const subs: any[] = [];
        (users || []).forEach((u: any) => {
          const sub = subscribeToActivities(async () => {
            try {
              const { data: updated } = await getActivities();
              const enriched = (updated || [])
                .map((a: any) => ({
                  ...a,
                  type: (a.activity_type || a.type || "note").toLowerCase(),
                  owner: userMap[a.user_id] || "Unknown",
                }))
                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 50);
              setActivities(enriched);
            } catch (e) {
              console.error("Failed to refresh activities", e);
            }
          });
          subs.push(sub);
        });

        cleanup = () => {
          subs.forEach(sub => {
            try { sub.unsubscribe?.(); } catch {}
          });
        };
      } catch (error) {
        console.error("Error loading manager activities:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    return () => { cleanup?.(); };
  }, []);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const handleCreateSalesman = async () => {
    if (!salesmanForm.email || !salesmanForm.fullName || !salesmanForm.password) {
      alert("Please fill in all fields");
      return;
    }
    if (salesmanForm.password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }
    setCreatingSalesman(true);
    try {
      const result = await createSalesmanAccount(
        salesmanForm.email,
        salesmanForm.password,
        salesmanForm.fullName,
        currentManagerId || undefined
      );
      if (result.error) {
        alert(`Failed to create salesman account: ${result.error.message || 'Unknown error'}`);
      } else {
        setCreatedSalesman({
          email: salesmanForm.email,
          password: salesmanForm.password,
          fullName: salesmanForm.fullName,
        });
        // Refresh salesmen list
        const { data: salesmenData } = await getUsersByRole('salesman');
        setSalesmen(salesmenData || []);
        setSalesmanForm({ email: "", fullName: "", password: "" });
      }
    } catch (error: any) {
      alert(`Failed to create salesman account: ${error.message || 'Unknown error'}`);
    } finally {
      setCreatingSalesman(false);
    }
  };

  const handleUpdateSalesman = async () => {
    if (!editingSalesman) return;
    if (!editSalesmanForm.fullName || !editSalesmanForm.email) {
      alert("Please fill in all fields");
      return;
    }
    setUpdatingSalesman(true);
    try {
      const { error } = await updateUser(editingSalesman.id, {
        full_name: editSalesmanForm.fullName,
        email: editSalesmanForm.email,
      });
      if (error) {
        alert(`Failed to update salesman: ${error.message || 'Unknown error'}`);
      } else {
        // Refresh salesmen list
        const { data: salesmenData } = await getUsersByRole('salesman');
        setSalesmen(salesmenData || []);
        setEditingSalesman(null);
        setEditSalesmanForm({ fullName: "", email: "" });
        alert("Salesman updated successfully");
      }
    } catch (error: any) {
      alert(`Failed to update salesman: ${error.message || 'Unknown error'}`);
    } finally {
      setUpdatingSalesman(false);
    }
  };

  const handleDeleteSalesman = async () => {
    if (!deletingSalesmanId || deletingSalesman) return;
    
    const salesmanToDelete = deletingSalesmanId;
    setDeletingSalesman(true);
    
    try {
      // Delete from server first
      const { error } = await deleteUser(salesmanToDelete);
      
      if (error) {
        console.error('Delete user error:', error);
        const errorMessage = error.message || error.code || 'Unknown error';
        alert(`Failed to delete salesman: ${errorMessage}\n\nThis might be due to RLS (Row Level Security) policies. Please ensure managers have permission to delete users.`);
        setDeletingSalesmanId(null);
        setDeletingSalesman(false);
        return;
      }
      
      // Close modal immediately
      setDeletingSalesmanId(null);
      
      // Remove from UI immediately (optimistic update)
      setSalesmen(prev => {
        const filtered = prev.filter(s => s.id !== salesmanToDelete);
        return filtered;
      });
      
      // Wait a bit for server to process, then refresh to ensure consistency
      setTimeout(async () => {
        try {
          const { data: salesmenData, error: refreshError } = await getUsersByRole('salesman');
          if (refreshError) {
            console.error('Error refreshing salesmen list:', refreshError);
            return;
          }
          if (salesmenData) {
            // Verify the deleted salesman is not in the list
            const stillExists = salesmenData.some(s => s.id === salesmanToDelete);
            if (!stillExists) {
              setSalesmen(salesmenData);
            } else {
              // If still exists, remove it manually
              setSalesmen(salesmenData.filter(s => s.id !== salesmanToDelete));
            }
          }
        } catch (refreshError) {
          console.error('Error refreshing salesmen list:', refreshError);
        }
      }, 500);
      
    } catch (error: any) {
      console.error('Delete salesman exception:', error);
      alert(`Failed to delete salesman: ${error.message || 'Unknown error'}\n\nPlease check the browser console for more details.`);
      setDeletingSalesmanId(null);
    } finally {
      setDeletingSalesman(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role="manager" />
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Activity Log</h1>
            <p className="text-slate-500">Team-wide calls, emails, notes and deals</p>
          </div>
          <div className="text-slate-500 flex items-center gap-2"><Clock className="w-4 h-4" /> Live</div>
        </div>

        {/* Sales Team Section */}
        <Card className="mb-8 p-6 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Sales Team</h2>
              <p className="text-slate-600 mt-1">{salesmen.length} salespeople</p>
            </div>
            <Button 
              onClick={() => {
                setShowCreateSalesmanModal(true);
                setCreatedSalesman(null);
              }} 
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Salesman
            </Button>
          </div>
          {salesmen.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" key={`salesmen-${salesmen.length}`}>
              {salesmen.map((salesman) => (
                <div
                  key={`salesman-${salesman.id}`}
                  className="p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-blue-600 text-white">
                        {(salesman.full_name?.split(" ")[0][0] || "").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-900 truncate">
                        {salesman.full_name || 'Unknown'}
                      </h3>
                      <p className="text-sm text-slate-600 truncate">{salesman.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingSalesman(salesman);
                          setEditSalesmanForm({ fullName: salesman.full_name || "", email: salesman.email || "" });
                        }}
                        className="h-8 w-8 p-0 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingSalesmanId(salesman.id)}
                        className="h-8 w-8 p-0 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>

                  {/* Auto-assignment eligibility */}
                  <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-700">Receives new leads</div>
                      <div className="text-xs text-slate-500">
                        {salesman.receives_leads === false
                          ? "Skipped by auto-assignment"
                          : "Eligible for auto-assignment"}
                      </div>
                    </div>
                    <Switch
                      checked={salesman.receives_leads !== false}
                      onCheckedChange={async (next) => {
                        // Optimistic: flip locally, roll back if the write fails.
                        setSalesmen((prev: any[]) =>
                          prev.map((s) => (s.id === salesman.id ? { ...s, receives_leads: next } : s))
                        );
                        const { error } = await supabase
                          .from("users")
                          .update({ receives_leads: next })
                          .eq("id", salesman.id);
                        if (error) {
                          setSalesmen((prev: any[]) =>
                            prev.map((s) => (s.id === salesman.id ? { ...s, receives_leads: !next } : s))
                          );
                          alert(`Could not update: ${error.message}`);
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-900 font-medium mb-1">No salespeople yet</p>
              <p className="text-sm text-slate-600 mb-4">Add salespeople to your team</p>
              <Button 
                onClick={() => {
                  setShowCreateSalesmanModal(true);
                  setCreatedSalesman(null);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Salesman
              </Button>
            </div>
          )}
        </Card>

        {/* Teams Section */}
        <Card className="mb-8 p-6 bg-white border border-slate-200 shadow-sm rounded-xl">
          <h2 className="text-2xl font-bold mb-4 text-slate-900">Teams</h2>
          {successMsg && <div className="mb-2 text-green-600 font-medium">{successMsg}</div>}
          {errorMsg && <div className="mb-2 text-red-600 font-medium">{errorMsg}</div>}
          <Dialog open={!!modalTeam} onOpenChange={open => { if (!open) setModalTeam(null); }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {teams.length === 0 ? (
                <div className="text-slate-500">No teams yet. Create one below.</div>
              ) : (
                teams.map(team => (
                  <div key={team.id} className="relative group">
                    <div className="absolute top-2 right-2 flex gap-2 z-20">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs bg-white hover:bg-slate-50 shadow-sm"
                        onClick={e => {
                          e.stopPropagation();
                          e.preventDefault();
                          setEditingTeamId(team.id);
                          setEditTeamName(team.name);
                          setEditTeamMembers([...team.members]);
                        }}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="text-xs bg-red-600 hover:bg-red-700 text-white border-red-600 shadow-sm"
                        onClick={async e => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (window.confirm(`Are you sure you want to delete team '${team.name}'?`)) {
                            setEditTeamLoading(true);
                            setSuccessMsg("");
                            setErrorMsg("");
                            try {
                              console.log('Attempting to delete team:', team.id, team.name);
                              const res = await deleteTeam(team.id);
                              console.log('Delete team response:', res);
                              
                              if (res.success) {
                                // Verify deletion by re-fetching teams from database
                                const { data: teamsData } = await getTeams();
                                const teamsWithMembers: Team[] = [];
                                if (teamsData && Array.isArray(teamsData)) {
                                  for (const t of teamsData) {
                                    const members = await fetchTeamMembers(t.id);
                                    teamsWithMembers.push({ id: t.id, name: t.name, members });
                                  }
                                }
                                // Update state with fresh data from database
                                setTeams(teamsWithMembers);
                                
                                // Verify the team was actually deleted
                                const deletedTeamStillExists = teamsWithMembers.some(t => t.id === team.id);
                                if (deletedTeamStillExists) {
                                  console.warn('Team deletion reported success but team still exists in database');
                                  setErrorMsg(`Warning: Team deletion may have failed. Please refresh the page to verify.`);
                                  setTimeout(() => setErrorMsg(""), 8000);
                                } else {
                                  setSuccessMsg(`Team '${team.name}' deleted successfully.`);
                                  setErrorMsg("");
                                  setTimeout(() => setSuccessMsg(""), 3000);
                                }
                              } else {
                                let errorDetails = "Unknown error";
                                const errorCode = (res.error as any)?.code || '';
                                if (typeof res.error === 'object' && res.error !== null) {
                                  errorDetails = res.error.message || res.error.details || (res.error as any)?.hint || JSON.stringify(res.error);
                                } else if (typeof res.error === 'string') {
                                  errorDetails = res.error;
                                }
                                console.error('Delete team error:', res.error);
                                
                                let errorMessage = `Failed to delete team: ${errorDetails}`;
                                if (errorCode === 'RLS_POLICY_VIOLATION' || errorDetails.includes('RLS') || errorDetails.includes('manager_id')) {
                                  errorMessage += '\n\nPossible causes:\n';
                                  errorMessage += '1. RLS DELETE policy not applied - Run FIX_TEAMS_DELETE_RLS.sql in Supabase\n';
                                  errorMessage += '2. You are not the team manager (manager_id does not match your user id)\n';
                                  errorMessage += '3. Your user role is not "manager" or "owner"\n';
                                  errorMessage += '\nCheck browser console for detailed logs.';
                                }
                                
                                setErrorMsg(errorMessage);
                                setSuccessMsg("");
                                setTimeout(() => setErrorMsg(""), 12000);
                              }
                            } catch (error: any) {
                              console.error('Delete team exception:', error);
                              setErrorMsg(`Failed to delete team: ${error?.message || JSON.stringify(error) || "Unknown error."}`);
                              setSuccessMsg("");
                              setTimeout(() => setErrorMsg(""), 8000);
                            } finally {
                              setEditTeamLoading(false);
                            }
                          }
                        }}
                        disabled={editTeamLoading}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col gap-2 cursor-pointer hover:shadow-md transition text-left"
                        onClick={async () => {
                          setModalTeam(team);
                          if (!teamLeads[team.id]) await fetchLeadsForTeam(team);
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg font-semibold text-purple-700">{team.name}</span>
                          <span className="ml-2 text-xs text-slate-500">(View overview)</span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          {team.members.length === 0 ? (
                            <span className="text-xs text-slate-400">No members</span>
                          ) : (
                            team.members.map(id => (
                              <div key={id} className="flex items-center gap-1 bg-purple-100 px-2 py-1 rounded-full">
                                <Avatar className="w-6 h-6">
                                  <AvatarFallback className="bg-purple-600 text-white text-xs">
                                    {(teamMembers[id]?.split(" ")[0][0] || "").toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-purple-900 font-medium">{teamMembers[id] || id}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </button>
                    </DialogTrigger>
                  </div>
                ))
              )}
            </div>
            <DialogContent>
              {modalTeam && (
                <div>
                  <DialogHeader>
                    <DialogTitle>Team: {modalTeam.name}</DialogTitle>
                    <DialogDescription>Overview of leads and status for this team</DialogDescription>
                  </DialogHeader>
                  <div className="mt-4">
                    {teamLeadsLoading[modalTeam.id] ? (
                      <div className="text-slate-400 text-sm">Loading leads...</div>
                    ) : (
                      <>
                        {/* Status summary and qualified percentage */}
                        <div className="mb-4 flex flex-wrap gap-3 items-center">
                          {['new','qualified','proposal','closed_won','not_interested'].map(status => {
                            const count = teamLeads[modalTeam.id]?.filter(l => l.status === status).length || 0;
                            return (
                              <span key={status} className="text-xs px-2 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700">
                                {status.replace('_',' ')}: <b>{count}</b>
                              </span>
                            );
                          })}
                          {/* Qualified percentage */}
                          {(() => {
                            const leads = teamLeads[modalTeam.id] || [];
                            const qualified = leads.filter(l => l.status === 'qualified').length;
                            const pct = leads.length > 0 ? Math.round((qualified / leads.length) * 100) : 0;
                            return (
                              <span className="ml-4 text-xs font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full border border-green-200">
                                Qualified: {pct}%
                              </span>
                            );
                          })()}
                        </div>
                        {/* Leads table */}
                        {(!teamLeads[modalTeam.id] || teamLeads[modalTeam.id].length === 0) ? (
                          <div className="text-xs text-slate-400">No leads assigned to this team.</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs border">
                              <thead>
                                <tr className="bg-slate-100">
                                  <th className="px-2 py-1 border">Lead Name</th>
                                  <th className="px-2 py-1 border">Status</th>
                                  <th className="px-2 py-1 border">Assigned To</th>
                                </tr>
                              </thead>
                              <tbody>
                                {teamLeads[modalTeam.id].map(lead => (
                                  <tr key={lead.id} className="border-b">
                                    <td className="px-2 py-1 border">{lead.company_name || lead.contact_name || lead.email || lead.id}</td>
                                    <td className="px-2 py-1 border capitalize">{lead.status?.replace('_',' ')}</td>
                                    <td className="px-2 py-1 border">{teamMembers[lead.assigned_to] || lead.assigned_to}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Edit Team Modal - moved outside the map */}
          <Dialog open={!!editingTeamId} onOpenChange={(open) => { if (!open) setEditingTeamId(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Team</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-team-name">Team Name</Label>
                  <Input
                    id="edit-team-name"
                    value={editTeamName}
                    onChange={e => setEditTeamName(e.target.value)}
                    disabled={editTeamLoading}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="mt-4">Team Members</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {salesmen.map(s => (
                      <label key={s.id} className="flex items-center gap-2 text-sm bg-slate-100 px-2 py-1 rounded cursor-pointer hover:bg-slate-200">
                        <input
                          type="checkbox"
                          checked={editTeamMembers.includes(s.id)}
                          onChange={e => {
                            setEditTeamMembers(prev =>
                              e.target.checked
                                ? [...prev, s.id]
                                : prev.filter(id => id !== s.id)
                            );
                          }}
                          disabled={editTeamLoading}
                        />
                        {s.full_name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => {
                  setEditingTeamId(null);
                  setEditTeamName("");
                  setEditTeamMembers([]);
                }} disabled={editTeamLoading}>Cancel</Button>
                <Button
                  onClick={async () => {
                    if (!editingTeamId) return;
                    setEditTeamLoading(true);
                    setSuccessMsg("");
                    setErrorMsg("");
                    try {
                      const res = await updateTeam(editingTeamId, { name: editTeamName });
                      if (!res.error) {
                        // Deduplicate member IDs before sending to backend
                        const uniqueMembers = Array.from(new Set(editTeamMembers));
                        const resMembers = await updateTeamMembers(editingTeamId, uniqueMembers);
                        setEditTeamLoading(false);
                        if (resMembers.success) {
                          setTeams(prev => prev.map(t => t.id === editingTeamId ? { ...t, name: editTeamName, members: [...uniqueMembers] } : t));
                          setSuccessMsg("Team updated successfully.");
                          setEditingTeamId(null);
                          setEditTeamName("");
                          setEditTeamMembers([]);
                        } else {
                          console.error('Update team members error:', resMembers.error);
                          setErrorMsg('Failed to update team members. ' + (resMembers.error?.message || resMembers.error?.details || JSON.stringify(resMembers.error) || "Unknown error. Possible RLS or constraint issue."));
                        }
                      } else {
                        setEditTeamLoading(false);
                        console.error('Update team error:', res.error);
                        setErrorMsg('Failed to update team. ' + (res.error?.message || res.error?.details || JSON.stringify(res.error) || "Unknown error. Possible RLS or constraint issue."));
                      }
                    } catch (error: any) {
                      setEditTeamLoading(false);
                      console.error('Update team error:', error);
                      setErrorMsg('Failed to update team. ' + (error?.message || "Unknown error."));
                    }
                  }}
                  disabled={editTeamLoading || !editTeamName.trim()}
                >
                  {editTeamLoading ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <hr className="my-6 border-slate-200" />
          <form
            className="flex flex-col gap-4 md:flex-row md:items-end"
            onSubmit={async e => {
              e.preventDefault();
              setSuccessMsg("");
              setErrorMsg("");
              setCreatingTeam(true);
              try {
                // Create team in Supabase
                const currentUser = await getCurrentUser();
                if (!currentUser) {
                  setErrorMsg('Failed to get current user');
                  setCreatingTeam(false);
                  return;
                }
                const { data: created, error } = await createTeam({
                  name: newTeamName,
                  manager_id: currentUser.id,
                });
                if (error || !created || !created[0]) {
                  setErrorMsg('Failed to create team. ' + (error?.message || error || 'Unknown error'));
                  setCreatingTeam(false);
                  return;
                }
                const teamId = created[0].id;
                // Add members to team_members
                for (const userId of newTeamMembers) {
                  const { error: memberError } = await supabase.from('team_members').insert({ team_id: teamId, user_id: userId });
                  if (memberError) {
                    setErrorMsg('Failed to add member: ' + (memberError?.message || memberError));
                  }
                }
                // Refresh teams
                const { data: teamsData } = await getTeams();
                const teamsWithMembers: Team[] = [];
                if (teamsData && Array.isArray(teamsData)) {
                  for (const t of teamsData) {
                    const members = await fetchTeamMembers(t.id);
                    teamsWithMembers.push({ id: t.id, name: t.name, members });
                  }
                }
                setTeams(teamsWithMembers);
                setNewTeamName("");
                setNewTeamMembers([]);
                setSuccessMsg("Team created successfully!");
              } catch (err) {
                setErrorMsg('Failed to create team. ' + (err?.message || err || 'Unknown error'));
              }
              setCreatingTeam(false);
            }}
          >
            <div className="flex flex-col gap-1">
              <label className="block text-xs text-slate-600 mb-1">Team Name</label>
              <input
                className="border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                required
                placeholder="Enter team name"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="block text-xs text-slate-600 mb-1">Assign Salespeople</label>
              <div className="flex flex-wrap gap-2">
                {salesmen.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-xs bg-slate-100 px-2 py-1 rounded-full cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTeamMembers.includes(s.id)}
                      onChange={e => {
                        setNewTeamMembers(prev =>
                          e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                        );
                      }}
                    />
                    <Avatar className="w-5 h-5">
                      <AvatarFallback className="bg-purple-600 text-white text-xs">
                        {(s.full_name?.split(" ")[0][0] || "").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {s.full_name}
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="bg-purple-600 text-white px-6 py-2 rounded shadow hover:bg-purple-700 transition"
              disabled={creatingTeam || !newTeamName || newTeamMembers.length === 0}
            >
              {creatingTeam ? <span className="animate-pulse">Creating...</span> : "Create Team"}
            </button>
          </form>
        </Card>

        {/* Activity Log Section */}
        <Card className="p-4 bg-white/5 border-white/10">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-purple-500 mr-2" />
              <span className="text-slate-600">Loading activities...</span>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-12 h-12 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500">No activities yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((item) => {
                const Icon = iconMap[item.type] || FileText;
                return (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Badge className={colorMap[item.type] || colorMap.note} variant="outline">
                        <Icon className="w-4 h-4" />
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-900 font-medium truncate">{item.title || "Activity"}</div>
                        <div className="text-xs text-slate-500">
                          {item.owner} {item.description ? `• ${item.description.substring(0, 40)}...` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 ml-2 whitespace-nowrap">{formatTime(item.created_at)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Create Salesman Modal */}
        <Dialog open={showCreateSalesmanModal} onOpenChange={setShowCreateSalesmanModal}>
          <DialogContent className="bg-white border-slate-200 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Create Salesman Account</DialogTitle>
            </DialogHeader>
            {createdSalesman ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-green-800 font-semibold mb-2">Account created successfully!</p>
                  <p className="text-sm text-green-700 mb-4">Share these credentials with the salesman:</p>
                  <div className="bg-white border border-green-200 rounded p-3 space-y-2">
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Full Name:</p>
                      <p className="text-sm font-semibold text-slate-900">{createdSalesman.fullName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Email:</p>
                      <p className="text-sm font-semibold text-slate-900">{createdSalesman.email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Password:</p>
                      <p className="text-sm font-semibold text-slate-900 font-mono bg-slate-50 p-2 rounded border border-slate-200">{createdSalesman.password}</p>
                    </div>
                  </div>
                  <p className="text-xs text-green-700 mt-3">⚠️ Save this password - it cannot be retrieved later!</p>
                </div>
                <DialogFooter>
                  <Button 
                    onClick={() => {
                      setShowCreateSalesmanModal(false);
                      setCreatedSalesman(null);
                      setSalesmanForm({ email: "", fullName: "", password: "" });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="salesman_name" className="text-slate-700">Full Name</Label>
                    <Input
                      id="salesman_name"
                      value={salesmanForm.fullName}
                      onChange={(e) => setSalesmanForm({ ...salesmanForm, fullName: e.target.value })}
                      placeholder="John Doe"
                      className="mt-1.5 border-slate-300 focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <Label htmlFor="salesman_email" className="text-slate-700">Email</Label>
                    <Input
                      id="salesman_email"
                      type="email"
                      value={salesmanForm.email}
                      onChange={(e) => setSalesmanForm({ ...salesmanForm, email: e.target.value })}
                      placeholder="john@example.com"
                      className="mt-1.5 border-slate-300 focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <Label htmlFor="salesman_password" className="text-slate-700">Password</Label>
                    <Input
                      id="salesman_password"
                      type="password"
                      value={salesmanForm.password}
                      onChange={(e) => setSalesmanForm({ ...salesmanForm, password: e.target.value })}
                      placeholder="Minimum 6 characters"
                      className="mt-1.5 border-slate-300 focus:border-slate-400"
                    />
                    <p className="text-xs text-slate-500 mt-1">This password will be shown to you after creation. Share it with the salesman.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setShowCreateSalesmanModal(false);
                      setSalesmanForm({ email: "", fullName: "", password: "" });
                    }}
                    disabled={creatingSalesman}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateSalesman}
                    disabled={creatingSalesman || !salesmanForm.email || !salesmanForm.fullName || !salesmanForm.password}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {creatingSalesman ? "Creating..." : "Create Account"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Salesman Modal */}
        <Dialog open={!!editingSalesman} onOpenChange={(open) => { if (!open) setEditingSalesman(null); }}>
          <DialogContent className="bg-white border-slate-200 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Edit Salesman</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit_salesman_name" className="text-slate-700">Full Name</Label>
                <Input
                  id="edit_salesman_name"
                  value={editSalesmanForm.fullName}
                  onChange={(e) => setEditSalesmanForm({ ...editSalesmanForm, fullName: e.target.value })}
                  placeholder="John Doe"
                  className="mt-1.5 border-slate-300 focus:border-slate-400"
                />
              </div>
              <div>
                <Label htmlFor="edit_salesman_email" className="text-slate-700">Email</Label>
                <Input
                  id="edit_salesman_email"
                  type="email"
                  value={editSalesmanForm.email}
                  onChange={(e) => setEditSalesmanForm({ ...editSalesmanForm, email: e.target.value })}
                  placeholder="john@example.com"
                  className="mt-1.5 border-slate-300 focus:border-slate-400"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline"
                onClick={() => {
                  setEditingSalesman(null);
                  setEditSalesmanForm({ fullName: "", email: "" });
                }}
                disabled={updatingSalesman}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateSalesman}
                disabled={updatingSalesman || !editSalesmanForm.email || !editSalesmanForm.fullName}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {updatingSalesman ? "Updating..." : "Update"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Salesman Confirmation Modal */}
        <Dialog open={!!deletingSalesmanId} onOpenChange={(open) => { if (!open) setDeletingSalesmanId(null); }}>
          <DialogContent className="bg-white border-slate-200 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Delete Salesman</DialogTitle>
              <DialogDescription className="text-slate-600">
                Are you sure you want to delete this salesman? This action cannot be undone.
                {deletingSalesmanId && (
                  <span className="block mt-2 font-medium">
                    Salesman: {salesmen.find(s => s.id === deletingSalesmanId)?.full_name || 'Unknown'}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline"
                onClick={() => setDeletingSalesmanId(null)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleDeleteSalesman}
                disabled={deletingSalesman}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {deletingSalesman ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};


export default ManagerActivity;






