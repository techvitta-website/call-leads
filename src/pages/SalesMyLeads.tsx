import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Phone, Mail, Flame, Loader, Clock, AlertCircle, ChevronDown, ChevronUp, Search, MapPin, Briefcase, Filter as FilterIcon, X, Upload, FileSpreadsheet, StickyNote, Calendar, Download, CalendarCheck, MessageCircle, Eye } from "lucide-react";
import { getLeads, getCurrentUser, updateLead, getUserRole, createBulkLeads, getProjects, subscribeToLeads, createLeadActivity, getActivitiesForLead, subscribeToLeadActivities } from "@/lib/supabase";
import { formatCurrency, formatCurrencyCompact } from "@/utils/currency";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Role as UserRole } from "@/lib/roles";

const stageColors: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  qualified: "bg-indigo-50 text-indigo-700 border-indigo-200",
  proposal: "bg-amber-50 text-amber-700 border-amber-200",
  closed_won: "bg-emerald-50 text-emerald-700 border-emerald-200",
  not_interested: "bg-rose-50 text-rose-700 border-rose-200",
};

const scoreColors: Record<string, string> = {
  hot: "bg-rose-100 text-rose-700 border-rose-200",
  warm: "bg-amber-100 text-amber-700 border-amber-200",
  cold: "bg-slate-100 text-slate-600 border-slate-200",
};

const SalesMyLeads = () => {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const navigate = useNavigate();
  
  // Bulk import states
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedImportProject, setSelectedImportProject] = useState<string>("");
  const [projects, setProjects] = useState<any[]>([]);
  const [currentSalesmanId, setCurrentSalesmanId] = useState<string | null>(null);
  
