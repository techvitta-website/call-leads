import { formatCurrencyCompact } from "@/utils/currency";
import { Search, Filter, ChevronDown, Phone, MessageSquare, MoreHorizontal, Loader, X, Clock, TrendingUp, AlertCircle, MessageCircle, StickyNote, Calendar, Mail } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { getLeads, getCurrentUser, supabase, subscribeToLeads, createActivity, updateLead, createLeadActivity } from "@/lib/supabase";

interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  status: "new" | "qualified" | "proposal" | "closed_won" | "not_interested";
  value: number;
  assigned_to?: string;
  projects?: { name: string; deadline?: string };
  project_id?: string;
  last_contacted_at?: string;
}

const SalesmanLeadsTable = () => {

      // Helper to render a badge for each status
      function getStatusBadge(status: string) {
        const statusMap: Record<string, { label: string; color: string }> = {
          new: { label: 'New', color: 'bg-blue-100 text-blue-800' },
          qualified: { label: 'Qualified', color: 'bg-purple-100 text-purple-800' },
          proposal: { label: 'Proposal', color: 'bg-amber-100 text-amber-800' },
          closed_won: { label: 'Closed', color: 'bg-emerald-100 text-emerald-800' },
          not_interested: { label: 'Archived', color: 'bg-slate-100 text-slate-800' },
        };
        const s = statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
        return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>{s.label}</span>;
      }

      // Helper to check if lead needs attention (not contacted in last 7 days)
      function getNeedsAttention(lead: Lead): boolean {
        if (!lead.last_contacted_at) return true;
        const daysSinceContact = Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceContact > 7;
      }
    useEffect(() => {
      let isMounted = true;
      const fetchLeads = async () => {
        setLoading(true);
        try {
          const user = await getCurrentUser();
          if (!user) {
            setLeads([]);
            setLoading(false);
            return;
          }
          const { data, error } = await getLeads({ assignedTo: user.id });
          if (error) {
            console.error("Error fetching leads:", error);
            setLeads([]);
          } else if (isMounted) {
            setLeads(data || []);
            // Calculate project stats and unique projects for filters
            const stats: any[] = [];
            const projectsSet = new Set<string>();
            (data || []).forEach((lead: any) => {
              if (lead.projects?.name) projectsSet.add(lead.projects.name);
            });
            setUniqueProjects(Array.from(projectsSet));
            // Example: group by project name for stats
            const grouped: Record<string, { name: string; count: number; value: number; needsAttention: number }> = {};
            (data || []).forEach((lead: any) => {
              const name = lead.projects?.name || 'No Project';
              if (!grouped[name]) grouped[name] = { name, count: 0, value: 0, needsAttention: 0 };
              grouped[name].count++;
              grouped[name].value += lead.value || 0;
              if (lead.status === 'new' || lead.status === 'proposal') grouped[name].needsAttention++;
            });
            setProjectStats(Object.values(grouped));
          }
        } catch (err) {
          setLeads([]);
        } finally {
          if (isMounted) setLoading(false);
        }
      };
      fetchLeads();
      
      // Subscribe to realtime changes
      const subscription = subscribeToLeads(async () => {
        if (isMounted) {
          const user = await getCurrentUser();
          if (user) {
            const { data } = await getLeads({ assignedTo: user.id });
            if (isMounted) {
              setLeads(data || []);
              // Recalculate stats
              const projectsSet = new Set<string>();
              (data || []).forEach((lead: any) => {
                if (lead.projects?.name) projectsSet.add(lead.projects.name);
              });
              setUniqueProjects(Array.from(projectsSet));
              const grouped: Record<string, { name: string; count: number; value: number; needsAttention: number }> = {};
              (data || []).forEach((lead: any) => {
                const name = lead.projects?.name || 'No Project';
                if (!grouped[name]) grouped[name] = { name, count: 0, value: 0, needsAttention: 0 };
                grouped[name].count++;
                grouped[name].value += lead.value || 0;
                if (lead.status === 'new' || lead.status === 'proposal') grouped[name].needsAttention++;
              });
              setProjectStats(Object.values(grouped));
            }
          }
        }
      });
      
      return () => { 
        isMounted = false;
        try {
          subscription?.unsubscribe?.();
        } catch {}
      };
    }, []);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupByProject, setGroupByProject] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editingStatus, setEditingStatus] = useState<string>("new");
  const [editingValue, setEditingValue] = useState<string>("0");
  const [updateMessage, setUpdateMessage] = useState<{ type: string; text: string } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [noteText, setNoteText] = useState("");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [selectedLeadForWhatsApp, setSelectedLeadForWhatsApp] = useState<Lead | null>(null);
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedLeadForEmail, setSelectedLeadForEmail] = useState<Lead | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [updateLoadingId, setUpdateLoadingId] = useState<string | null>(null);
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [editingValueInput, setEditingValueInput] = useState<string>("0");
  const [projectStats, setProjectStats] = useState<any[]>([]);
  const [uniqueProjects, setUniqueProjects] = useState<string[]>([]);
  const [selectedLeadForActivity, setSelectedLeadForActivity] = useState<Lead | null>(null);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackNotes, setCallbackNotes] = useState("");
  const [submittingActivity, setSubmittingActivity] = useState(false);

  // ...existing useEffect and logic...

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = lead.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.contact_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    let matchesProject = true;
    if (projectFilter !== "all") {
      matchesProject = lead.projects?.name === projectFilter;
    }
    return matchesSearch && matchesStatus && matchesProject;
  });

  // Sort leads by project if grouping is enabled
  const sortedLeads = groupByProject
    ? [...filteredLeads].sort((a, b) => {
      const projectA = a.projects?.name || 'zzz_no_project';
      const projectB = b.projects?.name || 'zzz_no_project';
      return projectA.localeCompare(projectB);
    })
    : filteredLeads;

  const statusLabel: Record<string, string> = {
    all: "All Status",
    new: "New",
    qualified: "Qualified",
    proposal: "Proposal",
    closed_won: "Closed Won",
    not_interested: "Not Interested",
  };

  const handleChangeStatusClick = (lead: Lead) => {
    setSelectedLead(lead);
    setEditingStatus(lead.status);
    setEditingValue(String(lead.value || 0));
    setEditFormData({
      ...lead,
      value: String(lead.value || 0),
      tags: Array.isArray((lead as any).tags) ? (lead as any).tags.join(', ') : ((lead as any).tags || ''),
    });
    setUpdateMessage(null);
    setShowEditModal(true);
  };

  const handleAddNote = (lead: Lead) => {
    setSelectedLead(lead);
    setNoteText("");
    setUpdateMessage(null);
    setShowNoteModal(true);
  };

  const handleScheduleCallback = (lead: Lead) => {
    setSelectedLeadForActivity(lead);
    setCallbackDate("");
    setCallbackNotes("");
    setShowCallbackModal(true);
  };

  const handleSubmitCallback = async () => {
    if (!selectedLeadForActivity || !callbackDate || !callbackNotes.trim()) {
      alert("Please provide both date and notes for the callback");
      return;
    }
    
    setSubmittingActivity(true);
    try {
      // Create activity with callback information
      await createLeadActivity({
        lead_id: selectedLeadForActivity.id,
        type: 'note',
        description: `Callback scheduled for ${new Date(callbackDate).toLocaleDateString()}. Notes: ${callbackNotes.trim()}`,
      });
      
      // Update lead with callback date and notes
      const callbackDateTime = new Date(callbackDate);
      callbackDateTime.setHours(9, 0, 0, 0); // Set to 9 AM by default
      
      await updateLead(selectedLeadForActivity.id, {
        next_followup_date: callbackDateTime.toISOString(),
        followup_notes: callbackNotes.trim(),
        last_contacted_at: new Date().toISOString(),
      });
      
      // Refresh leads
      const user = await getCurrentUser();
      if (user) {
        const { data } = await getLeads({ assignedTo: user.id });
        setLeads(data || []);
      }
      
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

  const handleViewDetails = (lead: Lead) => {
    setSelectedLead(lead);
    setShowDetailsModal(true);
  };

  const handleEditClick = (lead: Lead) => {
    setSelectedLead(lead);
    setEditingStatus(lead.status);
    setEditingValue(String(lead.value || 0));
    setEditFormData({
      ...lead,
      value: String(lead.value || 0),
      tags: Array.isArray((lead as any).tags) ? (lead as any).tags.join(', ') : ((lead as any).tags || ''),
    });
    setUpdateMessage(null);
    setShowEditModal(true);
  };

  // Helper function to parse phone numbers from string (handles comma, semicolon, pipe separated)
  const parsePhoneNumbers = (phoneString: string | null | undefined): string[] => {
    if (!phoneString) return [];
    const phones = String(phoneString)
      .split(/[,;|\n\r]+/)
      .map(p => p.trim())
      .filter(p => p.length >= 7 && p.length <= 20 && /[\d\+\-\(\)\s]{7,}/.test(p));
    return [...new Set(phones)]; // Remove duplicates
  };

  const handleCallLead = (lead: Lead) => {
    const phoneNumbers = parsePhoneNumbers((lead as any).contact_phone || (lead as any).phone);
    if (phoneNumbers.length === 0) {
      alert('No phone number available for this lead');
    } else if (phoneNumbers.length === 1) {
      window.location.href = `tel:${phoneNumbers[0]}`;
    } else {
      // If multiple numbers, show first one (dropdown will be handled in UI)
      window.location.href = `tel:${phoneNumbers[0]}`;
    }
  };

  const handleMessageLead = (lead: Lead) => {
    const email = (lead as any).contact_email || (lead as any).email || '';
    if (!email) {
      alert('No email address available for this lead');
      return;
    }
    setSelectedLeadForEmail(lead);
    const { subject, body } = getEmailDefaults(lead);
    setEmailSubject(subject);
    setEmailBody(body);
    setShowEmailModal(true);
  };

  // Format phone for WhatsApp (reuse logic from leads pages)
  const formatPhoneForWhatsApp = (phone: string): string | null => {
    if (!phone) return null;
    
    // Step 1: Remove all non-digit characters (keep only digits)
    let cleaned = phone.replace(/[^\d]/g, "");
    
    // Step 2: Handle international prefixes
    // Remove + sign (already removed in step 1, but handle if present in original)
    // Handle 00 prefix (international dialing code)
    if (cleaned.startsWith("00")) {
      cleaned = cleaned.slice(2);
    }
    
    // Step 3: Remove ALL leading zeros - WhatsApp requires no leading zeros
    // Country codes start with 1-9, never 0
    cleaned = cleaned.replace(/^0+/, "");
    
    // Step 4: Validate length (E.164 standard: 1-15 digits)
    // Minimum: 7 digits (some small countries)
    // Maximum: 15 digits (E.164 standard)
    if (cleaned.length < 7 || cleaned.length > 15) {
      return null;
    }
    
    // Step 5: Ensure it's all digits and doesn't start with 0
    if (!/^\d+$/.test(cleaned) || cleaned.startsWith("0")) {
      return null;
    }
    
    // Step 6: Final check - must start with 1-9 (valid country code)
    // Country codes are 1-3 digits and start with 1-9
    if (!/^[1-9]\d+$/.test(cleaned)) {
      return null;
    }
    
    return cleaned;
  };

  const getWhatsAppDefaults = (lead: Lead) => {
    const contactName = lead.contact_name || "";
    const companyName = lead.company_name || "";
    const message = `Hi${contactName ? ` ${contactName}` : ""}, I hope you're doing well. I wanted to follow up regarding ${companyName}. Is this a good time to talk?`;
    return message;
  };

  const handleWhatsAppQuick = (lead: Lead) => {
    const phoneNumbers = parsePhoneNumbers((lead as any).contact_phone || (lead as any).phone || (lead as any).mobile_phone);
    const validPhones = phoneNumbers
      .map(formatPhoneForWhatsApp)
      .filter((p): p is string => Boolean(p));

    if (validPhones.length === 0) {
      alert("No valid phone number available for WhatsApp");
      return;
    }

    const message = encodeURIComponent(getWhatsAppDefaults(lead));

    const formattedPhone = validPhones[0];
    window.open(`https://wa.me/${formattedPhone}?text=${message}`, "_blank");
  };

  const handleWhatsAppModal = (lead: Lead) => {
    const phoneNumbers = parsePhoneNumbers((lead as any).contact_phone || (lead as any).phone || (lead as any).mobile_phone);
    const validPhones = phoneNumbers
      .map(formatPhoneForWhatsApp)
      .filter((p): p is string => Boolean(p));

    if (validPhones.length === 0) {
      alert("No valid phone number available for WhatsApp");
      return;
    }

    setSelectedLeadForWhatsApp(lead);
    setWhatsAppMessage(getWhatsAppDefaults(lead));
    setShowWhatsAppModal(true);
  };

  const handleSendWhatsApp = () => {
    if (!selectedLeadForWhatsApp || !whatsAppMessage.trim()) {
      alert("Please enter a message");
      return;
    }

    const phoneNumbers = parsePhoneNumbers(
      (selectedLeadForWhatsApp as any).contact_phone ||
      (selectedLeadForWhatsApp as any).phone ||
      (selectedLeadForWhatsApp as any).mobile_phone
    );
    const validPhones = phoneNumbers
      .map(formatPhoneForWhatsApp)
      .filter((p): p is string => Boolean(p));

    if (validPhones.length === 0) {
      const originalPhone = (selectedLeadForWhatsApp as any).contact_phone || (selectedLeadForWhatsApp as any).phone || (selectedLeadForWhatsApp as any).mobile_phone;
      alert(`Invalid phone number format: "${originalPhone}". Please ensure the number includes a country code (e.g., +1 for USA, +91 for India).`);
      return;
    }

    // When there are two numbers, use the first number as WhatsApp number
    const formattedPhone = validPhones[0];
    
    // Double-check the format before opening WhatsApp
    if (!formattedPhone || formattedPhone.length < 7 || formattedPhone.length > 15 || formattedPhone.startsWith("0")) {
      alert(`Invalid phone number format: "${formattedPhone}". Please check the number includes a valid country code.`);
      return;
    }
    
    const message = encodeURIComponent(whatsAppMessage.trim());
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${message}`;
    window.open(whatsappUrl, "_blank");

    setShowWhatsAppModal(false);
    setSelectedLeadForWhatsApp(null);
    setWhatsAppMessage("");
  };

  const getEmailDefaults = (lead: Lead) => {
    const companyName = lead.company_name || "";
    const contactName = lead.contact_name || "";
    const subject = `Quick follow-up - ${companyName || "your project"}`;
    const body = `Hi${contactName ? ` ${contactName}` : ""},\n\nI hope you're doing well. I wanted to follow up regarding ${companyName || "our discussion"}. Please let me know a good time to connect.\n\nThanks,\n`;
    return { subject, body };
  };

  const handleSendEmail = () => {
    if (!selectedLeadForEmail) return;
    const email = (selectedLeadForEmail as any).contact_email || (selectedLeadForEmail as any).email || '';
    if (!email) {
      alert('No email address available for this lead');
      return;
    }
    if (!emailSubject.trim() || !emailBody.trim()) {
      alert("Subject and body are required");
      return;
    }

    const subject = encodeURIComponent(emailSubject.trim());
    const body = encodeURIComponent(emailBody.trim());
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${subject}&body=${body}`;
    window.open(gmailUrl, "_blank");

    setShowEmailModal(false);
    setSelectedLeadForEmail(null);
    setEmailSubject("");
    setEmailBody("");
  };

  const handleUpdateLead = async () => {
    if (!selectedLead || !editFormData) return;
    
    // Validate value
    const valueNum = Number(editFormData.value || editingValue);
    if (isNaN(valueNum) || valueNum < 0) {
      setUpdateMessage({ type: "error", text: "Value must be a valid positive number." });
      return;
    }
    
    setUpdateLoadingId(selectedLead.id);
    setUpdateMessage(null);

    try {
      // Prepare update data with all fields
      const updateData: any = {
        status: editFormData.status || editingStatus,
        value: valueNum,
        company_name: editFormData.company_name,
        contact_name: editFormData.contact_name,
        email: editFormData.email?.trim() || null,
        phone: editFormData.phone?.trim() || null,
        description: editFormData.description?.trim() || null,
        link: editFormData.link?.trim() || null,
        // New comprehensive fields
        designation: editFormData.designation?.trim() || null,
        mobile_phone: editFormData.mobile_phone?.trim() || null,
        direct_phone: editFormData.direct_phone?.trim() || null,
        office_phone: editFormData.office_phone?.trim() || null,
        linkedin: editFormData.linkedin?.trim() || null,
        address_line1: editFormData.address_line1?.trim() || null,
        address_line2: editFormData.address_line2?.trim() || null,
        city: editFormData.city?.trim() || null,
        state: editFormData.state?.trim() || null,
        country: editFormData.country?.trim() || null,
        zip: editFormData.zip?.trim() || null,
        customer_group: editFormData.customer_group?.trim() || null,
        product_group: editFormData.product_group?.trim() || null,
        tags: editFormData.tags ? editFormData.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t) : null,
        lead_source: editFormData.lead_source?.trim() || null,
        data_source: editFormData.data_source?.trim() || null,
        lead_score: editFormData.lead_score !== undefined && editFormData.lead_score !== null ? Number(editFormData.lead_score) : null,
        next_followup_date: editFormData.next_followup_date || null,
        followup_notes: editFormData.followup_notes?.trim() || null,
        repeat_followup: editFormData.repeat_followup || false,
        do_not_followup: editFormData.do_not_followup || false,
        do_not_followup_reason: editFormData.do_not_followup_reason?.trim() || null,
        lead_notes: editFormData.lead_notes?.trim() || null,
        organization_notes: editFormData.organization_notes?.trim() || null,
        date_of_birth: editFormData.date_of_birth || null,
        special_event_date: editFormData.special_event_date || null,
        reference_url1: editFormData.reference_url1?.trim() || null,
        reference_url2: editFormData.reference_url2?.trim() || null,
        reference_url3: editFormData.reference_url3?.trim() || null,
        list_name: editFormData.list_name?.trim() || null,
      };

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", selectedLead.id);

      if (error) {
        setUpdateMessage({ type: "error", text: error.message });
      } else {
        setUpdateMessage({ type: "success", text: "Lead updated successfully!" });
        
        // Update local state with all updated fields
        setLeads(leads.map(lead => 
          lead.id === selectedLead.id 
            ? { ...lead, ...updateData }
            : lead
        ));

        setTimeout(() => {
          setShowEditModal(false);
          setSelectedLead(null);
          setEditFormData(null);
        }, 1500);
      }
    } catch (error: any) {
      setUpdateMessage({ type: "error", text: error.message });
    } finally {
      setUpdateLoadingId(null);
    }
  };

  const handleAddNoteSubmit = async () => {
    if (!selectedLead || !noteText.trim()) {
      alert("Please enter a note");
      return;
    }
    
    setUpdateLoadingId(selectedLead.id);
    setUpdateMessage(null);

    try {
      // Create activity note
      await createLeadActivity({
        lead_id: selectedLead.id,
        type: 'note',
        description: noteText.trim(),
      });
      
      // Update last_contacted_at for the lead
      await updateLead(selectedLead.id, {
        last_contacted_at: new Date().toISOString(),
      });
      
      // Refresh leads
      const user = await getCurrentUser();
      if (user) {
        const { data } = await getLeads({ assignedTo: user.id });
        setLeads(data || []);
      }
      
      setUpdateMessage({ type: "success", text: "Note added successfully!" });
      
      setTimeout(() => {
        setShowNoteModal(false);
        setSelectedLead(null);
        setNoteText("");
      }, 1500);
    } catch (error: any) {
      setUpdateMessage({ type: "error", text: error.message || "Failed to add note. Please try again." });
    } finally {
      setUpdateLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Project Stats Cards */}
      {projectStats.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projectStats.map(stat => (
            <div key={stat.name} className="bg-white rounded-lg shadow-sm p-3 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-900 truncate">{stat.name}</h3>
                {stat.needsAttention > 0 && (
                  <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs px-1.5 py-0.5">
                    {stat.needsAttention} urgent
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="text-xs">{stat.count} leads</span>
                </div>
                <span className="text-sm font-bold text-slate-900">{formatCurrencyCompact(stat.value)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Focus leads section removed */}

      <div className="bg-card rounded-xl shadow-soft p-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-slate-900">My Leads</h2>
          <Button
            variant={groupByProject ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setGroupByProject(!groupByProject)}
          >
            {groupByProject ? "Grouped" : "Group by Project"}
          </Button>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <Input
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 w-full sm:w-56 text-sm"
            />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-8 text-sm px-3">
                <Filter className="w-3.5 h-3.5" />
                {projectFilter === "all" ? "All Projects" : projectFilter}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setProjectFilter("all")}>
                All Projects
              </DropdownMenuItem>
              {uniqueProjects.map(project => (
                <DropdownMenuItem key={project} onClick={() => setProjectFilter(project)}>
                  {project}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-8 text-sm px-3">
                <Filter className="w-3.5 h-3.5" />
                {statusLabel[statusFilter] || "All Status"}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setStatusFilter("all")}>
                All Status
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("new")}>
                New
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("qualified")}>
                Qualified
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("proposal")}>
                Proposal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("closed_won")}>
                Closed Won
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("not_interested")}>
                Not Interested
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader className="w-5 h-5 animate-spin text-slate-900 mr-2" />
          <span className="text-sm text-slate-600">Loading...</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Lead</th>
                <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Project</th>
                <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Contact</th>
                <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Status</th>
                <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Update Status</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-slate-700">Value</th>
                <th className="text-center py-2 px-3 font-medium text-xs text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedLeads.length > 0 ? (
                sortedLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => handleViewDetails(lead)}>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className="bg-slate-100 text-slate-900 text-xs font-medium">
                            {lead.company_name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium text-slate-900">{lead.company_name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      {lead.projects?.name ? (
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs px-2 py-0.5">
                            {lead.projects.name}
                          </Badge>
                          {lead.projects.deadline && new Date(lead.projects.deadline) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && (
                            <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs px-1.5 py-0.5">
                              Due Soon
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No project</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-900">{lead.contact_name}</div>
                          {(lead as any).contact_email || (lead as any).email ? (
                            <div className="text-xs text-slate-500 mt-0.5 truncate">{(lead as any).contact_email || (lead as any).email}</div>
                          ) : null}
                          {(lead as any).contact_phone || (lead as any).phone ? (
                            <div className="text-xs text-slate-500 mt-0.5 truncate">{(lead as any).contact_phone || (lead as any).phone}</div>
                          ) : null}
                        </div>
                        {lead.last_contacted_at && getNeedsAttention(lead) && (
                          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs px-1.5 py-0.5 flex-shrink-0">
                            <Clock className="w-3 h-3 inline mr-0.5" />
                            {Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24))}d
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">{getStatusBadge(lead.status)}</td>
                    <td className="py-2 px-3">
                      <div style={{ position: 'relative' }}>
                        <select
                          className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                          value={lead.status}
                          disabled={updateLoadingId === lead.id}
                          onClick={e => e.stopPropagation()}
                          onChange={async e => {
                            e.stopPropagation();
                            setUpdateLoadingId(lead.id);
                            setUpdateMessage(null);
                            try {
                              const value = e.target.value;
                              const { error } = await supabase
                                .from("leads")
                                .update({ status: value })
                                .eq("id", lead.id);
                              if (error) {
                                setUpdateMessage({ type: "error", text: error.message });
                                return;
                              }
                              setLeads(prevLeads => prevLeads.map(l => l.id === lead.id ? { ...l, status: value as any } : l));
                              setUpdateMessage({ type: "success", text: "Status updated successfully!" });
                            } catch (err) {
                              setUpdateMessage({ type: "error", text: 'Exception: ' + (err?.message || err) });
                              console.error('Update status exception:', err);
                            } finally {
                              setUpdateLoadingId(null);
                            }
                          }}
                        >
                          <option value="new">New</option>
                          <option value="qualified">Qualified</option>
                          <option value="proposal">Proposal</option>
                          <option value="closed_won">Closed Won</option>
                          <option value="not_interested">Not Interested</option>
                        </select>
                        {updateLoadingId === lead.id && (
                          <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}>
                            <Loader className="animate-spin w-4 h-4 text-slate-400" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {editingValueId === lead.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            type="number"
                            value={editingValueInput}
                            onChange={(e) => setEditingValueInput(e.target.value)}
                            onBlur={async () => {
                              const valueNum = Number(editingValueInput);
                              if (isNaN(valueNum) || valueNum < 0) {
                                setEditingValueId(null);
                                return;
                              }
                              setUpdateLoadingId(lead.id);
                              try {
                                const { error } = await supabase
                                  .from("leads")
                                  .update({ value: valueNum })
                                  .eq("id", lead.id);
                                if (!error) {
                                  setLeads(prevLeads => prevLeads.map(l => 
                                    l.id === lead.id ? { ...l, value: valueNum } : l
                                  ));
                                }
                              } catch (err) {
                                console.error("Error updating value:", err);
                              } finally {
                                setEditingValueId(null);
                                setUpdateLoadingId(null);
                              }
                            }}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                const valueNum = Number(editingValueInput);
                                if (isNaN(valueNum) || valueNum < 0) {
                                  setEditingValueId(null);
                                  return;
                                }
                                setUpdateLoadingId(lead.id);
                                try {
                                  const { error } = await supabase
                                    .from("leads")
                                    .update({ value: valueNum })
                                    .eq("id", lead.id);
                                  if (!error) {
                                    setLeads(prevLeads => prevLeads.map(l => 
                                      l.id === lead.id ? { ...l, value: valueNum }
                                      : l
                                    ));
                                  }
                                } catch (err) {
                                  console.error("Error updating value:", err);
                                } finally {
                                  setEditingValueId(null);
                                  setUpdateLoadingId(null);
                                }
                              } else if (e.key === 'Escape') {
                                setEditingValueId(null);
                                setEditingValueInput(String(lead.value || 0));
                              }
                            }}
                            className="w-20 h-7 text-xs text-right"
                            autoFocus
                            min="0"
                            step="0.01"
                          />
                          {updateLoadingId === lead.id && (
                            <Loader className="w-3 h-3 animate-spin text-slate-400" />
                          )}
                        </div>
                      ) : (
                        <span 
                          className="text-xs font-semibold text-slate-900 cursor-pointer hover:text-slate-700 hover:underline"
                          onClick={() => {
                            setEditingValueId(lead.id);
                            setEditingValueInput(String(lead.value || 0));
                          }}
                          title="Click to edit value"
                        >
                      {formatCurrencyCompact(lead.value)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center gap-1">
                        {(() => {
                          const phoneNumbers = parsePhoneNumbers((lead as any).contact_phone || (lead as any).phone);
                          if (phoneNumbers.length === 0) {
                            return (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 hover:bg-slate-100" 
                                title="No phone number"
                                disabled
                              >
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                              </Button>
                            );
                          } else if (phoneNumbers.length === 1) {
                            return (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 hover:bg-slate-100" 
                                title={`Call ${phoneNumbers[0]}`}
                                onClick={() => window.location.href = `tel:${phoneNumbers[0]}`}
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </Button>
                            );
                          } else {
                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 hover:bg-slate-100" 
                                    title={`${phoneNumbers.length} phone numbers - Click to see all`}
                                  >
                                    <Phone className="w-3.5 h-3.5" />
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
                                        <Phone className="w-3.5 h-3.5 text-blue-600" />
                                        <span className="font-medium">{phone}</span>
                                      </a>
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          }
                        })()}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 hover:bg-slate-100" 
                          title="Email"
                          onClick={() => handleMessageLead(lead)}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 hover:bg-green-100"
                          title="WhatsApp"
                          onClick={() => handleWhatsAppModal(lead)}
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 hover:bg-slate-100 text-xs"
                          title="Add Note"
                          onClick={() => handleAddNote(lead)}
                        >
                          <StickyNote className="w-3.5 h-3.5 mr-1" />
                          Note
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 hover:bg-slate-100 text-xs"
                          title="Schedule Callback"
                          onClick={() => handleScheduleCallback(lead)}
                        >
                          <Calendar className="w-3.5 h-3.5 mr-1" />
                          Callback
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditClick(lead)}>Edit Lead</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewDetails(lead)}>View Details</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleChangeStatusClick(lead)}>Change Status</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAddNote(lead)}>Add Note</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                    {loading ? "Loading leads..." : "No leads found. Add leads using the 'Add Lead' or 'Bulk Import' buttons."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* WhatsApp Modal */}
      <Dialog open={showWhatsAppModal} onOpenChange={setShowWhatsAppModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              WhatsApp - {selectedLeadForWhatsApp?.company_name || "Lead"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="whatsapp-message">Message</Label>
              <Textarea
                id="whatsapp-message"
                value={whatsAppMessage}
                onChange={(e) => setWhatsAppMessage(e.target.value)}
                rows={4}
                className="mt-1"
                placeholder="Type your WhatsApp message..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowWhatsAppModal(false);
                setSelectedLeadForWhatsApp(null);
                setWhatsAppMessage("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSendWhatsApp}>
              Send on WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email (Gmail) Modal */}
      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Email - {selectedLeadForEmail?.company_name || "Lead"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="mt-1"
                placeholder="Email subject"
              />
            </div>
            <div>
              <Label htmlFor="email-body">Message</Label>
              <Textarea
                id="email-body"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={5}
                className="mt-1"
                placeholder="Type your email..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowEmailModal(false);
                setSelectedLeadForEmail(null);
                setEmailSubject("");
                setEmailBody("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSendEmail}>
              Open in Gmail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lead Details - {selectedLead?.company_name}</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              {/* Basic Information */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-2">Basic Information</h4>
                <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Company Name</Label>
                <p className="text-sm font-medium text-foreground mt-1">{selectedLead.company_name}</p>
              </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground">Contact Name</Label>
                    <p className="text-sm font-medium text-foreground mt-1">{selectedLead.contact_name}</p>
                  </div>
                  {(selectedLead as any).designation && (
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">Designation</Label>
                      <p className="text-sm font-medium text-foreground mt-1">{(selectedLead as any).designation}</p>
                    </div>
                  )}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Project</Label>
                <p className="text-sm font-medium text-foreground mt-1">
                  {selectedLead.projects?.name ? (
                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200">
                      {selectedLead.projects.name}
                    </Badge>
                  ) : (
                    <span className="text-slate-400">No project assigned</span>
                  )}
                </p>
              </div>
              <div>
                    <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
                    <p className="text-sm font-medium text-foreground mt-1">{statusLabel[selectedLead.status] || selectedLead.status}</p>
              </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground">Value</Label>
                    <p className="text-sm font-medium text-foreground mt-1">{formatCurrencyCompact(selectedLead.value)}</p>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-2">Contact Information</h4>
                <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Email</Label>
                <p className="text-sm font-medium text-foreground mt-1">
                      {selectedLead.contact_email || (selectedLead as any).email ? (
                        <a href={`mailto:${selectedLead.contact_email || (selectedLead as any).email}`} className="text-blue-600 hover:text-blue-800">
                          {selectedLead.contact_email || (selectedLead as any).email}
                        </a>
                      ) : (
                        "N/A"
                      )}
                </p>
              </div>
              <div>
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Phone{(() => {
                        const phones = parsePhoneNumbers(selectedLead.contact_phone || (selectedLead as any).phone);
                        return phones.length > 1 ? ` (${phones.length})` : '';
                      })()}
                    </Label>
                    <div className="text-sm font-medium text-foreground mt-1 space-y-1">
                      {(() => {
                        const phoneNumbers = parsePhoneNumbers(selectedLead.contact_phone || (selectedLead as any).phone);
                        if (phoneNumbers.length === 0) {
                          return <span className="text-slate-400">N/A</span>;
                        }
                        return phoneNumbers.map((phone, idx) => (
                          <a 
                            key={idx}
                            href={`tel:${phone}`} 
                            className="block text-blue-600 hover:text-blue-800"
                          >
                            {phone}
                          </a>
                        ));
                      })()}
                    </div>
                  </div>
                  {(selectedLead as any).mobile_phone && (
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">Mobile Phone</Label>
                <p className="text-sm font-medium text-foreground mt-1">
                        <a href={`tel:${(selectedLead as any).mobile_phone}`} className="text-blue-600 hover:text-blue-800">{(selectedLead as any).mobile_phone}</a>
                </p>
              </div>
                  )}
                  {(selectedLead as any).direct_phone && (
              <div>
                      <Label className="text-xs font-semibold text-muted-foreground">Direct Phone</Label>
                      <p className="text-sm font-medium text-foreground mt-1">
                        <a href={`tel:${(selectedLead as any).direct_phone}`} className="text-blue-600 hover:text-blue-800">{(selectedLead as any).direct_phone}</a>
                      </p>
              </div>
                  )}
                  {(selectedLead as any).office_phone && (
              <div>
                      <Label className="text-xs font-semibold text-muted-foreground">Office Phone</Label>
                      <p className="text-sm font-medium text-foreground mt-1">
                        <a href={`tel:${(selectedLead as any).office_phone}`} className="text-blue-600 hover:text-blue-800">{(selectedLead as any).office_phone}</a>
                      </p>
              </div>
                  )}
                  {(selectedLead as any).linkedin && (
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">LinkedIn</Label>
                      <p className="text-sm font-medium text-foreground mt-1">
                        <a href={(selectedLead as any).linkedin.startsWith('http') ? (selectedLead as any).linkedin : `https://${(selectedLead as any).linkedin}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">View Profile</a>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Address Information */}
              {((selectedLead as any).address_line1 || (selectedLead as any).city || (selectedLead as any).state) && (
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Address</h4>
                  <div className="bg-slate-50 p-3 rounded-lg">
                    {(selectedLead as any).address_line1 && <p className="text-sm text-slate-900">{(selectedLead as any).address_line1}</p>}
                    {(selectedLead as any).address_line2 && <p className="text-sm text-slate-900">{(selectedLead as any).address_line2}</p>}
                    <p className="text-sm text-slate-700">
                      {[
                        (selectedLead as any).city,
                        (selectedLead as any).state,
                        (selectedLead as any).zip,
                        (selectedLead as any).country
                      ].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Classification */}
              {((selectedLead as any).customer_group || (selectedLead as any).product_group || (selectedLead as any).lead_source || (selectedLead as any).lead_score) && (
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Classification</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {(selectedLead as any).customer_group && (
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">Customer Group</Label>
                        <p className="text-sm font-medium text-foreground mt-1">{(selectedLead as any).customer_group}</p>
                      </div>
                    )}
                    {(selectedLead as any).product_group && (
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">Product Group</Label>
                        <p className="text-sm font-medium text-foreground mt-1">{(selectedLead as any).product_group}</p>
                      </div>
                    )}
                    {(selectedLead as any).lead_source && (
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">Lead Source</Label>
                        <p className="text-sm font-medium text-foreground mt-1">{(selectedLead as any).lead_source}</p>
                      </div>
                    )}
                    {(selectedLead as any).lead_score !== undefined && (selectedLead as any).lead_score !== null && (
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">Lead Score</Label>
                        <p className="text-sm font-medium text-foreground mt-1">{(selectedLead as any).lead_score}</p>
                      </div>
                    )}
                    {(selectedLead as any).tags && Array.isArray((selectedLead as any).tags) && (selectedLead as any).tags.length > 0 && (
                      <div className="col-span-2">
                        <Label className="text-xs font-semibold text-muted-foreground">Tags</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {(selectedLead as any).tags.map((tag: string, idx: number) => (
                            <Badge key={idx} variant="outline">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Follow-up Information */}
              {((selectedLead as any).next_followup_date || (selectedLead as any).followup_notes) && (
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Follow-up</h4>
                  <div className="space-y-2">
                    {(selectedLead as any).next_followup_date && (
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">Next Follow-up Date</Label>
                        <p className="text-sm font-medium text-foreground mt-1">{new Date((selectedLead as any).next_followup_date).toLocaleString()}</p>
                      </div>
                    )}
                    {(selectedLead as any).followup_notes && (
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">Follow-up Notes</Label>
                        <p className="text-sm font-medium text-foreground mt-1">{(selectedLead as any).followup_notes}</p>
                      </div>
                    )}
                    {(selectedLead as any).do_not_followup && (
                      <div className="bg-red-50 p-2 rounded">
                        <Label className="text-xs font-semibold text-red-700">Do Not Follow-up</Label>
                        {(selectedLead as any).do_not_followup_reason && (
                          <p className="text-xs text-red-600 mt-1">Reason: {(selectedLead as any).do_not_followup_reason}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Additional Notes */}
              {((selectedLead as any).lead_notes || (selectedLead as any).organization_notes) && (
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Notes</h4>
                  <div className="space-y-2">
                    {(selectedLead as any).lead_notes && (
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">Lead Notes</Label>
                        <p className="text-sm text-slate-700 mt-1">{(selectedLead as any).lead_notes}</p>
                      </div>
                    )}
                    {(selectedLead as any).organization_notes && (
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground">Organization Notes</Label>
                        <p className="text-sm text-slate-700 mt-1">{(selectedLead as any).organization_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lead Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead - {selectedLead?.company_name}</DialogTitle>
            <DialogDescription>
              Update lead information. Use the tabs to navigate between different sections.
            </DialogDescription>
          </DialogHeader>
          {selectedLead && editFormData && (
            <div className="space-y-4">
              {updateMessage && (
                <Alert className={updateMessage.type === "success" ? "bg-success/10 border-success/20" : "bg-destructive/10 border-destructive/20"}>
                  <AlertDescription className={updateMessage.type === "success" ? "text-success" : "text-destructive"}>
                    {updateMessage.text}
                  </AlertDescription>
                </Alert>
              )}
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="contact">Contact</TabsTrigger>
                  <TabsTrigger value="address">Address</TabsTrigger>
                  <TabsTrigger value="classification">Classification</TabsTrigger>
                  <TabsTrigger value="followup">Follow-up</TabsTrigger>
                </TabsList>
                
                {/* Basic Information Tab */}
                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
              <div>
                      <Label htmlFor="edit-company">Company Name *</Label>
                      <Input
                        id="edit-company"
                        value={editFormData.company_name || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, company_name: e.target.value })}
                        placeholder="Acme Corp"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-contact">Contact Name *</Label>
                      <Input
                        id="edit-contact"
                        value={editFormData.contact_name || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, contact_name: e.target.value })}
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-designation">Designation / Title</Label>
                      <Input
                        id="edit-designation"
                        value={editFormData.designation || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                        placeholder="CEO, Manager, etc."
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-status">Status</Label>
                <select
                        id="edit-status"
                        value={editFormData.status || editingStatus}
                        onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground"
                >
                  <option value="new">New</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="closed_won">Closed Won</option>
                  <option value="not_interested">Not Interested</option>
                </select>
              </div>
                    <div>
                      <Label htmlFor="edit-value">Value (₹) *</Label>
                      <Input
                        id="edit-value"
                        type="number"
                        value={editFormData.value || editingValue}
                        onChange={(e) => setEditFormData({ ...editFormData, value: e.target.value })}
                        placeholder="Enter lead value"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-list-name">List Name</Label>
                      <Input
                        id="edit-list-name"
                        value={editFormData.list_name || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, list_name: e.target.value })}
                        placeholder="List name"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="edit-link">Company Website / Link</Label>
                      <Input
                        id="edit-link"
                        type="url"
                        value={editFormData.link || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, link: e.target.value })}
                        placeholder="https://example.com"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="edit-description">Description / Notes</Label>
                      <Textarea
                        id="edit-description"
                        value={editFormData.description || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                        placeholder="Add any additional notes..."
                        rows={3}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Contact Information Tab */}
                <TabsContent value="contact" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-email">Email</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editFormData.email || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        placeholder="john@acme.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-phone">Phone (Primary)</Label>
                      <Input
                        id="edit-phone"
                        value={editFormData.phone || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                        placeholder="+1-555-0000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-mobile-phone">Mobile Phone</Label>
                      <Input
                        id="edit-mobile-phone"
                        value={editFormData.mobile_phone || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, mobile_phone: e.target.value })}
                        placeholder="+1-555-0000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-direct-phone">Direct Phone</Label>
                      <Input
                        id="edit-direct-phone"
                        value={editFormData.direct_phone || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, direct_phone: e.target.value })}
                        placeholder="+1-555-0000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-office-phone">Office Phone</Label>
                      <Input
                        id="edit-office-phone"
                        value={editFormData.office_phone || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, office_phone: e.target.value })}
                        placeholder="+1-555-0000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-linkedin">LinkedIn</Label>
                      <Input
                        id="edit-linkedin"
                        type="url"
                        value={editFormData.linkedin || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, linkedin: e.target.value })}
                        placeholder="https://linkedin.com/in/..."
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Address Information Tab */}
                <TabsContent value="address" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="edit-address-line1">Address Line 1</Label>
                      <Input
                        id="edit-address-line1"
                        value={editFormData.address_line1 || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, address_line1: e.target.value })}
                        placeholder="Street address"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="edit-address-line2">Address Line 2</Label>
                      <Input
                        id="edit-address-line2"
                        value={editFormData.address_line2 || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, address_line2: e.target.value })}
                        placeholder="Apartment, suite, etc."
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-city">City</Label>
                      <Input
                        id="edit-city"
                        value={editFormData.city || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-state">State</Label>
                      <Input
                        id="edit-state"
                        value={editFormData.state || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                        placeholder="State"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-zip">Zip / Postal Code</Label>
                      <Input
                        id="edit-zip"
                        value={editFormData.zip || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, zip: e.target.value })}
                        placeholder="12345"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-country">Country</Label>
                      <Input
                        id="edit-country"
                        value={editFormData.country || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, country: e.target.value })}
                        placeholder="Country"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Classification Tab */}
                <TabsContent value="classification" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-customer-group">Customer Group</Label>
                      <Input
                        id="edit-customer-group"
                        value={editFormData.customer_group || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, customer_group: e.target.value })}
                        placeholder="Customer group"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-product-group">Product Group</Label>
                      <Input
                        id="edit-product-group"
                        value={editFormData.product_group || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, product_group: e.target.value })}
                        placeholder="Product group"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-lead-source">Lead Source</Label>
                      <Input
                        id="edit-lead-source"
                        value={editFormData.lead_source || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, lead_source: e.target.value })}
                        placeholder="Website, LinkedIn, Referral, etc."
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-data-source">Data Source</Label>
                      <Input
                        id="edit-data-source"
                        value={editFormData.data_source || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, data_source: e.target.value })}
                        placeholder="Data source"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-lead-score">Lead Score (0-100)</Label>
                      <Input
                        id="edit-lead-score"
                        type="number"
                        min="0"
                        max="100"
                        value={editFormData.lead_score || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, lead_score: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="0"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
                      <Input
                        id="edit-tags"
                        value={editFormData.tags || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, tags: e.target.value })}
                        placeholder="tag1, tag2, tag3"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="edit-lead-notes">Lead Notes</Label>
                      <Textarea
                        id="edit-lead-notes"
                        value={editFormData.lead_notes || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, lead_notes: e.target.value })}
                        placeholder="Additional notes about the lead..."
                        rows={3}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="edit-organization-notes">Organization Notes</Label>
                      <Textarea
                        id="edit-organization-notes"
                        value={editFormData.organization_notes || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, organization_notes: e.target.value })}
                        placeholder="Notes about the organization..."
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-date-of-birth">Date of Birth</Label>
                      <Input
                        id="edit-date-of-birth"
                        type="date"
                        value={editFormData.date_of_birth || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, date_of_birth: e.target.value || null })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-special-event-date">Special Event Date</Label>
                      <Input
                        id="edit-special-event-date"
                        type="date"
                        value={editFormData.special_event_date || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, special_event_date: e.target.value || null })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-reference-url1">Reference URL 1</Label>
                      <Input
                        id="edit-reference-url1"
                        type="url"
                        value={editFormData.reference_url1 || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, reference_url1: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-reference-url2">Reference URL 2</Label>
                      <Input
                        id="edit-reference-url2"
                        type="url"
                        value={editFormData.reference_url2 || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, reference_url2: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-reference-url3">Reference URL 3</Label>
                      <Input
                        id="edit-reference-url3"
                        type="url"
                        value={editFormData.reference_url3 || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, reference_url3: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Follow-up Tab */}
                <TabsContent value="followup" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-next-followup-date">Next Follow-up Date</Label>
                      <Input
                        id="edit-next-followup-date"
                        type="datetime-local"
                        value={editFormData.next_followup_date ? new Date(editFormData.next_followup_date).toISOString().slice(0, 16) : ''}
                        onChange={(e) => setEditFormData({ ...editFormData, next_followup_date: e.target.value || null })}
                      />
                    </div>
                    <div className="flex items-end gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="edit-repeat-followup"
                          checked={editFormData.repeat_followup || false}
                          onCheckedChange={(checked) => setEditFormData({ ...editFormData, repeat_followup: checked as boolean })}
                        />
                        <Label htmlFor="edit-repeat-followup" className="cursor-pointer">Repeat Follow-up</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="edit-do-not-followup"
                          checked={editFormData.do_not_followup || false}
                          onCheckedChange={(checked) => setEditFormData({ ...editFormData, do_not_followup: checked as boolean })}
                        />
                        <Label htmlFor="edit-do-not-followup" className="cursor-pointer">Do Not Follow-up</Label>
                      </div>
                    </div>
                    {editFormData.do_not_followup && (
                      <div className="col-span-2">
                        <Label htmlFor="edit-do-not-followup-reason">Do Not Follow-up Reason</Label>
                        <Input
                          id="edit-do-not-followup-reason"
                          value={editFormData.do_not_followup_reason || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, do_not_followup_reason: e.target.value })}
                          placeholder="Reason for not following up"
                        />
                      </div>
                    )}
                    <div className="col-span-2">
                      <Label htmlFor="edit-followup-notes">Follow-up Notes</Label>
                      <Textarea
                        id="edit-followup-notes"
                        value={editFormData.followup_notes || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, followup_notes: e.target.value })}
                        placeholder="Notes for follow-up..."
                        rows={3}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowEditModal(false);
                setEditFormData(null);
              }}
              disabled={updateLoadingId === selectedLead?.id}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateLead}
              disabled={updateLoadingId === selectedLead?.id}
            >
              {updateLoadingId === selectedLead?.id ? "Updating..." : "Update Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Modal */}
      <Dialog open={showNoteModal} onOpenChange={setShowNoteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Note - {selectedLead?.company_name}</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              {updateMessage && (
                <Alert className={updateMessage.type === "success" ? "bg-success/10 border-success/20" : "bg-destructive/10 border-destructive/20"}>
                  <AlertDescription className={updateMessage.type === "success" ? "text-success" : "text-destructive"}>
                    {updateMessage.text}
                  </AlertDescription>
                </Alert>
              )}
              
              <div>
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  placeholder="Enter your note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground"
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowNoteModal(false)}
              disabled={updateLoadingId === selectedLead?.id}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddNoteSubmit}
              disabled={updateLoadingId === selectedLead?.id}
            >
              {updateLoadingId === selectedLead?.id ? "Adding..." : "Add Note"}
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
          {selectedLeadForActivity && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="callback-date">Callback Date & Time</Label>
                <Input
                  id="callback-date"
                  type="datetime-local"
                  value={callbackDate}
                  onChange={(e) => setCallbackDate(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="callback-notes">Notes</Label>
                <Textarea
                  id="callback-notes"
                  placeholder="Enter callback notes..."
                  value={callbackNotes}
                  onChange={(e) => setCallbackNotes(e.target.value)}
                  rows={4}
                  className="mt-1"
                  required
                />
              </div>
            </div>
          )}
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
            >
              {submittingActivity ? "Scheduling..." : "Schedule Callback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default SalesmanLeadsTable;

