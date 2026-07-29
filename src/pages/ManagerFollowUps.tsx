import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader, Calendar, Clock, User, Building2, Mail, Phone, Briefcase, Eye, MessageCircle, StickyNote, Edit, Trash2, MoreHorizontal, ChevronDown, Phone as PhoneIcon } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, getLeads, getUserRole, getUsers, getProjects, updateLead, deleteLead, createLeadActivity } from "@/lib/supabase";
import { formatCurrency } from "@/utils/currency";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isStaff, normalizeRole } from "@/lib/roles";

// Helper function to parse phone numbers
const parsePhoneNumbers = (phoneString: string | null | undefined): string[] => {
  if (!phoneString) return [];
  const phones = String(phoneString)
    .split(/[,;|\n\r]+/)
    .map(p => p.trim())
    .filter(p => p.length >= 7 && p.length <= 20 && /[\d\+\-\(\)\s]{7,}/.test(p));
  return [...new Set(phones)];
};

const ManagerFollowUps = () => {
  const [loading, setLoading] = useState(true);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "upcoming" | "overdue" | "today">("all");
  const navigate = useNavigate();

  // Modal states
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedLeadForActivity, setSelectedLeadForActivity] = useState<any | null>(null);
  const [selectedLeadForWhatsApp, setSelectedLeadForWhatsApp] = useState<any | null>(null);
  const [selectedLeadForEmail, setSelectedLeadForEmail] = useState<any | null>(null);
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [noteText, setNoteText] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackNotes, setCallbackNotes] = useState("");
  const [submittingActivity, setSubmittingActivity] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);

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

        const [leadsRes, usersRes, projectsRes] = await Promise.all([
          getLeads(),
          getUsers(),
          getProjects(),
        ]);

        // Filter leads that have follow-up information AND exclude done statuses
        const allLeads = leadsRes.data || [];
        const leadsWithFollowUps = allLeads.filter((lead: any) => 
          (lead.next_followup_date || lead.followup_notes) && 
          !['not_interested', 'closed_won'].includes(lead.status)
        );

        setFollowUps(leadsWithFollowUps);
        setUsers(usersRes.data || []);
        setProjects(projectsRes.data || []);
      } catch (error) {
        console.error("Error fetching follow-ups:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const getFilteredFollowUps = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return followUps.filter((followUp: any) => {
      if (!followUp.next_followup_date) return filter === "all";
      
      const followUpDate = new Date(followUp.next_followup_date);
      const followUpDateOnly = new Date(followUpDate.getFullYear(), followUpDate.getMonth(), followUpDate.getDate());
      
      switch (filter) {
        case "today":
          return followUpDateOnly.getTime() === today.getTime();
        case "upcoming":
          return followUpDateOnly.getTime() > today.getTime();
        case "overdue":
          return followUpDateOnly.getTime() < today.getTime();
        default:
          return true;
      }
    });
  };

  const filteredFollowUps = getFilteredFollowUps();

  const getAssignedSalesman = (lead: any) => {
    if (!lead.assigned_to) return null;
    return users.find(u => u.id === lead.assigned_to);
  };

  const getProject = (lead: any) => {
    return projects.find(p => p.id === lead.project_id);
  };

  const getDaysUntilFollowUp = (date: string) => {
    if (!date) return null;
    const followUpDate = new Date(date);
    const today = new Date();
    const diffTime = followUpDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const statusOptions = [
    { value: "new", label: "New" },
    { value: "qualified", label: "Qualified" },
    { value: "proposal", label: "In Proposal" },
    { value: "closed_won", label: "Closed Won" },
    { value: "not_interested", label: "Not Interested" },
  ];

  const handleStatusChange = async (lead: any, newStatus: string) => {
    try {
      await updateLead(lead.id, { status: newStatus });
      setFollowUps((prev) =>
        newStatus === "not_interested"
          ? prev.filter((l: any) => l.id !== lead.id)
          : prev.map((l: any) => (l.id === lead.id ? { ...l, status: newStatus } : l))
      );
    } catch (error) {
      console.error("Failed to update status from follow-ups", error);
      alert("Failed to update status. Please try again.");
    }
  };

  // WhatsApp helpers
  const getWhatsAppMessage = (lead: any) => {
    let messageTemplate = '';
    
    if ((lead as any).whatsapp_message) {
      messageTemplate = (lead as any).whatsapp_message;
    } else {
      const project = projects.find(p => p.id === lead.project_id);
      if (project && (project as any).whatsapp_message) {
        messageTemplate = (project as any).whatsapp_message;
      } else {
        const companyName = lead.company_name || 'there';
        const contactName = lead.contact_name || '';
        return `Hello${contactName ? ` ${contactName}` : ''}, I hope this message finds you well. I wanted to reach out regarding ${companyName}. Would you be available for a quick conversation?`;
      }
    }
    
    const companyName = lead.company_name || '';
    const contactName = lead.contact_name || '';
    const projectName = projects.find(p => p.id === lead.project_id)?.name || '';
    
    return messageTemplate
      .replace(/{company_name}/g, companyName)
      .replace(/{contact_name}/g, contactName)
      .replace(/{project_name}/g, projectName);
  };

  const formatPhoneForWhatsApp = (phone: string): string | null => {
    if (!phone) return null;
    
    // Step 1: Remove all non-digit characters (keep only digits)
    let cleaned = phone.replace(/[^\d]/g, '');
    
    // Step 2: Handle international prefixes
    // Remove + sign (already removed in step 1, but handle if present in original)
    // Handle 00 prefix (international dialing code)
    if (cleaned.startsWith('00')) {
      cleaned = cleaned.slice(2);
    }
    
    // Step 3: Remove ALL leading zeros - WhatsApp requires no leading zeros
    // Country codes start with 1-9, never 0
    cleaned = cleaned.replace(/^0+/, '');
    
    // Step 4: Validate length (E.164 standard: 1-15 digits)
    // Minimum: 7 digits (some small countries)
    // Maximum: 15 digits (E.164 standard)
    if (cleaned.length < 7 || cleaned.length > 15) {
      return null;
    }
    
    // Step 5: Ensure it's all digits and doesn't start with 0
    if (!/^\d+$/.test(cleaned) || cleaned.startsWith('0')) {
      return null;
    }
    
    // Step 6: Final check - must start with 1-9 (valid country code)
    // Country codes are 1-3 digits and start with 1-9
    if (!/^[1-9]\d+$/.test(cleaned)) {
      return null;
    }
    
    return cleaned;
  };

  const handleWhatsApp = (lead: any) => {
    const phoneNumbers = parsePhoneNumbers(lead.contact_phone || lead.phone || (lead as any).mobile_phone);
    const validPhones = phoneNumbers.map(formatPhoneForWhatsApp).filter((p): p is string => Boolean(p));
    
    if (validPhones.length === 0) {
      alert('No phone number available for this lead');
      return;
    }
    
    setSelectedLeadForWhatsApp(lead);
    setWhatsAppMessage(getWhatsAppMessage(lead));
    setShowWhatsAppModal(true);
  };

  const handleSendWhatsApp = () => {
    if (!selectedLeadForWhatsApp || !whatsAppMessage.trim()) {
      alert('Please enter a message');
      return;
    }

    const phoneNumbers = parsePhoneNumbers(
      selectedLeadForWhatsApp.contact_phone || 
      selectedLeadForWhatsApp.phone || 
      (selectedLeadForWhatsApp as any).mobile_phone
    );
    const validPhones = phoneNumbers.map(formatPhoneForWhatsApp).filter((p): p is string => Boolean(p));
    
    if (validPhones.length === 0) {
      const originalPhone = selectedLeadForWhatsApp.contact_phone || selectedLeadForWhatsApp.phone || (selectedLeadForWhatsApp as any).mobile_phone;
      alert(`Invalid phone number format: "${originalPhone}". Please ensure the number includes a country code (e.g., +1 for USA, +91 for India).`);
      return;
    }
    
    const message = encodeURIComponent(whatsAppMessage.trim());
    // When there are two numbers, use the first number as WhatsApp number
    const formattedPhone = validPhones[0];
    
    // Double-check the format before opening WhatsApp
    if (!formattedPhone || formattedPhone.length < 7 || formattedPhone.length > 15 || formattedPhone.startsWith('0')) {
      alert(`Invalid phone number format: "${formattedPhone}". Please check the number includes a valid country code.`);
      return;
    }
    
    // Open WhatsApp with the properly formatted number
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${message}`;
    window.open(whatsappUrl, '_blank');
    setShowWhatsAppModal(false);
    setWhatsAppMessage("");
    setSelectedLeadForWhatsApp(null);
  };

  // Email helpers
  const getEmailDefaults = (lead: any) => {
    const companyName = lead.company_name || "";
    const contactName = lead.contact_name || "";
    const projectName = projects.find(p => p.id === lead.project_id)?.name || "";

    const defaultSubject = `Quick follow-up - ${companyName || projectName || "your project"}`;
    const defaultBody = `Hi${contactName ? ` ${contactName}` : ""},\n\nI hope you're doing well. I wanted to follow up regarding ${companyName || projectName || "our discussion"}. Please let me know a good time to connect.\n\nThanks,\n`;

    return { subject: defaultSubject, body: defaultBody };
  };

  const handleEmail = (lead: any) => {
    const emailAddress = lead.contact_email || lead.email;
    if (!emailAddress) {
      alert("No email available for this lead");
      return;
    }
    setSelectedLeadForEmail(lead);
    const defaults = getEmailDefaults(lead);
    setEmailSubject(defaults.subject);
    setEmailBody(defaults.body);
    setShowEmailModal(true);
  };

  const handleSendEmail = () => {
    if (!selectedLeadForEmail) return;
    const emailAddress = selectedLeadForEmail.contact_email || selectedLeadForEmail.email;
    if (!emailAddress) {
      alert("No email available for this lead");
      return;
    }
    if (!emailSubject.trim() || !emailBody.trim()) {
      alert("Subject and body are required");
      return;
    }

    const subject = encodeURIComponent(emailSubject.trim());
    const body = encodeURIComponent(emailBody.trim());
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emailAddress)}&su=${subject}&body=${body}`;
    window.open(gmailUrl, "_blank");

    setShowEmailModal(false);
    setSelectedLeadForEmail(null);
    setEmailSubject("");
    setEmailBody("");
  };

  // Activity handlers
  const handleAddNote = (lead: any) => {
    setSelectedLeadForActivity(lead);
    setNoteText("");
    setShowNoteModal(true);
  };

  const handleScheduleCallback = (lead: any) => {
    setSelectedLeadForActivity(lead);
    setCallbackDate("");
    setCallbackNotes("");
    setShowCallbackModal(true);
  };

  const handleSubmitNote = async () => {
    if (!selectedLeadForActivity || !noteText.trim()) return;
    
    setSubmittingActivity(true);
    try {
      await createLeadActivity({
        lead_id: selectedLeadForActivity.id,
        type: 'note',
        description: noteText.trim(),
      });
      
      await updateLead(selectedLeadForActivity.id, {
        last_contacted_at: new Date().toISOString(),
      });
      
      const leadsRes = await getLeads();
      const allLeads = leadsRes.data || [];
      const leadsWithFollowUps = allLeads.filter((lead: any) => 
        (lead.next_followup_date || lead.followup_notes) && 
        !['not_interested', 'closed_won'].includes(lead.status)
      );
      setFollowUps(leadsWithFollowUps);
      
      setShowNoteModal(false);
      setNoteText("");
      setSelectedLeadForActivity(null);
    } catch (error) {
      console.error("Failed to add note", error);
      alert("Failed to add note. Please try again.");
    } finally {
      setSubmittingActivity(false);
    }
  };

  const handleSubmitCallback = async () => {
    if (!selectedLeadForActivity || !callbackDate || !callbackNotes.trim()) return;
    
    setSubmittingActivity(true);
    try {
      await createLeadActivity({
        lead_id: selectedLeadForActivity.id,
        type: 'note',
        description: `Callback scheduled for ${new Date(callbackDate).toLocaleDateString()}. Notes: ${callbackNotes.trim()}`,
      });
      
      const callbackDateTime = new Date(callbackDate);
      callbackDateTime.setHours(9, 0, 0, 0);
      
      await updateLead(selectedLeadForActivity.id, {
        next_followup_date: callbackDateTime.toISOString(),
        followup_notes: callbackNotes.trim(),
        last_contacted_at: new Date().toISOString(),
      });
      
      const leadsRes = await getLeads();
      const allLeads = leadsRes.data || [];
      const leadsWithFollowUps = allLeads.filter((lead: any) => 
        (lead.next_followup_date || lead.followup_notes) && 
        !['not_interested', 'closed_won'].includes(lead.status)
      );
      setFollowUps(leadsWithFollowUps);
      
      setShowCallbackModal(false);
      setCallbackDate("");
      setCallbackNotes("");
      setSelectedLeadForActivity(null);
      alert(`Callback scheduled for ${new Date(callbackDate).toLocaleDateString()}`);
    } catch (error) {
      console.error("Failed to schedule callback", error);
      alert("Failed to schedule callback. Please try again.");
    } finally {
      setSubmittingActivity(false);
    }
  };

  const handleDeleteLead = async (lead: any) => {
    if (confirm(`Are you sure you want to delete ${lead.company_name}?`)) {
      try {
        await deleteLead(lead.id);
        const leadsRes = await getLeads();
        const allLeads = leadsRes.data || [];
        const leadsWithFollowUps = allLeads.filter((l: any) => 
          (l.next_followup_date || l.followup_notes) && 
          l.status !== 'not_interested'
        );
        setFollowUps(leadsWithFollowUps);
        alert("Lead deleted successfully");
      } catch (error: any) {
        alert(`Failed to delete lead: ${error.message || 'Unknown error'}`);
      }
    }
  };

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
      <main className="flex-1 p-2 sm:p-3 lg:p-4 pt-16 sm:pt-16 lg:pt-8 overflow-auto bg-slate-50">
        <div className="mb-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-0.5">Follow-ups</h1>
              <p className="text-xs sm:text-sm text-slate-600">
                {filteredFollowUps.length} follow-up{filteredFollowUps.length !== 1 ? 's' : ''} {filter !== 'all' ? `(${filter})` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Follow-ups</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => navigate('/manager/leads')}
                variant="outline"
              >
                Back to Leads
              </Button>
            </div>
          </div>
        </div>

        {filteredFollowUps.length === 0 ? (
          <Card className="p-12 text-center">
            <Calendar className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 text-lg mb-2">No follow-ups found</p>
            <p className="text-sm text-slate-500 mb-4">
              {filter === 'all' 
                ? 'No leads have follow-up information yet'
                : `No ${filter} follow-ups at this time`
              }
            </p>
            <Button
              onClick={() => navigate('/manager/leads')}
              variant="outline"
            >
              View Leads
            </Button>
          </Card>
        ) : (
          <Card className="overflow-hidden p-1">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-900 py-1 px-2 text-[10px]">Company</TableHead>
                    <TableHead className="font-semibold text-slate-900 py-1 px-2 text-[10px]">Contact</TableHead>
                    <TableHead className="font-semibold text-slate-900 py-1 px-2 text-[10px]">Project</TableHead>
                    <TableHead className="font-semibold text-slate-900 py-1 px-2 text-[10px]">Follow-up Date</TableHead>
                    <TableHead className="font-semibold text-slate-900 py-1 px-2 text-[10px]">Status</TableHead>
                    <TableHead className="font-semibold text-slate-900 py-1 px-2 text-[10px]">Salesman</TableHead>
                    <TableHead className="font-semibold text-slate-900 py-1 px-2 text-[10px]">Value</TableHead>
                    <TableHead className="font-semibold text-slate-900 py-1 px-2 text-[10px]">Notes</TableHead>
                    <TableHead className="font-semibold text-slate-900 py-1 px-2 text-[10px]">Contact</TableHead>
                    <TableHead className="font-semibold text-slate-900 py-1 px-2 text-[10px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFollowUps.map((followUp: any) => {
                    const assignedSalesman = getAssignedSalesman(followUp);
                    const project = getProject(followUp);
                    const daysUntil = followUp.next_followup_date ? getDaysUntilFollowUp(followUp.next_followup_date) : null;
                    const isOverdue = daysUntil !== null && daysUntil < 0;
                    const isToday = daysUntil === 0;
                    const phoneNumbers = parsePhoneNumbers(followUp.contact_phone || followUp.phone || (followUp as any).mobile_phone);
                    
                    return (
                      <TableRow key={followUp.id} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium text-slate-900 py-1 px-2">
                          <div className="flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-blue-500" />
                            <span className="text-xs">{followUp.company_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-700 py-1 px-2 text-xs">{followUp.contact_name || 'N/A'}</TableCell>
                        <TableCell className="py-1 px-2">
                          {project ? (
                            <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px] px-1.5 py-0">
                              <Briefcase className="w-2.5 h-2.5 mr-0.5" />
                              {project.name}
                            </Badge>
                          ) : (
                            <span className="text-slate-400 text-[10px]">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {followUp.next_followup_date ? (
                            <div className="flex items-center gap-1">
                              <Calendar className={`w-3 h-3 ${isOverdue ? 'text-red-500' : isToday ? 'text-orange-500' : 'text-green-500'}`} />
                              <div className="flex flex-col">
                                <span className={`text-[10px] font-medium ${isOverdue ? 'text-red-700' : isToday ? 'text-orange-700' : 'text-green-700'}`}>
                                  {new Date(followUp.next_followup_date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                                <span className="text-[9px] text-slate-500">
                                  {new Date(followUp.next_followup_date).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                                {daysUntil !== null && (
                                  <Badge className={`mt-0.5 w-fit text-[9px] px-1 py-0 ${
                                    isOverdue 
                                      ? 'bg-red-100 text-red-700 border-red-200'
                                      : isToday
                                      ? 'bg-orange-100 text-orange-700 border-orange-200'
                                      : 'bg-green-100 text-green-700 border-green-200'
                                  }`}>
                                    {isOverdue ? `${Math.abs(daysUntil)}d overdue` : isToday ? 'Today' : `In ${daysUntil}d`}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Not scheduled</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <Select
                            value={followUp.status || "new"}
                            onValueChange={(value) => handleStatusChange(followUp, value)}
                          >
                            <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-[10px] h-6 w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {assignedSalesman ? (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              <span className="text-[10px] text-slate-700">
                                {assignedSalesman.full_name || assignedSalesman.email?.split('@')[0] || 'Unknown'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold text-green-700 py-1 px-2 text-xs">
                          {formatCurrency(followUp.value || 0)}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {followUp.followup_notes ? (
                            <div className="max-w-xs">
                              <p className="text-[10px] text-slate-700 truncate" title={followUp.followup_notes}>
                                {followUp.followup_notes}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <div className="flex items-center gap-0.5">
                            {phoneNumbers.length > 0 ? (
                              phoneNumbers.length === 1 ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 hover:bg-slate-100"
                                  title={`Call ${phoneNumbers[0]}`}
                                  asChild
                                >
                                  <a href={`tel:${phoneNumbers[0]}`}>
                                    <PhoneIcon className="w-3 h-3" />
                                  </a>
                                </Button>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 hover:bg-slate-100"
                                      title={`${phoneNumbers.length} phone numbers`}
                                    >
                                      <PhoneIcon className="w-3 h-3" />
                                      <ChevronDown className="w-2 h-2 ml-0.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                                    <div className="px-2 py-1.5 text-xs font-semibold text-slate-600 border-b">
                                      {phoneNumbers.length} Phone Number{phoneNumbers.length !== 1 ? 's' : ''}
                                    </div>
                                    {phoneNumbers.map((phone, idx) => (
                                      <DropdownMenuItem key={idx} asChild>
                                        <a href={`tel:${phone}`} className="flex items-center gap-2 cursor-pointer w-full">
                                          <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
                                          <span className="font-medium">{phone}</span>
                                        </a>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-slate-100"
                                title="No phone number"
                                disabled
                              >
                                <PhoneIcon className="w-3 h-3 text-slate-400" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-slate-100"
                              title="Email"
                              onClick={() => handleEmail(followUp)}
                              disabled={!followUp.email && !followUp.contact_email}
                            >
                              <Mail className="w-3 h-3" />
                            </Button>
                            {phoneNumbers.length > 0 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-green-100"
                                title="WhatsApp"
                                onClick={() => handleWhatsApp(followUp)}
                              >
                                <MessageCircle className="w-3 h-3 text-green-600" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-slate-100"
                                title="WhatsApp - No phone number"
                                disabled
                              >
                                <MessageCircle className="w-3 h-3 text-slate-400" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-slate-100"
                              title="Add Note"
                              onClick={() => handleAddNote(followUp)}
                            >
                              <StickyNote className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-slate-100"
                              title="Schedule Callback"
                              onClick={() => handleScheduleCallback(followUp)}
                            >
                              <Calendar className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-slate-100"
                              title="View Details"
                              onClick={() => navigate(`/manager/leads?leadId=${followUp.id}`)}
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                  <MoreHorizontal className="w-3 h-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/manager/leads?leadId=${followUp.id}`)}>
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setSelectedLead(followUp);
                                  navigate(`/manager/leads?leadId=${followUp.id}&edit=true`);
                                }}>
                                  Edit Lead
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteLead(followUp)}
                                  className="text-red-600"
                                >
                                  Delete Lead
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* Add Note Modal */}
        <Dialog open={showNoteModal} onOpenChange={setShowNoteModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Note - {selectedLeadForActivity?.company_name || 'Lead'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="note-text">Note</Label>
                <Textarea
                  id="note-text"
                  placeholder="Enter your note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={4}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowNoteModal(false);
                  setNoteText("");
                  setSelectedLeadForActivity(null);
                }}
                disabled={submittingActivity}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitNote}
                disabled={submittingActivity || !noteText.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {submittingActivity ? "Adding..." : "Add Note"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Schedule Callback Modal */}
        <Dialog open={showCallbackModal} onOpenChange={setShowCallbackModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule Callback - {selectedLeadForActivity?.company_name || 'Lead'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="callback-date">Callback Date *</Label>
                <Input
                  id="callback-date"
                  type="date"
                  value={callbackDate}
                  onChange={(e) => setCallbackDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="mt-1"
                />
                <p className="text-xs text-slate-500 mt-1">Select the date when you need to call back this lead</p>
              </div>
              <div>
                <Label htmlFor="callback-notes">Notes *</Label>
                <Textarea
                  id="callback-notes"
                  placeholder="What did the lead ask? What was discussed? What should you mention when calling back?"
                  value={callbackNotes}
                  onChange={(e) => setCallbackNotes(e.target.value)}
                  rows={4}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCallbackModal(false);
                  setCallbackDate("");
                  setCallbackNotes("");
                  setSelectedLeadForActivity(null);
                }}
                disabled={submittingActivity}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitCallback}
                disabled={submittingActivity || !callbackDate || !callbackNotes.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {submittingActivity ? "Scheduling..." : "Schedule Callback"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* WhatsApp Message Modal */}
        <Dialog open={showWhatsAppModal} onOpenChange={setShowWhatsAppModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-600" />
                Send WhatsApp Message - {selectedLeadForWhatsApp?.company_name || 'Lead'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedLeadForWhatsApp && (() => {
                const phoneNumbers = parsePhoneNumbers(
                  selectedLeadForWhatsApp.contact_phone || 
                  selectedLeadForWhatsApp.phone || 
                  (selectedLeadForWhatsApp as any).mobile_phone
                );
                return (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <p className="text-xs font-semibold text-slate-700 mb-1">To:</p>
                    <p className="text-sm text-slate-900 font-medium">
                      {selectedLeadForWhatsApp.contact_name || 'N/A'}
                    </p>
                    {phoneNumbers.length > 0 && (
                      <p className="text-xs text-slate-600 mt-1">
                        📱 {phoneNumbers[0]}
                        {phoneNumbers.length > 1 && (
                          <span className="text-slate-500 ml-1">
                            (WhatsApp: first of {phoneNumbers.length} numbers)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                );
              })()}
              <div>
                <Label htmlFor="whatsapp-message">Message *</Label>
                <Textarea
                  id="whatsapp-message"
                  placeholder="Enter your WhatsApp message..."
                  value={whatsAppMessage}
                  onChange={(e) => setWhatsAppMessage(e.target.value)}
                  rows={6}
                  className="mt-1 font-medium"
                />
                <p className="text-xs text-slate-500 mt-1">
                  You can customize this message before sending. The message will open in WhatsApp.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowWhatsAppModal(false);
                  setWhatsAppMessage("");
                  setSelectedLeadForWhatsApp(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendWhatsApp}
                disabled={!whatsAppMessage.trim()}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Send via WhatsApp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Email Modal */}
        <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" />
                Send Email - {selectedLeadForEmail?.company_name || 'Lead'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedLeadForEmail && (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-700 mb-1">To:</p>
                  <p className="text-sm text-slate-900 font-medium">
                    {selectedLeadForEmail.contact_email || selectedLeadForEmail.email || 'N/A'}
                  </p>
                </div>
              )}
              <div>
                <Label htmlFor="email-subject">Subject *</Label>
                <Input
                  id="email-subject"
                  placeholder="Email subject..."
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="email-body">Message *</Label>
                <Textarea
                  id="email-body"
                  placeholder="Enter your email message..."
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={6}
                  className="mt-1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  You can customize this message before sending. The email will open in Gmail.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowEmailModal(false);
                  setEmailSubject("");
                  setEmailBody("");
                  setSelectedLeadForEmail(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={!emailSubject.trim() || !emailBody.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Mail className="w-4 h-4 mr-2" />
                Send via Gmail
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default ManagerFollowUps;