// Note, Callback, WhatsApp, Email modals
const [showNoteModal, setShowNoteModal] = useState(false);
const [showCallbackModal, setShowCallbackModal] = useState(false);
const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
const [showEmailModal, setShowEmailModal] = useState(false);
const [selectedLeadForActivity, setSelectedLeadForActivity] = useState<any | null>(null);
const [selectedLeadForWhatsApp, setSelectedLeadForWhatsApp] = useState<any | null>(null);
const [selectedLeadForEmail, setSelectedLeadForEmail] = useState<any | null>(null);
const [noteText, setNoteText] = useState("");
const [callbackDate, setCallbackDate] = useState("");
const [callbackNotes, setCallbackNotes] = useState("");
const [whatsAppMessage, setWhatsAppMessage] = useState("");
const [emailSubject, setEmailSubject] = useState("");
const [emailBody, setEmailBody] = useState("");
const [submittingActivity, setSubmittingActivity] = useState(false);
  
  // Details modal state
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [leadActivities, setLeadActivities] = useState<any[]>([]);
  
  // Track note counts for each lead
  const [leadNoteCounts, setLeadNoteCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          navigate('/', { replace: true });
          return;
        }

        // Use centralized role check - always gets fresh data from DB
        const userRole = await getUserRole(user.id);
        
        if (!userRole || userRole !== 'salesman') {
          const roleRoutes: Record<string, string> = { owner: '/owner', manager: '/manager' };
          navigate(roleRoutes[userRole as UserRole] || '/', { replace: true });
          return;
        }

        setCurrentSalesmanId(user.id);
        const { data } = await getLeads(user ? { assignedTo: user.id } : undefined);
        setLeads(data || []);
        
        // Load note counts for all leads
        if (data && data.length > 0) {
          const noteCounts: Record<string, number> = {};
          await Promise.all(
            data.map(async (lead: any) => {
              try {
                const { data: activities } = await getActivitiesForLead(lead.id);
                const notes = (activities || []).filter((a: any) => 
                  String((a.activity_type || a.type || 'note')).toLowerCase() === 'note'
                );
                noteCounts[lead.id] = notes.length;
              } catch (error) {
                noteCounts[lead.id] = 0;
              }
            })
          );
          setLeadNoteCounts(noteCounts);
        }
        
        // Load projects for bulk import
        const projectsRes = await getProjects();
        setProjects(projectsRes.data || []);
      } catch (error) {
        console.error("Error loading my leads", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    
    // Subscribe to realtime changes
    const subscription = subscribeToLeads(async () => {
      try {
        const user = await getCurrentUser();
        if (user) {
          const { data } = await getLeads(user ? { assignedTo: user.id } : undefined);
          setLeads(data || []);
          
          // Refresh note counts for all leads
          if (data && data.length > 0) {
            const noteCounts: Record<string, number> = {};
            await Promise.all(
              data.map(async (lead: any) => {
                try {
                  const { data: activities } = await getActivitiesForLead(lead.id);
                  const notes = (activities || []).filter((a: any) => 
                    String((a.activity_type || a.type || 'note')).toLowerCase() === 'note'
                  );
                  noteCounts[lead.id] = notes.length;
                } catch (error) {
                  noteCounts[lead.id] = 0;
                }
              })
            );
            setLeadNoteCounts(noteCounts);
          }
        }
      } catch (error) {
        // Silently handle error
      }
    });
    
    return () => {
      try {
        subscription?.unsubscribe?.();
      } catch {}
    };
  }, [navigate]);

  // If a leadId is present in the URL, open that lead's modal when data is available
  useEffect(() => {
    const paramId = searchParams.get("leadId");
    if (!paramId || !leads?.length) return;
    const found = leads.find((l) => String(l.id) === String(paramId));
    if (found) {
      setSelectedLead(found);
      setShowDetailsModal(true);
    }
  }, [searchParams, leads]);

  // Load activities for the selected lead when viewing details
  useEffect(() => {
    if (!selectedLead || !showDetailsModal) return;

    let cleanup: (() => void) | undefined;

    const load = async () => {
      try {
        const { data } = await getActivitiesForLead(selectedLead.id);
        setLeadActivities(data || []);
      } catch (e) {
        console.error("Error loading activities", e);
      }
    };

    load();

    const sub = subscribeToLeadActivities(selectedLead.id, async () => {
      try {
        const { data } = await getActivitiesForLead(selectedLead.id);
        setLeadActivities(data || []);
      } catch (e) {
        console.error("Error loading activities", e);
      }
    });
    cleanup = () => { try { sub.unsubscribe?.(); } catch {} };

    return () => { cleanup?.(); };
  }, [selectedLead, showDetailsModal]);

  const totalValue = useMemo(() => leads.reduce((s, l) => s + (l.value || 0), 0), [leads]);

  const [projectFilter, setProjectFilter] = useState<string>("all");

  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      const projectName = l.projects?.name || "Unassigned";
      set.add(projectName);
    });
    return ["all", ...Array.from(set)];
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Search filter
      const matchesSearch = searchQuery === "" || 
        lead.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (lead.location || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      // Status filter
      const matchesStatus = statusFilter === "all" || (lead.status || "new").toLowerCase() === statusFilter;
      
      // Project filter
      const projectName = lead.projects?.name || "Unassigned";
      const matchesProject = projectFilter === "all" || projectName === projectFilter;
      
      // Source filter (simulated - you can add source field to database)
      const leadSource = lead.source || "Direct";
      const matchesSource = sourceFilter === "all" || leadSource === sourceFilter;
      
      // Priority filter (based on lead_score)
      const priority = (lead.lead_score || "warm").toLowerCase();
      const matchesPriority = priorityFilter === "all" || priority === priorityFilter;
      
      return matchesSearch && matchesStatus && matchesProject && matchesSource && matchesPriority;
    });
  }, [leads, projectFilter, searchQuery, statusFilter, sourceFilter, priorityFilter]);

  const stats = useMemo(() => {
    const hotLeads = filteredLeads.filter((l) => (l.lead_score || "warm").toLowerCase() === "hot");
    const closedWon = filteredLeads.filter((l) => (l.status || "").toLowerCase() === "closed_won");
    const winRate = filteredLeads.length ? Math.round((closedWon.length / filteredLeads.length) * 100) : 0;
    const value = filteredLeads.reduce((s, l) => s + (l.value || 0), 0);
    return {
      total: filteredLeads.length,
      value,
      hot: hotLeads.length,
      winRate,
    };
  }, [filteredLeads]);

  const statusLabel: Record<string, string> = {
    new: "New",
    qualified: "Qualified",
    proposal: "Proposal",
    closed_won: "Closed Won",
    not_interested: "Not Interested",
  };

  // Helpers for contact actions
  const parsePhoneNumbers = (phoneString: string | null | undefined): string[] => {
    if (!phoneString) return [];
    return String(phoneString)
      .split(/[,;|\n\r]+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 7 && p.length <= 20 && /[0-9+]/.test(p));
  };

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

  const getWhatsAppMessage = (lead: any) => {
    let messageTemplate = "";
    if ((lead as any).whatsapp_message) {
      messageTemplate = (lead as any).whatsapp_message;
    } else {
      const project = projects.find((p) => p.id === lead.project_id);
      if (project && (project as any).whatsapp_message) {
        messageTemplate = (project as any).whatsapp_message;
      } else {
        const companyName = lead.company_name || "there";
        const contactName = lead.contact_name || "";
        return `Hello${contactName ? ` ${contactName}` : ""}, I hope this message finds you well. I wanted to reach out regarding ${companyName}. Would you be available for a quick conversation?`;
      }
    }
    const companyName = lead.company_name || "";
    const contactName = lead.contact_name || "";
    const projectName = projects.find((p) => p.id === lead.project_id)?.name || "";
    return messageTemplate
      .replace(/{company_name}/g, companyName)
      .replace(/{contact_name}/g, contactName)
      .replace(/{project_name}/g, projectName);
  };

  const handleWhatsApp = (lead: any) => {
    const phoneNumbers = parsePhoneNumbers(lead.contact_phone || lead.phone || (lead as any).mobile_phone);
    const validPhones = phoneNumbers.map(formatPhoneForWhatsApp).filter((p): p is string => Boolean(p));
    if (validPhones.length === 0) {
      alert("No phone number available for this lead");
      return;
    }
    setSelectedLeadForWhatsApp(lead);
    setWhatsAppMessage(getWhatsAppMessage(lead));
    setShowWhatsAppModal(true);
  };

  const handleSendWhatsApp = () => {
    if (!selectedLeadForWhatsApp || !whatsAppMessage.trim()) {
      alert("Please enter a message");
      return;
    }
    const phoneNumbers = parsePhoneNumbers(
      selectedLeadForWhatsApp.contact_phone ||
        selectedLeadForWhatsApp.phone ||
        (selectedLeadForWhatsApp as any).mobile_phone
    );
    const validPhones = phoneNumbers.map(formatPhoneForWhatsApp).filter((p): p is string => Boolean(p));
    if (validPhones.length === 0) {
      alert("No phone number available for this lead");
      return;
    }
    const message = encodeURIComponent(whatsAppMessage.trim());
    // When there are two numbers, use the first number as WhatsApp number
    const formattedPhone = validPhones[0];
    window.open(`https://wa.me/${formattedPhone}?text=${message}`, "_blank");
    setShowWhatsAppModal(false);
    setWhatsAppMessage("");
    setSelectedLeadForWhatsApp(null);
  };

  const getEmailDefaults = (lead: any) => {
    const companyName = lead.company_name || "";
    const contactName = lead.contact_name || "";
    const projectName = projects.find((p) => p.id === lead.project_id)?.name || "";
    const defaultSubject = `Quick follow-up - ${companyName || projectName || "your project"}`;
    const defaultBody = `Hi${contactName ? ` ${contactName}` : ""},\n\nI hope you're doing well. I wanted to follow up regarding ${
      companyName || projectName || "our discussion"
    }. Please let me know a good time to connect.\n\nThanks,\n`;
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
      
      // Update last_contacted_at for the lead
      await updateLead(selectedLeadForActivity.id, {
        last_contacted_at: new Date().toISOString(),
      });
      
      // Refresh leads and keep selection in sync
      const user = await getCurrentUser();
      if (user) {
        const { data } = await getLeads(user ? { assignedTo: user.id } : undefined);
        const updatedLeads = data || [];
        setLeads(updatedLeads);
        const updated = updatedLeads.find((l) => l.id === selectedLeadForActivity.id);
        if (updated) {
          setSelectedLeadForActivity(updated);
          // If details modal is open for this lead, refresh activities
          if (selectedLead && selectedLead.id === selectedLeadForActivity.id) {
            const { data: activitiesData } = await getActivitiesForLead(selectedLead.id);
            setLeadActivities(activitiesData || []);
          }
          
          // Update note count for this lead
          try {
            const { data: activitiesData } = await getActivitiesForLead(selectedLeadForActivity.id);
            const notes = (activitiesData || []).filter((a: any) => 
              String((a.activity_type || a.type || 'note')).toLowerCase() === 'note'
            );
            setLeadNoteCounts(prev => ({
              ...prev,
              [selectedLeadForActivity.id]: notes.length
            }));
          } catch (error) {
            console.error("Error updating note count", error);
          }
        }
      }
      
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
      
      // Refresh leads and keep selection in sync
      const user = await getCurrentUser();
      if (user) {
        const { data } = await getLeads(user ? { assignedTo: user.id } : undefined);
        const updatedLeads = data || [];
        setLeads(updatedLeads);
        const updated = updatedLeads.find((l) => l.id === selectedLeadForActivity.id);
        if (updated) {
          setSelectedLeadForActivity(updated);
        }
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

  // Export leads to Excel
  const handleExportToExcel = () => {
    if (filteredLeads.length === 0) {
      alert("No leads to export.");
      return;
    }

    // Prepare data for export
    const exportData = filteredLeads.map((lead) => {
      const phoneNumbers = (() => {
        const phone = lead.phone || lead.contact_phone || "";
        if (!phone) return "";
        return String(phone).split(/[,;|\n\r]+/).map(p => p.trim()).filter(p => p).join(", ");
      })();

      return {
        "Company Name": lead.company_name || "",
        "Contact Name": lead.contact_name || "",
        "Designation": (lead as any).designation || "",
        "Email": lead.email || "",
        "Phone": phoneNumbers || "",
        "Mobile Phone": (lead as any).mobile_phone || "",
        "Direct Phone": (lead as any).direct_phone || "",
        "Office Phone": (lead as any).office_phone || "",
        "LinkedIn": (lead as any).linkedin || "",
        "Address Line 1": (lead as any).address_line1 || "",
        "Address Line 2": (lead as any).address_line2 || "",
        "City": (lead as any).city || "",
        "State": (lead as any).state || "",
        "Country": (lead as any).country || "",
        "Zip": (lead as any).zip || "",
        "Status": statusLabel[lead.status] || lead.status || "",
        "Value": lead.value || 0,
        "Project": lead.projects?.name || "Unassigned",
        "Customer Group": (lead as any).customer_group || "",
        "Product Group": (lead as any).product_group || "",
        "Lead Source": (lead as any).lead_source || "",
        "Data Source": (lead as any).data_source || "",
        "Lead Score": (lead as any).lead_score || "",
        "Next Follow-up Date": (lead as any).next_followup_date ? new Date((lead as any).next_followup_date).toLocaleDateString() : "",
        "Follow-up Notes": (lead as any).followup_notes || "",
        "Lead Notes": (lead as any).lead_notes || "",
        "Organization Notes": (lead as any).organization_notes || "",
        "Date of Birth": (lead as any).date_of_birth || "",
        "Special Event Date": (lead as any).special_event_date || "",
        "Reference URL 1": (lead as any).reference_url1 || "",
        "Reference URL 2": (lead as any).reference_url2 || "",
        "Reference URL 3": (lead as any).reference_url3 || "",
        "List Name": (lead as any).list_name || "",
        "Description": lead.description || "",
        "Website": lead.link || "",
        "Created At": lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "",
        "Last Contacted": lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString() : "",
      };
    });

    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");

    // Generate filename with current date
    const filename = `leads_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);
  };

  // Handle Excel file upload and parsing
  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        
        if (jsonData.length < 2) {
          setImportMessage({ type: "error", text: "Excel file must have at least a header row and one data row." });
          return;
        }

        const headers = jsonData[0].map((h: any) => String(h || "").trim()).filter((h: string) => h);
        const rows = jsonData.slice(1).filter((row: any[]) => row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ""));
        
        // Convert rows to objects
        const parsedData = rows.map((row: any[]) => {
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] !== undefined ? String(row[index] || "").trim() : "";
          });
          return obj;
        });

        setExcelHeaders(headers);
        setExcelData(parsedData);
        setImportMessage(null);
      } catch (error) {
        setImportMessage({ type: "error", text: "Failed to parse Excel file. Please ensure it's a valid .xlsx or .xls file." });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Handle bulk import
  const handleBulkImport = async () => {
    if (!selectedImportProject) {
      setImportMessage({ type: "error", text: "Please select a project first." });
      return;
    }

    if (!currentSalesmanId) {
      setImportMessage({ type: "error", text: "User not found. Please refresh the page." });
      return;
    }

    if (excelData.length === 0) {
      setImportMessage({ type: "error", text: "No data to import. Please upload a valid Excel file." });
      return;
    }

    // Helper function to find ALL phone numbers from row (supports multiple phone numbers)
    const findAllPhoneNumbers = (row: any): string[] => {
      const phoneNumbers: string[] = [];
      const phoneVariations = [
        "Phone", "phone", "PHONE",
        "Phone Number", "phone number", "PhoneNumber", "phone_number", "PHONE_NUMBER",
        "Contact Phone", "contact phone", "ContactPhone", "contact_phone", "CONTACT_PHONE",
        "Mobile", "mobile", "MOBILE",
        "Mobile Number", "mobile number", "MobileNumber", "mobile_number", "MOBILE_NUMBER",
        "Cell", "cell", "CELL",
        "Cell Phone", "cell phone", "CellPhone", "cell_phone", "CELL_PHONE",
        "Tel", "tel", "TEL",
        "Telephone", "telephone", "TELEPHONE",
        "Contact Number", "contact number", "ContactNumber", "contact_number", "CONTACT_NUMBER",
        "Phone No", "phone no", "PhoneNo", "phone_no", "PHONE_NO",
        "Mobile No", "mobile no", "MobileNo", "mobile_no", "MOBILE_NO",
        "Contact No", "contact no", "ContactNo", "contact_no", "CONTACT_NO",
        "Ph", "ph", "PH",
        "Mob", "mob", "MOB",
        "Phno", "phno", "PHNO", "PhNo", "Ph No", "ph no",
        "Phone_Number", "phone_number",
        "Contact_Phone", "contact_phone",
        "Mobile_Number", "mobile_number",
        "Tel No", "tel no", "TelNo", "tel_no",
        "Phone#", "phone#", "PHONE#",
        "Contact#", "contact#", "CONTACT#",
        "Number", "number", "NUMBER",
        "No", "no", "NO",
        "Phone 1", "phone 1", "Phone1", "phone1",
        "Phone 2", "phone 2", "Phone2", "phone2",
        "Mobile 1", "mobile 1", "Mobile1", "mobile1",
        "Mobile 2", "mobile 2", "Mobile2", "mobile2",
      ];

      // Helper to parse and add phone number
      const addPhoneNumber = (value: any) => {
        if (value === null || value === undefined) return;
        
        let phoneValue: string;
        if (typeof value === 'number') {
          phoneValue = String(value);
        } else {
          phoneValue = String(value).trim();
        }
        
        if (!phoneValue || phoneValue === "null" || phoneValue === "undefined" || phoneValue === "") return;
        
        const separators = /[,;|\n\r]+/;
        if (separators.test(phoneValue)) {
          const numbers = phoneValue.split(separators).map(n => n.trim()).filter(n => n.length > 0);
          numbers.forEach(num => {
            if (num.length >= 6 && num.length <= 25 && /\d/.test(num)) {
              if (!phoneNumbers.includes(num)) phoneNumbers.push(num);
            }
          });
        } else {
          if (phoneValue.length >= 6 && phoneValue.length <= 25 && /\d/.test(phoneValue)) {
            if (!phoneNumbers.includes(phoneValue)) phoneNumbers.push(phoneValue);
          }
        }
      };

      // First try exact matches from known variations
      for (const variation of phoneVariations) {
        if (row[variation] !== undefined && row[variation] !== null) {
          addPhoneNumber(row[variation]);
        }
      }

      // Then try case-insensitive search through all keys
      const rowKeys = Object.keys(row);
      for (const key of rowKeys) {
        const lowerKey = key.toLowerCase().replace(/[_\s-]/g, '');
        if (lowerKey.includes('phone') || 
            lowerKey.includes('phno') || 
            lowerKey.includes('mobile') || 
            lowerKey.includes('cell') || 
            lowerKey.includes('tel') || 
            (lowerKey.includes('contact') && (lowerKey.includes('no') || lowerKey.includes('num'))) ||
            (lowerKey.includes('number') && (lowerKey.includes('contact') || lowerKey.includes('phone') || lowerKey.includes('mobile'))) ||
            (lowerKey === 'ph' || lowerKey === 'phno' || lowerKey === 'phonenumber')) {
          if (row[key] !== undefined && row[key] !== null) {
            addPhoneNumber(row[key]);
          }
        }
      }

      // Last resort: check all columns for values that look like phone numbers
      for (const key of rowKeys) {
        const rawValue = row[key];
        if (rawValue !== undefined && rawValue !== null) {
          const value = String(rawValue).trim();
          if (value && /[\d\+\-\(\)\s]{7,}/.test(value) && value.length >= 7 && value.length <= 20) {
            if (!phoneNumbers.includes(value)) {
              phoneNumbers.push(value);
            }
          }
        }
      }

      return phoneNumbers;
    };

    // Helper function to find email from row with many variations
    const findEmail = (row: any): string => {
      const emailVariations = [
        "Email", "email", "EMAIL",
        "E-mail", "e-mail", "E-MAIL",
        "Contact Email", "contact email", "ContactEmail", "contact_email", "CONTACT_EMAIL",
        "Email Address", "email address", "EmailAddress", "email_address", "EMAIL_ADDRESS",
        "Contact Email Address", "contact email address", "ContactEmailAddress", "contact_email_address",
        "Mail", "mail", "MAIL",
        "Email Id", "email id", "EmailId", "email_id",
      ];

      // First try exact matches
      for (const variation of emailVariations) {
        if (row[variation] !== undefined && row[variation] !== null && String(row[variation]).trim() !== "") {
          return String(row[variation]).trim();
        }
      }

      // Then try case-insensitive search through all keys
      const rowKeys = Object.keys(row);
      for (const key of rowKeys) {
        const lowerKey = key.toLowerCase().replace(/[_\s-]/g, '');
        if (lowerKey.includes('email') || lowerKey.includes('mail')) {
          const value = String(row[key] || '').trim();
          if (value && value.includes('@')) {
            return value;
          }
        }
      }

      return "";
    };

    // Map Excel columns to lead fields (flexible mapping)
    const leadsToImport = excelData.map((row: any) => {
      // Try to find company name in various column names
      const companyName = row["Company Name"] || row["Company"] || row["company_name"] || row["CompanyName"] || 
                         row["COMPANY"] || row["company"] || Object.values(row)[0] || "";
      
      if (!companyName || companyName.trim() === "") {
        return null; // Skip rows without company name
      }

      // Extract ALL phone numbers using comprehensive search
      const phoneNumbers = findAllPhoneNumbers(row);
      const phoneValue = phoneNumbers.length > 0 ? phoneNumbers.join(', ') : undefined;
      
      // Extract email using comprehensive search
      const emailValue = findEmail(row);

      const leadData = {
        company_name: String(companyName).trim(),
        contact_name: (row["Contact Name"] || row["Contact"] || row["contact_name"] || row["ContactName"] || 
                     row["CONTACT"] || row["contact"] || row["Name"] || row["name"] || "").toString().trim(),
        email: emailValue || undefined,
        phone: phoneValue || undefined,
        project_id: selectedImportProject,
        assigned_to: currentSalesmanId, // Automatically assign to current salesman
        description: (row["Description"] || row["description"] || row["Notes"] || row["notes"] || row["Note"] || row["note"] || "").toString().trim() || undefined,
        link: (row["Link"] || row["link"] || row["Website"] || row["website"] || row["URL"] || row["url"] || "").toString().trim() || undefined,
        value: (() => {
          const val = row["Value"] || row["value"] || row["Deal Value"] || row["deal_value"] || row["Amount"] || row["amount"] || 0;
          const numVal = typeof val === "string" ? parseFloat(val.replace(/[^0-9.-]/g, "")) : Number(val);
          return isNaN(numVal) ? 0 : numVal;
        })(),
      };

      return leadData;
    }).filter((lead: any) => lead !== null);

    if (leadsToImport.length === 0) {
      setImportMessage({ type: "error", text: "No valid leads found. Please ensure your Excel file has a 'Company Name' or 'Company' column." });
      return;
    }

    setImporting(true);
    setImportMessage(null);

    try {
      const result = await createBulkLeads(leadsToImport);
      if (result.error) {
        setImportMessage({ type: "error", text: result.error.message || "Failed to import leads." });
      } else {
        setImportMessage({ type: "success", text: `Successfully imported ${leadsToImport.length} lead(s).` });
        // Refresh leads
        const user = await getCurrentUser();
        if (user) {
          const { data } = await getLeads(user ? { assignedTo: user.id } : undefined);
          setLeads(data || []);
        }
        // Reset form after success
        setTimeout(() => {
          setShowBulkImportModal(false);
          setExcelData([]);
          setExcelHeaders([]);
          setSelectedImportProject("");
          setImportMessage(null);
        }, 2000);
      }
    } catch (error: any) {
      setImportMessage({ type: "error", text: error.message || "Failed to import leads." });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <DashboardSidebar role="salesman" />
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center text-slate-300 flex flex-col items-center gap-3">
              <Loader className="w-10 h-10 animate-spin text-orange-400" />
              <span>Loading leads...</span>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">My Leads</h1>
                  <p className="text-sm text-slate-600 mt-0.5">Track and manage your pipeline</p>
                </div>
                <Badge className="bg-slate-900 text-white border-transparent px-3 py-1.5 text-sm font-semibold">
                  {formatCurrency(totalValue)}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <Card className="p-3 bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs font-medium text-slate-500 mb-1">Total Leads</div>
                <div className="text-xl font-bold text-slate-900">{stats.total}</div>
              </Card>
              <Card className="p-3 bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs font-medium text-slate-500 mb-1">Pipeline Value</div>
                <div className="text-xl font-bold text-slate-900">{formatCurrency(stats.value)}</div>
              </Card>
              <Card className="p-3 bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs font-medium text-slate-500 mb-1">Hot Leads</div>
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-rose-600" />
                  <div className="text-xl font-bold text-slate-900">{stats.hot}</div>
                </div>
              </Card>
              <Card className="p-3 bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-xs font-medium text-slate-500 mb-1">Win Rate</div>
                <div className="text-xl font-bold text-slate-900">{stats.winRate}%</div>
              </Card>
            </div>

            {/* Search and Action Bar */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 mb-5">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="relative flex-1 w-full sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    placeholder="Search leads by name, company, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-9 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {/* Advanced Filter Dropdown */}
                  <DropdownMenu open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
                    <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9"
                >
                  <FilterIcon className="w-4 h-4" />
                        Advanced Filters
                        {(statusFilter !== "all" || sourceFilter !== "all" || priorityFilter !== "all" || projectFilter !== "all") && (
                    <Badge className="bg-indigo-100 text-indigo-700 border-0 text-xs px-1.5 py-0.5 ml-1">Active</Badge>
                  )}
                        <ChevronDown className="w-3.5 h-3.5" />
                </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 p-3">
                      <div className="space-y-3">
                  {/* Status Filter */}
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1.5 block">Status</label>
                          <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="All Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Status</SelectItem>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="qualified">Qualified</SelectItem>
                              <SelectItem value="proposal">Proposal</SelectItem>
                              <SelectItem value="closed_won">Closed Won</SelectItem>
                              <SelectItem value="not_interested">Not Interested</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Project Filter */}
                        <div>
                          <label className="text-xs font-medium text-slate-700 mb-1.5 block">Project</label>
                          <Select value={projectFilter} onValueChange={setProjectFilter}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="All Projects" />
                            </SelectTrigger>
                            <SelectContent>
                              {projectOptions.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt === "all" ? "All Projects" : opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                  </div>

                  {/* Source Filter */}
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1.5 block">Lead Source</label>
                          <Select value={sourceFilter} onValueChange={setSourceFilter}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="All Sources" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Sources</SelectItem>
                              <SelectItem value="Direct">Direct</SelectItem>
                              <SelectItem value="Referral">Referral</SelectItem>
                              <SelectItem value="Website">Website</SelectItem>
                              <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                              <SelectItem value="Cold Call">Cold Call</SelectItem>
                              <SelectItem value="Event">Event</SelectItem>
                            </SelectContent>
                          </Select>
                  </div>

                  {/* Priority Filter */}
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1.5 block">Priority</label>
                          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="All Priorities" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Priorities</SelectItem>
                              <SelectItem value="hot">Hot</SelectItem>
                              <SelectItem value="warm">Warm</SelectItem>
                              <SelectItem value="cold">Cold</SelectItem>
                            </SelectContent>
                          </Select>
                  </div>

                  {/* Clear Filters */}
                        <div className="pt-2 border-t border-slate-200">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchQuery("");
                        setStatusFilter("all");
                        setSourceFilter("all");
                        setPriorityFilter("all");
                        setProjectFilter("all");
                              setShowAdvancedFilters(false);
                      }}
                            className="w-full h-8 text-xs gap-2"
                    >
                      <X className="w-3.5 h-3.5" />
                            Clear All Filters
                    </Button>
                  </div>
                </div>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Export to Excel Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportToExcel}
                    className="gap-2 h-9"
                    disabled={filteredLeads.length === 0}
                  >
                    <Download className="w-4 h-4" />
                    Export Excel
                  </Button>

                  {/* Follow-ups Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/sales/follow-ups')}
                    className="gap-2 h-9 bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
                  >
                    <CalendarCheck className="w-4 h-4" />
                    Follow-ups
                  </Button>

                  {/* Bulk Import Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBulkImportModal(true)}
                    className="gap-2 h-9"
                  >
                    <Upload className="w-4 h-4" />
                    Bulk Import
                  </Button>
                </div>
              </div>
            </div>

            {/* Leads Table */}
            <Card className="p-3 sm:p-6 bg-white border-slate-200">
              {filteredLeads.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-500">No leads found. Add leads using the 'Bulk Import' button.</p>
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
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Value</th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
              {filteredLeads.map((lead) => {
                const stageKey = (lead.status || "new").toLowerCase();
                const projectName = lead.projects?.name || "Unassigned";
                        const phoneNumbers = (() => {
                          const phone = lead.phone || lead.contact_phone || "";
                          if (!phone) return [];
                          return String(phone).split(/[,;|\n\r]+/).map(p => p.trim()).filter(p => p);
                        })();
                const needsAttention = lead.last_contacted_at
                  ? (Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24) > 7
                  : true;
                const lastTouch = lead.last_contacted_at
                  ? formatDistanceToNow(new Date(lead.last_contacted_at), { addSuffix: true })
                  : "Never";
                return (
                          <>
                            <tr key={lead.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${leadNoteCounts[lead.id] > 0 ? 'bg-blue-50/30' : ''}`}>
                              <td className="py-3 px-3">
                                <div className="flex items-start gap-3">
                                  <Avatar className="w-8 h-8 ring-1 ring-slate-200">
                                    <AvatarFallback className="bg-slate-900 text-white font-semibold text-xs">
                              {(lead.company_name || "?").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <div className="text-sm font-semibold text-slate-900">{lead.company_name || "Unknown"}</div>
                                      {leadNoteCounts[lead.id] > 0 && (
                                        <div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium border border-blue-200">
                                          <StickyNote className="w-3 h-3" />
                                          <span>{leadNoteCounts[lead.id]}</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-600">{lead.contact_name || "No contact"}</div>
                            </div>
                          </div>
                              </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="border-slate-300 text-slate-700 text-xs">
                                {projectName}
                        </Badge>
                            </td>
                            <td className="py-3 px-3">
                              <div className="space-y-1">
                                {lead.email && (
                                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                    <Mail className="w-3 h-3 text-slate-400" />
                                    <a href={`mailto:${lead.email}`} className="hover:text-blue-600 hover:underline">
                                      {lead.email}
                                    </a>
                      </div>
                                )}
                                {phoneNumbers.length > 0 && (
                                  <div className="flex items-center gap-1.5">
                                    {phoneNumbers.length === 1 ? (
                                      <a href={`tel:${phoneNumbers[0]}`} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600">
                                        <Phone className="w-3 h-3 text-slate-400" />
                                        <span>{phoneNumbers[0]}</span>
                                      </a>
                                    ) : (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-600 hover:text-blue-600">
                                            <Phone className="w-3 h-3 mr-1" />
                                            {phoneNumbers.length} numbers
                                            <ChevronDown className="w-3 h-3 ml-1" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start">
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
                                    )}
                                  </div>
                                )}
                                {!lead.email && phoneNumbers.length === 0 && (
                                  <span className="text-xs text-slate-400">-</span>
                                )}
                                {/* Note / Callback / Not Interested badges */}
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {lead.followup_notes && (
                                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0.5">
                                      Note
                          </Badge>
                        )}
                                  {lead.next_followup_date && new Date(lead.next_followup_date) > new Date() && (
                                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0.5">
                                      Callback {new Date(lead.next_followup_date).toLocaleDateString()}
                          </Badge>
                        )}
                                  {(lead.status || "").toLowerCase() === "not_interested" && (
                                    <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] px-1.5 py-0.5">
                                      Not Interested
                        </Badge>
                                  )}
                      </div>
                                {(lead.followup_notes || lead.lead_notes) && (
                                  <div className="text-[11px] text-slate-500 line-clamp-2">
                                    {(lead.followup_notes || lead.lead_notes || "").slice(0, 80)}
                                    {(lead.followup_notes || lead.lead_notes || "").length > 80 ? "…" : ""}
                          </div>
                                )}
                          </div>
                            </td>
                            <td className="py-3 px-3">
                              <Badge className={`${stageColors[stageKey] || stageColors.new} border text-xs font-medium px-2 py-0.5`}>
                                {statusLabel[stageKey] || stageKey.replace("_", " ")}
                              </Badge>
                            </td>
                            <td className="py-3 px-3">
                              <div className="text-sm font-semibold text-slate-900">
                                {formatCurrency(lead.value || 0)}
                        </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                {/* Phone */}
                                {phoneNumbers.length > 0 ? (
                                  phoneNumbers.length === 1 ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 w-7 p-0 hover:bg-slate-100"
                                      title={`Call ${phoneNumbers[0]}`}
                                      onClick={() => window.location.href = `tel:${phoneNumbers[0]}`}
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                    </Button>
                                  ) : (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 hover:bg-slate-100">
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
                                  )
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-7 p-0 hover:bg-slate-100"
                                    title="No phone number"
                                    disabled
                                  >
                                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                                  </Button>
                                )}

                                {/* Email */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-slate-100"
                                  title="Email"
                                  onClick={() => handleEmail(lead)}
                                  disabled={!lead.email && !lead.contact_email}
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                </Button>

                                {/* WhatsApp */}
                                {phoneNumbers.length > 0 ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-7 p-0 hover:bg-green-100"
                                    title="WhatsApp"
                                    onClick={() => handleWhatsApp(lead)}
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    title="WhatsApp - No phone number"
                                    disabled
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-slate-400" />
                                  </Button>
                                )}

                                {/* Note */}
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

                                {/* Callback */}
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

                                {/* View details */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 hover:bg-slate-100 text-xs"
                                  title="View Details"
                                  onClick={() => {
                                    setSelectedLead(lead);
                                    setShowDetailsModal(true);
                                    setSearchParams({ leadId: lead.id });
                                  }}
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1" />
                                  View
                                </Button>
                              </div>
                            </td>
                          </tr>
                        </>
                        );
                      })}
                    </tbody>
                  </table>
                      </div>
              )}
            </Card>
          </>
        )}
        
        {/* Bulk Import Modal */}
        <Dialog open={showBulkImportModal} onOpenChange={setShowBulkImportModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bulk Import Leads from Excel</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* File Upload */}
              <div>
                <Label>Upload Excel File (.xlsx, .xls)</Label>
                <div className="mt-2 border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                  <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-400 mb-2" />
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelFile}
                    className="hidden"
                    id="excel-upload"
                  />
                  <label
                    htmlFor="excel-upload"
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Choose File
                  </label>
                  <p className="text-xs text-slate-500 mt-2">
                    Supported formats: .xlsx, .xls
                  </p>
                </div>
              </div>

              {/* Project Selection */}
              {projects.length > 0 && (
                <div>
                  <Label>Select Project *</Label>
                  <Select value={selectedImportProject} onValueChange={setSelectedImportProject}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                      </div>
                    )}

              {/* Import Message */}
              {importMessage && (
                <Alert className={importMessage.type === "error" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
                  <AlertDescription className={importMessage.type === "error" ? "text-red-600" : "text-green-600"}>
                    {importMessage.text}
                  </AlertDescription>
                </Alert>
              )}

              {/* Preview Table */}
              {excelData.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Preview ({excelData.length} rows found)</Label>
                    <Badge variant="outline">{excelHeaders.length} columns detected</Badge>
            </div>
                  
                  <div className="border border-slate-200 rounded-lg overflow-auto max-h-64">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          {excelHeaders.map((header, idx) => (
                            <th key={idx} className="text-left py-2 px-3 font-medium text-xs text-slate-700 border-b border-slate-200">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {excelData.slice(0, 10).map((row, rowIdx) => (
                          <tr key={rowIdx} className="border-b border-slate-100 hover:bg-slate-50">
                            {excelHeaders.map((header, colIdx) => (
                              <td key={colIdx} className="py-2 px-3 text-xs text-slate-600">
                                {row[header] || "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {excelData.length > 10 && (
                      <div className="text-xs text-slate-500 p-2 text-center">
                        Showing first 10 of {excelData.length} rows
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowBulkImportModal(false);
                  setExcelData([]);
                  setExcelHeaders([]);
                  setSelectedImportProject("");
                  setImportMessage(null);
                }}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkImport}
                disabled={importing || excelData.length === 0 || !selectedImportProject}
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                {importing ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import Leads
          </>
        )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Note Modal */}
        <Dialog open={showNoteModal} onOpenChange={setShowNoteModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Note - {selectedLeadForActivity?.company_name || 'Lead'}</DialogTitle>
              <DialogDescription>Add a note about this lead</DialogDescription>
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
                className="bg-slate-900 hover:bg-slate-800 text-white"
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
              <DialogDescription>Set a callback date and add notes about what was discussed</DialogDescription>
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
                <p className="text-xs text-slate-500 mt-1">Add notes about what was discussed and what to mention during the callback</p>
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
                className="bg-slate-900 hover:bg-slate-800 text-white"
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

        {/* Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={(open) => {
          setShowDetailsModal(open);
          if (!open) {
            setSelectedLead(null);
            setSearchParams({});
          }
        }}>
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
                      <p className="text-sm font-medium text-foreground mt-1">
                        <Badge className={stageColors[selectedLead.status] || "bg-slate-100 text-slate-700 border-slate-200"}>
                          {selectedLead.status || "new"}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">Value</Label>
                      <p className="text-sm font-medium text-foreground mt-1">{formatCurrencyCompact(selectedLead.value || 0)}</p>
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
                          <p className="text-sm font-medium text-foreground mt-1 whitespace-pre-wrap">{(selectedLead as any).followup_notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Description */}
                {selectedLead.description && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 mb-2">Description</h4>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedLead.description}</p>
                  </div>
                )}

                {/* Link */}
                {selectedLead.link && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 mb-2">Link</h4>
                    <p className="text-sm">
                      <a href={selectedLead.link.startsWith('http') ? selectedLead.link : `https://${selectedLead.link}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                        {selectedLead.link}
                      </a>
                    </p>
                  </div>
                )}

                {/* Activity Notes Section */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <StickyNote className="w-4 h-4" />
                    Activity Notes ({(() => {
                      const notes = (leadActivities || []).filter((a: any) => String((a.activity_type || a.type || 'note')).toLowerCase() === 'note');
                      return notes.length;
                    })()})
                  </h4>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                    {(() => {
                      const notes = (leadActivities || []).filter((a: any) => String((a.activity_type || a.type || 'note')).toLowerCase() === 'note');
                      if (notes.length === 0) {
                        return (
                          <div className="bg-slate-50 p-4 rounded-lg text-center border border-slate-200 border-dashed">
                            <p className="text-slate-500 text-sm">✍️ No notes added yet. Add notes using the Note button.</p>
                          </div>
                        );
                      }
                      return notes.map((a: any, idx: number) => (
                        <div key={a.id || idx} className="bg-slate-50 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition-all">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <span className="text-sm font-semibold text-slate-900">Note</span>
                            <span className="text-xs text-slate-600 whitespace-nowrap bg-white px-2 py-1 rounded border border-slate-200">
                              {new Date(a.created_at).toLocaleString()}
                            </span>
                          </div>
                          {a.description && (
                            <p className="text-slate-700 text-sm leading-relaxed break-words whitespace-pre-wrap">{a.description}</p>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowDetailsModal(false);
                setSelectedLead(null);
                setSearchParams({});
              }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default SalesMyLeads;


