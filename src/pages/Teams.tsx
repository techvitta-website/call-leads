import { useState, useEffect } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Users, Plus, Mail, Phone, Shield, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getTeams, getUsers } from "@/lib/supabase";

const initials = (name: string) =>
  (name || "?")
    .split(" ")
    .map((n) => n[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";

const ROLE_COLORS: Record<string, string> = {
  manager: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  salesman: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  owner: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const Teams = () => {
  const [teams, setTeams] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeams = async () => {
      setLoading(true);
      const [teamsRes, usersRes] = await Promise.all([getTeams(), getUsers()]);
      const teamsData = teamsRes.data || [];
      const usersData = usersRes.data || [];

      const enriched = teamsData.map((team: any) => {
        const members = usersData.filter(
          (u: any) => u.team_id === team.id
        );
        const manager = usersData.find((u: any) => u.id === team.manager_id);
        return { ...team, members, managerName: manager?.name || manager?.email || "—" };
      });

      const noTeam = usersData.filter(
        (u: any) =>
          !u.team_id &&
          !teamsData.some((t: any) => t.manager_id === u.id) &&
          u.role === "salesman"
      );

      setTeams(enriched);
      setUnassigned(noTeam);
      setLoading(false);
    };
    fetchTeams();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <DashboardSidebar role="owner" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-white text-lg">Loading teams…</div>
        </main>
      </div>
    );
  }

  const totalMembers = teams.reduce((sum, t) => sum + t.members.length, 0);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <DashboardSidebar role="owner" />
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Teams</h1>
            <p className="text-slate-400">
              Manage your sales teams and their members
            </p>
          </div>
          <Button
            onClick={() => alert("Create Team — available in Manager Dashboard")}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4" />
            Create Team
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Teams", value: teams.length, icon: <Shield className="w-5 h-5 text-blue-400" /> },
            { label: "Team Members", value: totalMembers, icon: <Users className="w-5 h-5 text-purple-400" /> },
            { label: "Unassigned", value: unassigned.length, icon: <UserCheck className="w-5 h-5 text-amber-400" /> },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                {s.icon}
              </div>
              <div>
                <div className="text-sm text-slate-400">{s.label}</div>
                <div className="text-2xl font-bold text-white">{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Team Cards */}
        {teams.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-xl py-16 text-center text-slate-400">
            No teams created yet. Use the Manager Dashboard to create teams.
          </div>
        ) : (
          <div className="space-y-6">
            {teams.map((team) => (
              <div
                key={team.id}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden"
              >
                {/* Team Header */}
                <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-white/10 p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-600/30 flex items-center justify-center">
                        <Users className="w-6 h-6 text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white">{team.name}</h2>
                        <p className="text-sm text-slate-400">
                          Manager: {team.managerName}
                          {team.region ? ` · ${team.region}` : ""}
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">
                      {team.members.length} member{team.members.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </div>

                {/* Members */}
                <div className="p-6">
                  {team.members.length === 0 ? (
                    <p className="text-slate-500 text-sm">No members assigned to this team yet.</p>
                  ) : (
                    <>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                        Team Members
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {team.members.map((member: any) => (
                          <div
                            key={member.id}
                            className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors"
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-blue-600/30 text-blue-300 font-medium">
                                  {initials(member.full_name || member.name || member.email)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-white truncate">
                                  {member.full_name || member.name || member.email}
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`text-xs mt-0.5 ${ROLE_COLORS[member.role] || ROLE_COLORS.salesman}`}
                                >
                                  {member.role}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {member.email && (
                                <Button
                                  onClick={() =>
                                    (window.location.href = `mailto:${member.email}`)
                                  }
                                  variant="ghost"
                                  size="sm"
                                  className="flex-1 gap-1.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs"
                                >
                                  <Mail className="w-3 h-3" />
                                  Email
                                </Button>
                              )}
                              {member.phone && (
                                <Button
                                  onClick={() =>
                                    (window.location.href = `tel:${member.phone}`)
                                  }
                                  variant="ghost"
                                  size="sm"
                                  className="flex-1 gap-1.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs"
                                >
                                  <Phone className="w-3 h-3" />
                                  Call
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Unassigned salespeople */}
        {unassigned.length > 0 && (
          <div className="mt-6 bg-amber-500/5 border border-amber-500/20 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Unassigned Salespeople ({unassigned.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {unassigned.map((u: any) => (
                <div
                  key={u.id}
                  className="bg-white/5 rounded-lg p-3 flex items-center gap-3"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-amber-500/20 text-amber-400 text-xs">
                      {initials(u.full_name || u.name || u.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">
                      {u.full_name || u.name || u.email}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{u.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Teams;
