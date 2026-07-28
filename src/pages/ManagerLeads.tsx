import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Loader, CheckCircle, Clock, XCircle, AlertCircle, Filter, Search, Mail, Phone as PhoneIcon, Briefcase, Upload, FileSpreadsheet, UserPlus, MoreHorizontal, Edit, Trash2, ChevronDown, Download, X, StickyNote, Calendar, MessageCircle, CalendarCheck, Sparkles } from "lucide-react";
import AILeadGenerationDialog from "@/components/AILeadGenerationDialog";
import AILeadScoringDialog from "@/components/AILeadScoringDialog";
import WhatsAppSender from "@/components/WhatsAppSender";
import WhatsAppGroupImport from "@/components/WhatsAppGroupImport";
import { exportLeadsToExcel } from "@/lib/exportExcel";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLeads, getCurrentUser, getUsers, createLead, updateLead, getProjects, deleteLead, testConnection, subscribeToUsers, subscribeToLeads, getActivitiesForLead, subscribeToLeadActivities, createBulkLeads, createLeadActivity } from "@/lib/supabase";
import { formatCurrency, formatCurrencyCompact } from "@/utils/currency";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Helper function to parse phone numbers from string (handles comma, semicolon, pipe separated)
const parsePhoneNumbers = (phoneString: string | null | undefined): string[] => {
  if (!phoneString) return [];
  const phones = String(phoneString)
    .split(/[,;|\n\r]+/)
    .map(p => p.trim())
    .filter(p => p.length >= 7 && p.length <= 20 && /[\d\+\-\(\)\s]{7,}/.test(p));
  return [...new Set(phones)]; // Remove duplicates
};

/**
 * Single source of truth for a blank Add-Lead form.
 * Both reset paths (Cancel and post-create) spread this, so adding a field
 * here can never leave one of them stale.
 */
const EMPTY_LEAD_FORM = {
  project_id: "",
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  value: "",
  assigned_to: "",
  status: "new" as "new" | "qualified" | "proposal" | "closed_won" | "not_interested",
  description: "",
  link: "",
  designation: "",
  mobile_phone: "",
  direct_phone: "",
  office_phone: "",
  linkedin: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  country: "",
  zip: "",
  customer_group: "",
  product_group: "",
  tags: "",
  lead_source: "",
  data_source: "",
  lead_score: "",
  next_followup_date: "",
  followup_notes: "",
  repeat_followup: false,
  do_not_followup: false,
  do_not_followup_reason: "",
  lead_notes: "",
  organization_notes: "",
  date_of_birth: "",
  special_event_date: "",
  reference_url1: "",
  reference_url2: "",
  reference_url3: "",
  list_name: "",
  priority: "medium",
  software_category: "",
  industry: "",
};

const ManagerLeads = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [salesUsers, setSalesUsers] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [softwareCategoryFilter, setSoftwareCategoryFilter] = useState<string>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [valueMin, setValueMin] = useState<string>("");
  const [valueMax, setValueMax] = useState<string>("");
  const [scoreMin, setScoreMin] = useState<string>("");
  const [scoreMax, setScoreMax] = useState<string>("");
  const [followupAfter, setFollowupAfter] = useState<string>("");
  const [followupBefore, setFollowupBefore] = useState<string>("");
  const [doNotFollowupOnly, setDoNotFollowupOnly] = useState<boolean>(false);
  const [hasTags, setHasTags] = useState<boolean>(false);
  const [tagQuery, setTagQuery] = useState<string>("");
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [leadActivities, setLeadActivities] = useState<any[]>([]);
  
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
  const [editLeadForm, setEditLeadForm] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [editMessage, setEditMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
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
  const [leadNoteCounts, setLeadNoteCounts] = useState<Record<string, number>>({});
  
  // Helper function to load note counts for leads
  const loadNoteCounts = async (leadsToCheck: any[]) => {
    if (!leadsToCheck || leadsToCheck.length === 0) return;
    const noteCounts: Record<string, number> = {};
    await Promise.all(
      leadsToCheck.map(async (lead: any) => {
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
    setLeadNoteCounts(prev => ({ ...prev, ...noteCounts }));
  };
  
    // Open Edit Lead modal with selected lead's data
    const openEditLeadModal = () => {
      if (!selectedLead) return;
      setEditLeadForm({ ...selectedLead, value: String(selectedLead.value ?? "") });
      setEditMessage(null);
      setShowEditLeadModal(true);
    };

    // Handle Edit Lead form submission
    const handleEditLead = async () => {
      setEditMessage(null);
      if (!editLeadForm.company_name || !editLeadForm.contact_name) {
        setEditMessage({ type: "error", text: "Company and contact are required." });
        return;
      }
      const valueNum =
        editLeadForm.value === "" || editLeadForm.value === null || editLeadForm.value === undefined
          ? 0
          : Number(editLeadForm.value);
      if (isNaN(valueNum) || valueNum < 0) {
        setEditMessage({ type: "error", text: "Value must be zero or a positive number." });
        return;
      }
      setEditing(true);
      try {
        await updateLead(editLeadForm.id, {
          company_name: editLeadForm.company_name,
          contact_name: editLeadForm.contact_name,
          email: editLeadForm.email?.trim() || null,
          phone: editLeadForm.phone?.trim() || null,
          status: editLeadForm.status,
          value: valueNum,
          assigned_to: editLeadForm.assigned_to || null,
          description: editLeadForm.description,
          link: editLeadForm.link,
          // New comprehensive fields
          designation: editLeadForm.designation?.trim() || null,
          mobile_phone: editLeadForm.mobile_phone?.trim() || null,
          direct_phone: editLeadForm.direct_phone?.trim() || null,
          office_phone: editLeadForm.office_phone?.trim() || null,
          linkedin: editLeadForm.linkedin?.trim() || null,
          address_line1: editLeadForm.address_line1?.trim() || null,
          address_line2: editLeadForm.address_line2?.trim() || null,
          city: editLeadForm.city?.trim() || null,
          state: editLeadForm.state?.trim() || null,
          country: editLeadForm.country?.trim() || null,
          zip: editLeadForm.zip?.trim() || null,
          customer_group: editLeadForm.customer_group?.trim() || null,
          product_group: editLeadForm.product_group?.trim() || null,
          tags: Array.isArray(editLeadForm.tags) ? editLeadForm.tags : null,
          lead_source: editLeadForm.lead_source?.trim() || null,
          data_source: editLeadForm.data_source?.trim() || null,
          lead_score: editLeadForm.lead_score !== undefined && editLeadForm.lead_score !== null ? Number(editLeadForm.lead_score) : null,
          next_followup_date: editLeadForm.next_followup_date || null,
          followup_notes: editLeadForm.followup_notes?.trim() || null,
          repeat_followup: editLeadForm.repeat_followup || false,
          do_not_followup: editLeadForm.do_not_followup || false,
          do_not_followup_reason: editLeadForm.do_not_followup_reason?.trim() || null,
          lead_notes: editLeadForm.lead_notes?.trim() || null,
          organization_notes: editLeadForm.organization_notes?.trim() || null,
          date_of_birth: editLeadForm.date_of_birth || null,
          special_event_date: editLeadForm.special_event_date || null,
          reference_url1: editLeadForm.reference_url1?.trim() || null,
          reference_url2: editLeadForm.reference_url2?.trim() || null,
          reference_url3: editLeadForm.reference_url3?.trim() || null,
          list_name: editLeadForm.list_name?.trim() || null,
        });
        setEditMessage({ type: "success", text: "Lead updated successfully." });
        // Refresh leads after update
        const leadsRes = await getLeads();
        setLeads(leadsRes.data || []);
        setTimeout(() => {
          setShowEditLeadModal(false);
          setEditLeadForm(null);
          setEditMessage(null);
        }, 1200);
      } catch (err: any) {
        setEditMessage({ type: "error", text: err.message || "Failed to update lead." });
      } finally {
        setEditing(false);
      }
    };
  const [leadForm, setLeadForm] = useState({ ...EMPTY_LEAD_FORM });
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [assigningLead, setAssigningLead] = useState<string | null>(null);
  
  // Bulk assign states
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkAssignSalesman, setBulkAssignSalesman] = useState<string>("");
  
  // Bulk delete states
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showAILeadDialog, setShowAILeadDialog] = useState(false);
  const [showScoringDialog, setShowScoringDialog] = useState(false);
  const [aiScores, setAiScores] = useState<Record<string, number>>({});
  const [showWAGroupImport, setShowWAGroupImport] = useState(false);
  
  // Bulk import states
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedImportProject, setSelectedImportProject] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Test Supabase connection first
        const connectionTest = await testConnection();
        if (!connectionTest.success) {
          setLoading(false);
          return;
        }

        const user = await getCurrentUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const [projectsRes, usersRes] = await Promise.all([
          getProjects(),
          getUsers(),
        ]);

        const allProjects = projectsRes.data || [];
        const users = usersRes.data || [];
        const salespeople = users.filter((u: any) => String(u.role || "").toLowerCase().includes("sales"));

        setProjects(allProjects);
        setSalesUsers(salespeople);

        // If a status filter is set in the URL, set project filter to 'all' (show all projects)
        if (searchParams.get("status")) {
          setSelectedProject(null);
        } else if (allProjects.length > 0) {
          setSelectedProject(allProjects[0]);
        }
      } catch (error) {
        // Error fetching data
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Only run on mount and when searchParams changes
  }, [searchParams]);

  // Read status filter from URL params and update filter state
  useEffect(() => {
    const statusParam = searchParams.get("status");
    if (statusParam) {
      // Normalize old status values to new ones for consistency
      let normalizedStatus = statusParam;
      if (statusParam === "negotiation") normalizedStatus = "proposal";
      else if (statusParam === "won") normalizedStatus = "closed_won";
      else if (statusParam === "lost") normalizedStatus = "not_interested";
      else if (["new", "qualified", "proposal", "closed_won", "not_interested"].includes(statusParam)) {
        normalizedStatus = statusParam;
      } else {
        normalizedStatus = "all";
      }
      setStatusFilter(normalizedStatus);
    } else {
      setStatusFilter("all");
    }
  }, [searchParams]);

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

  useEffect(() => {
    // Realtime: listen for users changes to keep sales list fresh
    const userSub = subscribeToUsers(async () => {
      try {
        const usersRes = await getUsers();
        const users = usersRes.data || [];
        const salespeople = users.filter((u: any) => String(u.role || "").toLowerCase().includes("sales"));
        setSalesUsers(salespeople);
      } catch (e) {
        // Failed to refresh users after realtime event
      }
    });

    return () => {
      try { userSub.unsubscribe?.(); } catch {}
    };
  }, []);

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const leadsRes = await getLeads();
        const allLeads = leadsRes.data || [];
        let leadsToShow: any[] = [];
        // If a status filter is set in the URL, show all projects' leads for that status
        if (searchParams.get("status")) {
          leadsToShow = allLeads;
          setLeads(leadsToShow);
        } else if (selectedProject) {
          leadsToShow = allLeads.filter((l: any) => l.project_id === selectedProject.id);
          setLeads(leadsToShow);
        } else {
          leadsToShow = allLeads; // Show all leads when no project is selected
          setLeads(leadsToShow);
        }
        // Load note counts for displayed leads
        await loadNoteCounts(leadsToShow);
      } catch (error) {
        // Error fetching leads
      }
    };
    fetchLeads();

    // Realtime: listen for leads changes and refresh
    const leadSub = subscribeToLeads(async () => {
      try {
        const leadsRes = await getLeads();
        const allLeads = leadsRes.data || [];
        let leadsToShow: any[] = [];
        if (searchParams.get("status")) {
          leadsToShow = allLeads;
          setLeads(leadsToShow);
        } else if (selectedProject) {
          leadsToShow = allLeads.filter((l: any) => l.project_id === selectedProject.id);
          setLeads(leadsToShow);
        } else {
          leadsToShow = allLeads; // Show all leads when no project is selected
          setLeads(leadsToShow);
        }
        // Refresh note counts for displayed leads
        await loadNoteCounts(leadsToShow);
      } catch (e) {
        // Failed to refresh leads after realtime event
      }
    });

    return () => {
      try { leadSub.unsubscribe?.(); } catch {}
    };
  }, [selectedProject, searchParams]);

  const handleCreateLead = async () => {
    setCreateMessage(null);
    if (!leadForm.company_name || !leadForm.contact_name || !leadForm.value) {
      setCreateMessage({ type: "error", text: "Company, contact, and value are required." });
      return;
    }
    const targetProjectId = (leadForm as any).project_id || selectedProject?.id;
    if (!targetProjectId) {
      setCreateMessage({ type: "error", text: "Please choose a project for this lead." });
      return;
    }
    const valueNum = Number(leadForm.value);
    if (isNaN(valueNum) || valueNum <= 0) {
      setCreateMessage({ type: "error", text: "Value must be a positive number." });
      return;
    }
    setCreating(true);
    try {
      const newLead = await createLead({
        company_name: leadForm.company_name,
        contact_name: leadForm.contact_name,
        email: leadForm.email?.trim() || null,
        phone: leadForm.phone?.trim() || null,
        status: leadForm.status,
        value: valueNum,
        assigned_to: leadForm.assigned_to || null,
        project_id: targetProjectId,
        description: leadForm.description || `Created on ${new Date().toLocaleDateString()}`,
        link: leadForm.link || undefined,
        // New comprehensive fields
        designation: leadForm.designation?.trim() || null,
        mobile_phone: leadForm.mobile_phone?.trim() || null,
        direct_phone: leadForm.direct_phone?.trim() || null,
        office_phone: leadForm.office_phone?.trim() || null,
        linkedin: leadForm.linkedin?.trim() || null,
        address_line1: leadForm.address_line1?.trim() || null,
        address_line2: leadForm.address_line2?.trim() || null,
        city: leadForm.city?.trim() || null,
        state: leadForm.state?.trim() || null,
        country: leadForm.country?.trim() || null,
        zip: leadForm.zip?.trim() || null,
        customer_group: leadForm.customer_group?.trim() || null,
        product_group: leadForm.product_group?.trim() || null,
        tags: leadForm.tags ? leadForm.tags.split(',').map(t => t.trim()).filter(t => t) : null,
        lead_source: leadForm.lead_source?.trim() || null,
        data_source: leadForm.data_source?.trim() || null,
        lead_score: leadForm.lead_score ? parseInt(leadForm.lead_score) : null,
        priority: (leadForm as any).priority || 'medium',
        software_category: (leadForm as any).software_category || null,
        industry: (leadForm as any).industry || null,
        next_followup_date: leadForm.next_followup_date || null,
        followup_notes: leadForm.followup_notes?.trim() || null,
        repeat_followup: leadForm.repeat_followup || false,
        do_not_followup: leadForm.do_not_followup || false,
        do_not_followup_reason: leadForm.do_not_followup_reason?.trim() || null,
        lead_notes: leadForm.lead_notes?.trim() || null,
        organization_notes: leadForm.organization_notes?.trim() || null,
        date_of_birth: leadForm.date_of_birth || null,
        special_event_date: leadForm.special_event_date || null,
        reference_url1: leadForm.reference_url1?.trim() || null,
        reference_url2: leadForm.reference_url2?.trim() || null,
        reference_url3: leadForm.reference_url3?.trim() || null,
        list_name: leadForm.list_name?.trim() || null,
      });
      setCreateMessage({ type: "success", text: "Lead created successfully." });
      // Always refresh all leads after add
      const leadsRes = await getLeads();
      setLeads(leadsRes.data || []);
      setTimeout(() => {
        setShowAddLeadModal(false);
        setLeadForm({ ...EMPTY_LEAD_FORM });
        setCreateMessage(null);
      }, 1500);
    } catch (err: any) {
      setCreateMessage({ type: "error", text: err.message || "Failed to create lead." });
    } finally {
      setCreating(false);
    }
  };

  const handleAssignLead = async (leadId: string, salesPersonId: string) => {
    setAssigningLead(leadId);
    try {
      await updateLead(leadId, { assigned_to: salesPersonId || null });
      const leadsRes = await getLeads();
      setLeads(leadsRes.data || []);
    } catch (error) {
      // Failed to assign lead
    } finally {
      setAssigningLead(null);
    }
  };

  // Handle bulk assign
  const handleBulkAssign = async () => {
    if (!bulkAssignSalesman || selectedLeadIds.size === 0) {
      alert("Please select a salesman and at least one lead");
      return;
    }
    setBulkAssigning(true);
    try {
      const leadIdsArray = Array.from(selectedLeadIds);
      const assignPromises = leadIdsArray.map(leadId => 
        updateLead(leadId, { assigned_to: bulkAssignSalesman })
      );
      await Promise.all(assignPromises);
      
      // Refresh leads
      const leadsRes = await getLeads();
      setLeads(leadsRes.data || []);
      
      // Clear selection
      setSelectedLeadIds(new Set());
      setShowBulkAssignModal(false);
      setBulkAssignSalesman("");
      alert(`Successfully assigned ${leadIdsArray.length} lead(s) to salesman`);
    } catch (error: any) {
      alert(`Failed to assign leads: ${error.message || 'Unknown error'}`);
    } finally {
      setBulkAssigning(false);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedLeadIds.size === 0) {
      alert("Please select at least one lead to delete");
      return;
    }
    setBulkDeleting(true);
    try {
      const leadIdsArray = Array.from(selectedLeadIds);
      const deletePromises = leadIdsArray.map(leadId => 
        deleteLead(leadId)
      );
      const results = await Promise.all(deletePromises);
      
      // Check for errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        alert(`Failed to delete ${errors.length} lead(s). Some leads may have been deleted.`);
      }
      
      // Refresh leads
      const leadsRes = await getLeads();
      setLeads(leadsRes.data || []);
      
      // Clear selection
      setSelectedLeadIds(new Set());
      setShowBulkDeleteModal(false);
      alert(`Successfully deleted ${leadIdsArray.length - errors.length} lead(s)`);
    } catch (error: any) {
      alert(`Failed to delete leads: ${error.message || 'Unknown error'}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  // Toggle select all filtered leads
  const handleSelectAll = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      const allFilteredIds = new Set(filteredLeads.map(lead => lead.id));
      setSelectedLeadIds(allFilteredIds);
    } else {
      setSelectedLeadIds(new Set());
    }
  };

  // Toggle individual lead selection
  const handleToggleLead = (leadId: string, checked: boolean | "indeterminate") => {
    const newSelection = new Set(selectedLeadIds);
    if (checked === true) {
      newSelection.add(leadId);
    } else {
      newSelection.delete(leadId);
    }
    setSelectedLeadIds(newSelection);
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
        // Common abbreviations including Phno
        "Phno", "phno", "PHNO", "PhNo", "Ph No", "ph no",
        "Phone_Number", "phone_number",
        "Contact_Phone", "contact_phone",
        "Mobile_Number", "mobile_number",
        "Tel No", "tel no", "TelNo", "tel_no",
        "Phone#", "phone#", "PHONE#",
        "Contact#", "contact#", "CONTACT#",
        "Number", "number", "NUMBER",
        "No", "no", "NO",
        // Multiple phone columns
        "Phone 1", "phone 1", "Phone1", "phone1",
        "Phone 2", "phone 2", "Phone2", "phone2",
        "Mobile 1", "mobile 1", "Mobile1", "mobile1",
        "Mobile 2", "mobile 2", "Mobile2", "mobile2",
      ];

      // Helper to parse and add phone number
      const addPhoneNumber = (value: any) => {
        if (value === null || value === undefined) return;
        
        // Handle Excel number formatting - convert to string first
        let phoneValue: string;
        if (typeof value === 'number') {
          phoneValue = String(value);
        } else {
          phoneValue = String(value).trim();
        }
        
        if (!phoneValue || phoneValue === "null" || phoneValue === "undefined" || phoneValue === "") return;
        
        // Check if it contains multiple numbers (comma, semicolon, pipe, or newline separated)
        const separators = /[,;|\n\r]+/;
        if (separators.test(phoneValue)) {
          // Split by separators and add each
          const numbers = phoneValue.split(separators).map(n => n.trim()).filter(n => n.length > 0);
          numbers.forEach(num => {
            // More lenient validation - just check if it has digits and reasonable length
            if (num.length >= 6 && num.length <= 25 && /\d/.test(num)) {
              if (!phoneNumbers.includes(num)) phoneNumbers.push(num);
            }
          });
        } else {
          // Single phone number - more lenient validation
          // Just check if it has digits and reasonable length (6-25 characters)
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
        // Check for phone-related keywords including abbreviations like "phno"
        if (lowerKey.includes('phone') || 
            lowerKey.includes('phno') ||  // Add Phno detection
            lowerKey.includes('mobile') || 
            lowerKey.includes('cell') || 
            lowerKey.includes('tel') || 
            (lowerKey.includes('contact') && (lowerKey.includes('no') || lowerKey.includes('num'))) ||
            (lowerKey.includes('number') && (lowerKey.includes('contact') || lowerKey.includes('phone') || lowerKey.includes('mobile'))) ||
            (lowerKey === 'ph' || lowerKey === 'phno' || lowerKey === 'phonenumber')) {  // Exact matches for common abbreviations
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

    // Helper function to find phone number (backward compatibility - returns first or comma-separated)
    const findPhoneNumber = (row: any): string => {
      const phoneNumbers = findAllPhoneNumbers(row);
      return phoneNumbers.length > 0 ? phoneNumbers.join(', ') : '';
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
          if (value && value.includes('@')) { // Basic email validation
            return value;
          }
        }
      }

      return "";
    };

    // Helper function to find value by multiple possible column names
    const findValue = (row: any, possibleNames: string[]): string => {
      for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== "") {
          return String(row[name]).trim();
        }
      }
      return "";
    };

    // Helper function to find phone by specific column name
    const findPhoneByColumn = (row: any, columnName: string): string => {
      const value = row[columnName];
      if (value === null || value === undefined) return "";
      return String(value).trim();
    };

    // Map Excel columns to lead fields (comprehensive mapping)
    const leadsToImport = excelData.map((row: any, index: number) => {
      // Try to find company name in various column names
      const companyName = findValue(row, [
        "Company / Organization", "Company", "company_name", "CompanyName", "COMPANY", "company",
        "Organization", "organization", "Org", "org"
      ]) || Object.values(row)[0] || "";
      
      if (!companyName || companyName.trim() === "") {
        return null; // Skip rows without company name
      }

      // Extract ALL phone numbers using comprehensive search
      const phoneNumbers = findAllPhoneNumbers(row);
      const phoneValue = phoneNumbers.length > 0 ? phoneNumbers.join(', ') : undefined;
      
      // Extract specific phone numbers
      const mobilePhone = findPhoneByColumn(row, "Mobile Phone Number") || 
                         findPhoneByColumn(row, "Mobile") || 
                         findPhoneByColumn(row, "mobile_phone") || undefined;
      const directPhone = findPhoneByColumn(row, "Direct Phone Number") || 
                         findPhoneByColumn(row, "Direct Phone") || 
                         findPhoneByColumn(row, "direct_phone") || undefined;
      const officePhone = findPhoneByColumn(row, "Office Phone Number") || 
                         findPhoneByColumn(row, "Office Phone") || 
                         findPhoneByColumn(row, "office_phone") || undefined;
      
      // Extract email using comprehensive search
      const emailValue = findEmail(row);

      // Extract contact name
      const contactName = findValue(row, [
        "Lead or Customer Full Name", "Contact Name", "Contact", "contact_name", "ContactName",
        "CONTACT", "contact", "Name", "name", "Full Name", "full_name"
      ]);

      // Extract designation
      const designation = findValue(row, [
        "Designation / Title", "Designation", "designation", "Title", "title", "Job Title", "job_title"
      ]);

      // Extract address fields
      const addressLine1 = findValue(row, ["Address Line 1", "Address", "address", "address_line1"]);
      const addressLine2 = findValue(row, ["Address Line 2", "address_line2"]);
      const city = findValue(row, ["City", "city"]);
      const state = findValue(row, ["State", "state"]);
      const country = findValue(row, ["Country", "country"]);
      const zip = findValue(row, ["Zip", "zip", "ZIP", "Postal Code", "postal_code"]);

      // Extract classification fields
      const customerGroup = findValue(row, ["Customer Group", "customer_group"]);
      const productGroup = findValue(row, ["Product Group", "product_group"]);
      const leadSource = findValue(row, ["Lead Source", "lead_source", "Data Source", "data_source"]);
      const dataSource = findValue(row, ["Data Source", "data_source"]);
      
      // Extract tags (comma-separated)
      const tagsStr = findValue(row, ["Tags", "tags", "Tag", "tag"]);
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : undefined;

      // Extract lead score
      const leadScoreStr = findValue(row, ["Lead Score", "lead_score"]);
      const leadScore = leadScoreStr ? parseInt(leadScoreStr) : undefined;

      // Extract follow-up fields
      const nextFollowupDate = findValue(row, ["Next Follow-up Date", "next_followup_date", "Follow-up Date"]);
      const followupNotes = findValue(row, ["Follow-up Notes", "followup_notes"]);
      const repeatFollowup = findValue(row, ["Repeat Follow-up", "repeat_followup"]).toLowerCase() === 'yes' || 
                           findValue(row, ["Repeat Follow-up", "repeat_followup"]).toLowerCase() === 'true';
      const doNotFollowup = findValue(row, ["Do not Follow-up", "do_not_followup"]).toLowerCase() === 'yes' || 
                          findValue(row, ["Do not Follow-up", "do_not_followup"]).toLowerCase() === 'true';
      const doNotFollowupReason = findValue(row, ["Do not Follow-up Reason", "do_not_followup_reason"]);

      // Extract notes
      const leadNotes = findValue(row, ["Lead Notes", "lead_notes", "Notes", "notes", "Note", "note"]);
      const organizationNotes = findValue(row, ["Organization Notes", "organization_notes"]);

      // Extract personal information
      const dateOfBirth = findValue(row, ["Date of Birth", "date_of_birth", "DOB", "dob"]);
      const specialEventDate = findValue(row, ["Special Event Date", "special_event_date"]);

      // Extract reference URLs
      const referenceUrl1 = findValue(row, ["Reference URL1", "reference_url1", "Reference URL 1"]);
      const referenceUrl2 = findValue(row, ["Reference URL2", "reference_url2", "Reference URL 2"]);
      const referenceUrl3 = findValue(row, ["Reference URL3", "reference_url3", "Reference URL 3"]);

      // Extract list name
      const listName = findValue(row, ["List Name", "list_name"]);

      // Extract LinkedIn
      const linkedin = findValue(row, ["LinkedIn", "linkedin", "Linked In"]);

      // Extract website
      const website = findValue(row, ["Website", "website", "URL", "url", "Link", "link"]);

      const leadData: any = {
        company_name: String(companyName).trim(),
        contact_name: contactName || undefined,
        email: emailValue || undefined,
        phone: phoneValue || undefined,
        mobile_phone: mobilePhone || undefined,
        direct_phone: directPhone || undefined,
        office_phone: officePhone || undefined,
        project_id: selectedImportProject,
        description: leadNotes || undefined,
        link: website || undefined,
        designation: designation || undefined,
        address_line1: addressLine1 || undefined,
        address_line2: addressLine2 || undefined,
        city: city || undefined,
        state: state || undefined,
        country: country || undefined,
        zip: zip || undefined,
        customer_group: customerGroup || undefined,
        product_group: productGroup || undefined,
        tags: tags || undefined,
        lead_source: leadSource || undefined,
        data_source: dataSource || undefined,
        lead_score: leadScore || undefined,
        next_followup_date: nextFollowupDate || undefined,
        followup_notes: followupNotes || undefined,
        repeat_followup: repeatFollowup || undefined,
        do_not_followup: doNotFollowup || undefined,
        do_not_followup_reason: doNotFollowupReason || undefined,
        lead_notes: leadNotes || undefined,
        organization_notes: organizationNotes || undefined,
        date_of_birth: dateOfBirth || undefined,
        special_event_date: specialEventDate || undefined,
        reference_url1: referenceUrl1 || undefined,
        reference_url2: referenceUrl2 || undefined,
        reference_url3: referenceUrl3 || undefined,
        list_name: listName || undefined,
        linkedin: linkedin || undefined,
        value: (() => {
          const val = row["Deal Size - INR"] || row["Deal Size"] || row["Value"] || row["value"] || 
                     row["deal_value"] || row["Amount"] || row["amount"] || row["Potential"] || 0;
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
        const leadsRes = await getLeads();
        setLeads(leadsRes.data || []);
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

  const handleStatusChange = async (leadId: string, status: string) => {
    if (!leadId || !status) {
      return;
    }
    // Normalize status to match database enum values
    const normalizedStatus = normalizeStatus(status);
    const allowedStatuses = ['new', 'qualified', 'proposal', 'closed_won', 'not_interested'];
    if (!allowedStatuses.includes(normalizedStatus)) {
      alert(`Invalid status value: ${status}. Please try again.`);
      return;
    }
    setUpdatingLeadId(leadId);
    try {
      const result = await updateLead(leadId, { status: normalizedStatus });
      if (result.error) {
        alert(`Failed to update lead status: ${result.error.message || 'Unknown error'}`);
        setUpdatingLeadId(null);
        return;
      }
      if (!result.data) {
        alert('Failed to update lead status: No data returned');
        setUpdatingLeadId(null);
        return;
      }
      // Always refresh all leads after update
      const leadsRes = await getLeads();
      setLeads(leadsRes.data || []);
    } catch (error) {
      alert(`Failed to update lead status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUpdatingLeadId(null);
    }
  };

  // Handler functions for Add Note and Schedule Callback
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

  // Get default WhatsApp message for a lead
  const getWhatsAppMessage = (lead: any) => {
    let messageTemplate = '';
    
    // First check if lead has a custom message
    if ((lead as any).whatsapp_message) {
      messageTemplate = (lead as any).whatsapp_message;
    } else {
      // Then check project for default message
      const project = projects.find(p => p.id === lead.project_id);
      if (project && (project as any).whatsapp_message) {
        messageTemplate = (project as any).whatsapp_message;
      } else {
        // Default message
        const companyName = lead.company_name || 'there';
        const contactName = lead.contact_name || '';
        return `Hello${contactName ? ` ${contactName}` : ''}, I hope this message finds you well. I wanted to reach out regarding ${companyName}. Would you be available for a quick conversation?`;
      }
    }
    
    // Replace placeholders in the message template
    const companyName = lead.company_name || '';
    const contactName = lead.contact_name || '';
    const projectName = projects.find(p => p.id === lead.project_id)?.name || '';
    
    return messageTemplate
      .replace(/{company_name}/g, companyName)
      .replace(/{contact_name}/g, contactName)
      .replace(/{project_name}/g, projectName);
  };

  // Format phone number for WhatsApp (remove non-digits; basic validity)
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

  // Open WhatsApp modal to customize message
  const handleWhatsApp = (lead: any) => {
    const phoneNumbers = parsePhoneNumbers(lead.contact_phone || lead.phone || (lead as any).mobile_phone);
    const validPhones = phoneNumbers
      .map(formatPhoneForWhatsApp)
      .filter((p): p is string => Boolean(p));
    
    if (validPhones.length === 0) {
      alert('No phone number available for this lead');
      return;
    }
    
    setSelectedLeadForWhatsApp(lead);
    const defaultMessage = getWhatsAppMessage(lead);
    setWhatsAppMessage(defaultMessage);
    setShowWhatsAppModal(true);
  };

  // Send WhatsApp message (opens WhatsApp with customized message)
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
    const validPhones = phoneNumbers
      .map(formatPhoneForWhatsApp)
      .filter((p): p is string => Boolean(p));
    
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

    // Gmail compose link; if Gmail not default, mailto will still work
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emailAddress)}&su=${subject}&body=${body}`;
    window.open(gmailUrl, "_blank");

    setShowEmailModal(false);
    setSelectedLeadForEmail(null);
    setEmailSubject("");
    setEmailBody("");
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
      
      // Refresh leads and keep selection in sync
      const leadsRes = await getLeads();
      const updatedLeads = leadsRes.data || [];
      setLeads(updatedLeads);
      const updated = updatedLeads.find((l) => l.id === selectedLeadForActivity.id);
      if (updated) {
        setSelectedLead(updated);
        setEditLeadForm((prev: any) => (prev && prev.id === updated.id ? { ...prev, ...updated, value: String(updated.value ?? "") } : prev));
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
      const leadsRes = await getLeads();
      const updatedLeads = leadsRes.data || [];
      setLeads(updatedLeads);
      const updated = updatedLeads.find((l) => l.id === selectedLeadForActivity.id);
      if (updated) {
        setSelectedLead(updated);
        setEditLeadForm((prev: any) => (prev && prev.id === updated.id ? { ...prev, ...updated, value: String(updated.value ?? "") } : prev));
      }
      
      setShowCallbackModal(false);
      setCallbackDate("");
      setCallbackNotes("");
      setSelectedLeadForActivity(null);
    } catch (error) {
      console.error("Failed to schedule callback", error);
      alert("Failed to schedule callback. Please try again.");
    } finally {
      setSubmittingActivity(false);
    }
  };

  // Helper function to normalize status values (handle both old and new formats)
  const normalizeStatus = (status: string): string => {
    const statusMap: { [key: string]: string } = {
      'negotiation': 'proposal',
      'won': 'closed_won',
      'lost': 'not_interested',
    };
    return statusMap[status] || status;
  };

  // Helper function to check if a lead status matches the filter
  const statusMatches = (leadStatus: string, filterStatus: string): boolean => {
    if (filterStatus === "all") return true;
    const normalizedLeadStatus = normalizeStatus(leadStatus);
    const normalizedFilterStatus = normalizeStatus(filterStatus);
    return normalizedLeadStatus === normalizedFilterStatus || leadStatus === filterStatus;
  };

  // Fix: filteredLeads should show all leads when selectedProject is null
  const filteredLeads = leads.filter((lead) => {
    const matchesStatus = statusFilter === 'all' || normalizeStatus(lead.status) === statusFilter;
    const matchesAssignee = assigneeFilter === 'all' || lead.assigned_to === assigneeFilter || (assigneeFilter === 'unassigned' && !lead.assigned_to);
    const matchesSearch = !searchTerm || 
      lead.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase());
    // If selectedProject is null, show all leads
    const matchesProject = selectedProject ? lead.project_id === selectedProject.id : true;
    
    // Source filter
    const leadSource = (lead as any).lead_source || (lead as any).source || "Direct";
    const matchesSource = sourceFilter === "all" || leadSource === sourceFilter;
    
    // Priority filter (uses the priority column: low/medium/high/urgent)
    const leadPriority = String((lead as any).priority || "medium").toLowerCase();
    const matchesPriority = priorityFilter === "all" || leadPriority === priorityFilter;

    // Software category filter
    const leadSoftwareCategory = String((lead as any).software_category || "").toLowerCase();
    const matchesSoftwareCategory = softwareCategoryFilter === "all" || !softwareCategoryFilter ||
      leadSoftwareCategory === softwareCategoryFilter.toLowerCase();

    // Industry filter
    // Match loosely: legacy/imported leads may hold free text ("Automotive
    // Manufacturing") rather than the slug the filter uses ("manufacturing").
    const leadIndustry = String((lead as any).industry || "").toLowerCase();
    const wanted = String(industryFilter || "").toLowerCase();
    const matchesIndustry = industryFilter === "all" || !industryFilter ||
      leadIndustry === wanted ||
      leadIndustry.includes(wanted.replace(/_/g, " ")) ||
      leadIndustry.replace(/[\s_]/g, "").includes(wanted.replace(/[\s_]/g, ""));

    // Location filters
    const matchesCountry = !countryFilter || ((lead as any).country || "").toLowerCase().includes(countryFilter.toLowerCase());
    const matchesState = !stateFilter || ((lead as any).state || "").toLowerCase().includes(stateFilter.toLowerCase());
    const matchesCity = !cityFilter || ((lead as any).city || "").toLowerCase().includes(cityFilter.toLowerCase());

    // Value range
    const val = Number(lead.value || 0);
    const minVal = valueMin ? Number(valueMin) : undefined;
    const maxVal = valueMax ? Number(valueMax) : undefined;
    const matchesValueMin = minVal === undefined || (!Number.isNaN(minVal) && val >= minVal);
    const matchesValueMax = maxVal === undefined || (!Number.isNaN(maxVal) && val <= maxVal);

    // Lead score range
    const scoreVal = Number((lead as any).lead_score || 0);
    const minScore = scoreMin ? Number(scoreMin) : undefined;
    const maxScore = scoreMax ? Number(scoreMax) : undefined;
    const matchesScoreMin = minScore === undefined || (!Number.isNaN(minScore) && scoreVal >= minScore);
    const matchesScoreMax = maxScore === undefined || (!Number.isNaN(maxScore) && scoreVal <= maxScore);

    // Follow-up date range
    const followupDate = (lead as any).next_followup_date ? new Date((lead as any).next_followup_date) : null;
    const afterDate = followupAfter ? new Date(followupAfter) : null;
    const beforeDate = followupBefore ? new Date(followupBefore) : null;
    const matchesAfter = !afterDate || (followupDate && followupDate >= afterDate);
    const matchesBefore = !beforeDate || (followupDate && followupDate <= beforeDate);

    // Do not follow up
    const matchesDnf = !doNotFollowupOnly || (lead as any).do_not_followup === true;

    // Tags
    const tags = (lead as any).tags;
    const hasTagsFlag = Array.isArray(tags) ? tags.length > 0 : Boolean(tags);
    const matchesHasTags = !hasTags || hasTagsFlag;
    const matchesTagQuery = !tagQuery || (Array.isArray(tags)
      ? tags.some((t: string) => t?.toLowerCase().includes(tagQuery.toLowerCase()))
      : String(tags || "").toLowerCase().includes(tagQuery.toLowerCase()));
    
    return (
      matchesStatus &&
      matchesAssignee &&
      matchesSearch &&
      matchesProject &&
      matchesSource &&
      matchesPriority &&
      matchesSoftwareCategory &&
      matchesIndustry &&
      matchesCountry &&
      matchesState &&
      matchesCity &&
      matchesValueMin &&
      matchesValueMax &&
      matchesScoreMin &&
      matchesScoreMax &&
      matchesAfter &&
      matchesBefore &&
      matchesDnf &&
      matchesHasTags &&
      matchesTagQuery
    );
  });

  // Status label mapping
  const statusLabel: Record<string, string> = {
    new: "New",
    qualified: "Qualified",
    proposal: "In Proposal",
    closed_won: "Closed Won",
    not_interested: "Not Interested",
  };

  // Export leads to Excel
  const handleExportToExcel = () => {
    if (filteredLeads.length === 0) {
      alert("No leads to export.");
      return;
    }
    exportLeadsToExcel(filteredLeads, `leads_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Check if all filtered leads are selected
  const allFilteredSelected = filteredLeads.length > 0 && filteredLeads.every(lead => selectedLeadIds.has(lead.id));
  const someFilteredSelected = filteredLeads.some(lead => selectedLeadIds.has(lead.id));

  const getStatusIcon = (status: string) => {
    const normalizedStatus = normalizeStatus(status);
    switch(normalizedStatus) {
      case 'closed_won': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'not_interested': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'proposal': return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case 'qualified': return <Clock className="w-4 h-4 text-blue-500" />;
      default: return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = normalizeStatus(status);
    switch(normalizedStatus) {
      case 'closed_won': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'not_interested': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'proposal': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'qualified': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-500 border-slate-500/30';
    }
  };

  // Load activities for the selected lead when viewing details
  useEffect(() => {
    if (!selectedLead || !showDetailsModal) return;

    let cleanup: (() => void) | undefined;

    const load = async () => {
      try {
        const { data } = await getActivitiesForLead(selectedLead.id);
        setLeadActivities(data || []);
      } catch (e) {
        // Silently handle error
      }
    };

    load();

    const sub = subscribeToLeadActivities(selectedLead.id, async () => {
      try {
        const { data } = await getActivitiesForLead(selectedLead.id);
        setLeadActivities(data || []);
      } catch (e) {
        // Silently handle error
      }
    });
    cleanup = () => { try { sub.unsubscribe?.(); } catch {} };

    return () => { cleanup?.(); };
  }, [selectedLead, showDetailsModal]);

  // Always set selectedProject to null on mount and after projects load
  useEffect(() => {
    if (projects.length > 0) {
      setSelectedProject(null);
    }
  }, [projects]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <DashboardSidebar role="manager" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-slate-600">Loading leads...</p>
          </div>
        </main>
      </div>
    );
  }

  // Pipeline stats should match filteredLeads, using normalized status
  const newLeads = filteredLeads.filter(l => normalizeStatus(l.status) === 'new');
  const qualifiedLeads = filteredLeads.filter(l => normalizeStatus(l.status) === 'qualified');
  const proposalLeads = filteredLeads.filter(l => normalizeStatus(l.status) === 'proposal');
  const closedWonLeads = filteredLeads.filter(l => normalizeStatus(l.status) === 'closed_won');
  const totalValue = filteredLeads.reduce((sum, l) => sum + (l.value || 0), 0);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role="manager" />
      <main className="flex-1 p-2 sm:p-4 lg:p-8 pt-16 sm:pt-16 lg:pt-8 overflow-auto bg-slate-50">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-2xl font-bold text-slate-900 mb-1 sm:mb-2">Leads Management</h1>
          <p className="text-sm sm:text-base text-slate-600">Manage and track all leads across projects</p>
        </div>



        {/* Filters/Search Bar with Project Selector */}
        <Card className="p-4 bg-white border-slate-200 shadow-sm mb-4">
          {/* ── Row 1: Filters ─────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex-none min-w-[150px] max-w-[200px]">
              <Select
                value={selectedProject ? selectedProject.id : "all"}
                onValueChange={(value) => {
                  if (value === "all") {
                    setSelectedProject(null);
                  } else {
                    const project = projects.find(p => p.id === value);
                    setSelectedProject(project || null);
                  }
                }}
              >
                <SelectTrigger className="h-9 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 font-medium">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value={"all"} className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">All Projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id} className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-none min-w-[150px] max-w-[200px]">
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  // Update the URL param for status
                  const next = new URLSearchParams(searchParams);
                  if (value === "all") {
                    next.delete("status");
                  } else {
                    next.set("status", value);
                  }
                  setSearchParams(next, { replace: true });
                }}
              >
                <SelectTrigger className="h-9 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 font-medium">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="all" className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">All Statuses</SelectItem>
                  <SelectItem value="new" className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">New</SelectItem>
                  <SelectItem value="qualified" className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">Qualified</SelectItem>
                  <SelectItem value="proposal" className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">In Proposal</SelectItem>
                  <SelectItem value="closed_won" className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">Closed Won</SelectItem>
                  <SelectItem value="not_interested" className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">Not Interested</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-none min-w-[150px] max-w-[200px]">
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="h-9 bg-white border-slate-300 text-slate-900 hover:bg-slate-50 font-medium">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="all" className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">All Assignees</SelectItem>
                  <SelectItem value="unassigned" className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">Unassigned</SelectItem>
                  {salesUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id} className="text-slate-900 hover:bg-slate-100 focus:bg-slate-100 font-medium">
                      {u.full_name || u.email?.split("@")[0] || u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search leads..."
                  className="h-9 pl-9 bg-white border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500"
                />
              </div>
            </div>
            {/* Advanced Filter Dropdown */}
            <DropdownMenu open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9"
                  >
                    <Filter className="w-4 h-4" />
                    Advanced Filters
                    {(statusFilter !== "all" || assigneeFilter !== "all" || sourceFilter !== "all" || priorityFilter !== "all" || softwareCategoryFilter !== "all" || industryFilter !== "all") && (
                      <Badge className="bg-indigo-100 text-indigo-700 border-0 text-xs px-1.5 py-0.5 ml-1">Active</Badge>
                    )}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-3 max-h-96 overflow-y-auto">
                  <div className="space-y-3">
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
                          <SelectItem value="urgent">🔴 Urgent</SelectItem>
                          <SelectItem value="high">🟠 High</SelectItem>
                          <SelectItem value="medium">🟡 Medium</SelectItem>
                          <SelectItem value="low">🟢 Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Software Category Filter */}
                    <div>
                      <label className="text-xs font-medium text-slate-700 mb-1.5 block">Software Category</label>
                      <Select value={softwareCategoryFilter} onValueChange={setSoftwareCategoryFilter}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          <SelectItem value="erp">ERP</SelectItem>
                          <SelectItem value="blockchain_erp">Blockchain ERP</SelectItem>
                          <SelectItem value="crm">CRM</SelectItem>
                          <SelectItem value="hrms">HRMS</SelectItem>
                          <SelectItem value="accounting">Accounting</SelectItem>
                          <SelectItem value="inventory">Inventory</SelectItem>
                          <SelectItem value="pos">POS</SelectItem>
                          <SelectItem value="ecommerce">E-Commerce</SelectItem>
                          <SelectItem value="custom">Custom Development</SelectItem>
                          <SelectItem value="saas">SaaS</SelectItem>
                          <SelectItem value="mobile">Mobile App</SelectItem>
                          <SelectItem value="website">Website</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Industry Filter */}
                    <div>
                      <label className="text-xs font-medium text-slate-700 mb-1.5 block">Industry</label>
                      <Select value={industryFilter} onValueChange={setIndustryFilter}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="All Industries" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Industries</SelectItem>
                          <SelectItem value="manufacturing">Manufacturing</SelectItem>
                          <SelectItem value="retail">Retail</SelectItem>
                          <SelectItem value="healthcare">Healthcare</SelectItem>
                          <SelectItem value="education">Education</SelectItem>
                          <SelectItem value="construction">Construction</SelectItem>
                          <SelectItem value="logistics">Logistics</SelectItem>
                          <SelectItem value="hospitality">Hospitality</SelectItem>
                          <SelectItem value="finance">Finance</SelectItem>
                          <SelectItem value="it">IT / Technology</SelectItem>
                          <SelectItem value="real_estate">Real Estate</SelectItem>
                          <SelectItem value="agriculture">Agriculture</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Location Filters */}
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">Country</label>
                        <Input
                          value={countryFilter}
                          onChange={(e) => setCountryFilter(e.target.value)}
                          placeholder="e.g., US, India"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-slate-700 mb-1 block">State</label>
                          <Input
                            value={stateFilter}
                            onChange={(e) => setStateFilter(e.target.value)}
                            placeholder="State"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700 mb-1 block">City</label>
                          <Input
                            value={cityFilter}
                            onChange={(e) => setCityFilter(e.target.value)}
                            placeholder="City"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Value Range */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">Min Value</label>
                        <Input
                          type="number"
                          value={valueMin}
                          onChange={(e) => setValueMin(e.target.value)}
                          placeholder="0"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">Max Value</label>
                        <Input
                          type="number"
                          value={valueMax}
                          onChange={(e) => setValueMax(e.target.value)}
                          placeholder="100000"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Lead Score Range */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">Min Score</label>
                        <Input
                          type="number"
                          value={scoreMin}
                          onChange={(e) => setScoreMin(e.target.value)}
                          placeholder="0"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">Max Score</label>
                        <Input
                          type="number"
                          value={scoreMax}
                          onChange={(e) => setScoreMax(e.target.value)}
                          placeholder="100"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Follow-up Date Range */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">Follow-up After</label>
                        <Input
                          type="date"
                          value={followupAfter}
                          onChange={(e) => setFollowupAfter(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">Follow-up Before</label>
                        <Input
                          type="date"
                          value={followupBefore}
                          onChange={(e) => setFollowupBefore(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Flags and Tags */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={doNotFollowupOnly}
                          onCheckedChange={(c) => setDoNotFollowupOnly(Boolean(c))}
                        />
                        <span className="text-xs text-slate-700">Do Not Follow-up only</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={hasTags}
                          onCheckedChange={(c) => setHasTags(Boolean(c))}
                        />
                        <span className="text-xs text-slate-700">Has tags</span>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-700 mb-1 block">Tag contains</label>
                        <Input
                          value={tagQuery}
                          onChange={(e) => setTagQuery(e.target.value)}
                          placeholder="e.g., priority, hrms"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Clear Filters */}
                    <div className="pt-2 border-t border-slate-200">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSearchTerm("");
                          setStatusFilter("all");
                          setAssigneeFilter("all");
                          setSourceFilter("all");
                          setPriorityFilter("all");
                          setSoftwareCategoryFilter("all");
                          setIndustryFilter("all");
                          setCountryFilter("");
                          setStateFilter("");
                          setCityFilter("");
                          setValueMin("");
                          setValueMax("");
                          setScoreMin("");
                          setScoreMax("");
                          setFollowupAfter("");
                          setFollowupBefore("");
                          setDoNotFollowupOnly(false);
                          setHasTags(false);
                          setTagQuery("");
                          setShowAdvancedFilters(false);
                          // Clear URL params
                          const next = new URLSearchParams(searchParams);
                          next.delete("status");
                          setSearchParams(next, { replace: true });
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
          </div>

          {/* ── Row 2: Action buttons (horizontally scrollable) ─────── */}
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex items-center gap-2 pb-1 min-w-max">

              {/* ─ Add & Import ─ */}
              <Button
                onClick={() => {
                  setCreateMessage(null);
                  setLeadForm((f: any) => ({
                    ...f,
                    project_id: selectedProject?.id || (projects.length === 1 ? projects[0].id : ""),
                  }));
                  setShowAddLeadModal(true);
                }}
                disabled={projects.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed h-9 shrink-0 whitespace-nowrap"
                title={projects.length === 0 ? "Create a project first" : "Add a new lead"}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Lead
              </Button>

              <Button
                onClick={() => {
                  setShowBulkImportModal(true);
                  setExcelData([]);
                  setExcelHeaders([]);
                  setImportMessage(null);
                  if (selectedProject) setSelectedImportProject(selectedProject.id);
                }}
                disabled={projects.length === 0}
                className="bg-slate-600 hover:bg-slate-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed h-9 shrink-0 whitespace-nowrap"
                title="Import leads from Excel"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                Excel Import
              </Button>

              <Button
                onClick={() => setShowWAGroupImport(true)}
                disabled={projects.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed h-9 shrink-0 whitespace-nowrap"
                title="Import contacts from a WhatsApp group"
              >
                <MessageCircle className="w-4 h-4 mr-1.5" />
                WA Group Import
              </Button>

              <div className="w-px h-6 bg-slate-200 shrink-0" />

              {/* ─ AI Tools ─ */}
              <Button
                onClick={() => setShowAILeadDialog(true)}
                disabled={projects.length === 0}
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed h-9 shrink-0 whitespace-nowrap"
                title={projects.length === 0 ? "Create a project first" : "Generate leads with Gemini AI"}
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                AI Generate
              </Button>

              <Button
                onClick={() => setShowScoringDialog(true)}
                disabled={filteredLeads.length === 0}
                className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed h-9 shrink-0 whitespace-nowrap"
                title={filteredLeads.length === 0 ? "No leads to score" : "Score leads with Gemini AI"}
              >
                🎯 AI Score
              </Button>

              <div className="w-px h-6 bg-slate-200 shrink-0" />

              {/* ─ Messaging ─ */}
              <Button
                onClick={() => setShowWhatsApp(true)}
                disabled={selectedLeadIds.size === 0}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed h-9 shrink-0 whitespace-nowrap"
                title={selectedLeadIds.size === 0 ? "Select leads first" : `Send WhatsApp to ${selectedLeadIds.size} selected`}
              >
                <MessageCircle className="w-4 h-4 mr-1.5" />
                WhatsApp{selectedLeadIds.size > 0 ? ` (${selectedLeadIds.size})` : ""}
              </Button>

              <div className="w-px h-6 bg-slate-200 shrink-0" />

              {/* ─ Export & Follow-ups ─ */}
              <Button
                variant="outline"
                onClick={handleExportToExcel}
                className="h-9 shrink-0 whitespace-nowrap border-slate-300"
                disabled={filteredLeads.length === 0}
              >
                <Download className="w-4 h-4 mr-1.5" />
                Export Excel
              </Button>

              <Button
                onClick={() => navigate('/manager/follow-ups')}
                className="bg-orange-600 hover:bg-orange-700 text-white font-medium h-9 shrink-0 whitespace-nowrap"
              >
                <CalendarCheck className="w-4 h-4 mr-1.5" />
                Follow-ups
              </Button>
            </div>
          </div>
        </Card>

        {projects.length === 0 && (
          <Card className="p-12 bg-white/5 border-white/10 text-center">
            <Briefcase className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Projects Available</h3>
            <p className="text-slate-500 mb-6">Create a project first to start adding leads</p>
          </Card>
        )}


        {/* If All Projects is selected, show all leads and stats across all projects */}
        {projects.length > 0 && !selectedProject && (
          <>
            {/* Bulk Actions Toolbar */}
            {selectedLeadIds.size > 0 && (
              <Card className="p-4 bg-blue-50 border-blue-200 shadow-sm mb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-blue-900">
                      {selectedLeadIds.size} lead{selectedLeadIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedLeadIds(new Set())}
                      className="text-xs"
                    >
                      Clear Selection
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setShowBulkAssignModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Assign to Salesman
                    </Button>
                    <Button
                      onClick={() => setShowBulkDeleteModal(true)}
                      variant="destructive"
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Selected
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <Card className="p-3 sm:p-6 bg-white border-slate-200">
              {/* Select All Header */}
              {filteredLeads.length > 0 && (
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={handleSelectAll}
                    className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Select All ({filteredLeads.length} leads)
                  </span>
                </div>
              )}
                {filteredLeads.length === 0 && (
                <div className="text-center py-12">
                  <Clock className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-500">No leads found for any project.</p>
                </div>
                )}

              {filteredLeads.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700 w-10">
                          <Checkbox
                            checked={allFilteredSelected}
                            onCheckedChange={handleSelectAll}
                            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                          />
                        </th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Lead</th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Project</th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Contact</th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Assigned To</th>
                        <th className="text-right py-2 px-3 font-medium text-xs text-slate-700">Value</th>
                        <th className="text-center py-2 px-3 font-medium text-xs text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                {filteredLeads.map((lead) => {
                  const assignedUser = salesUsers.find(u => u.id === lead.assigned_to);
                  const assignedName = assignedUser?.full_name || assignedUser?.email?.split("@")[0] || "Unassigned";
                  const lastTouched = lead.updated_at || lead.created_at;
                  const daysStale = lastTouched ? Math.floor((Date.now() - new Date(lastTouched).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                  const isStale = daysStale > 7;
                        const isSelected = selectedLeadIds.has(lead.id);
                        const projectName = projects.find(p => p.id === lead.project_id)?.name || 'No Project';
                        
                  return (
                          <tr 
                            key={lead.id} 
                            className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                            onClick={() => {
                      setSelectedLead(lead);
                      setShowDetailsModal(true);
                            }}
                          >
                            <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => handleToggleLead(lead.id, checked)}
                                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-8 h-8 ring-1 ring-slate-200">
                                  <AvatarFallback className="bg-slate-900 text-white font-semibold text-xs">
                                    {(lead.company_name || "?").slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="text-xs font-medium text-slate-900">{lead.company_name}</div>
                            {isStale && (
                                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs px-1.5 py-0.5 mt-0.5">
                                      Stale ({daysStale}d)
                                    </Badge>
                            )}
                            {aiScores[lead.id] !== undefined && (
                              <Badge
                                className={`text-[10px] px-1.5 py-0.5 mt-0.5 border font-semibold ${
                                  aiScores[lead.id] >= 80
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : aiScores[lead.id] >= 50
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                                }`}
                              >
                                🎯 {aiScores[lead.id]}
                              </Badge>
                            )}
                          </div>
                        </div>
                            </td>
                            <td className="py-2 px-3">
                              {projectName !== 'No Project' ? (
                                <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs px-2 py-0.5">
                                  {projectName}
                                </Badge>
                              ) : (
                                <span className="text-xs text-slate-400">No project</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex flex-col gap-1">
                                <div className="text-xs text-slate-900">{lead.contact_name || 'N/A'}</div>
                                {lead.email && (
                                  <div className="text-xs text-slate-500 truncate max-w-[150px]">{lead.email}</div>
                                )}
                                {lead.phone && (
                                  <div className="text-xs text-slate-500">{lead.phone}</div>
                                )}
                                {/* Note + Callback indicators */}
                                <div className="flex flex-wrap gap-1">
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
                                  {normalizeStatus(lead.status) === 'not_interested' && (
                                    <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] px-1.5 py-0.5">
                                      Not Interested
                                    </Badge>
                                  )}
                      </div>
                                {(lead.followup_notes || lead.lead_notes) && (
                                  <div className="text-[11px] text-slate-500 line-clamp-2">
                                    {(lead.followup_notes || lead.lead_notes || '').slice(0, 80)}
                                    {(lead.followup_notes || lead.lead_notes || '').length > 80 ? '…' : ''}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={normalizeStatus(lead.status) || lead.status}
                                onValueChange={(value) => {
                                  handleStatusChange(lead.id, value);
                                }}
                                disabled={updatingLeadId === lead.id}
                              >
                                <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-7 w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="new">New</SelectItem>
                                  <SelectItem value="qualified">Qualified</SelectItem>
                                  <SelectItem value="proposal">In Proposal</SelectItem>
                                  <SelectItem value="closed_won">Closed Won</SelectItem>
                                  <SelectItem value="not_interested">Not Interested</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={lead.assigned_to || "unassigned"}
                                onValueChange={(value) => {
                                  handleAssignLead(lead.id, value === "unassigned" ? "" : value);
                                }}
                                disabled={assigningLead === lead.id}
                              >
                                <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-7 w-32">
                                  <SelectValue placeholder="Assign..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  {salesUsers.map((u: any) => (
                                    <SelectItem key={u.id} value={u.id}>
                                      {u.full_name || u.email?.split("@")[0] || u.id}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-2 px-3 text-right text-xs font-semibold text-slate-900">
                              {formatCurrencyCompact(lead.value || 0)}
                            </td>
                            <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-center gap-1">
                                {(() => {
                                  const phoneNumbers = parsePhoneNumbers(lead.contact_phone || lead.phone);
                                  if (phoneNumbers.length === 0) {
                                    return (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 hover:bg-slate-100"
                                        title="No phone number"
                                        disabled
                                      >
                                        <PhoneIcon className="w-3.5 h-3.5 text-slate-400" />
                                      </Button>
                                    );
                                  } else if (phoneNumbers.length === 1) {
                                    return (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 hover:bg-slate-100"
                                        title={`Call ${phoneNumbers[0]}`}
                                        asChild
                                      >
                                        <a href={`tel:${phoneNumbers[0]}`}>
                                          <PhoneIcon className="w-3.5 h-3.5" />
                                        </a>
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
                                            <PhoneIcon className="w-3.5 h-3.5" />
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
                                    );
                                  }
                                })()}
                                <Button 
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-slate-100"
                                  title="Email"
                                  onClick={() => handleEmail(lead)}
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                </Button>
                                {(() => {
                                  const phoneNumbers = parsePhoneNumbers(lead.contact_phone || lead.phone || (lead as any).mobile_phone);
                                  if (phoneNumbers.length === 0) {
                                    return (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 hover:bg-slate-100"
                                        title="WhatsApp - No phone number"
                                        disabled
                                      >
                                        <MessageCircle className="w-3.5 h-3.5 text-slate-400" />
                                      </Button>
                                    );
                                  }
                                  return (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 hover:bg-green-100"
                                      title="WhatsApp"
                                      onClick={() => handleWhatsApp(lead)}
                                    >
                                      <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                                    </Button>
                                  );
                                })()}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-slate-100"
                                  title="Add Note"
                                  onClick={() => handleAddNote(lead)}
                                >
                                  <StickyNote className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-slate-100"
                                  title="Schedule Callback"
                                  onClick={() => handleScheduleCallback(lead)}
                                >
                                  <Calendar className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-slate-100"
                                  title="Edit"
                                  onClick={() => {
                                    setSelectedLead(lead);
                                    openEditLeadModal();
                                  }}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                      <MoreHorizontal className="w-3.5 h-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => {
                                      setSelectedLead(lead);
                                      setShowDetailsModal(true);
                                    }}>
                                      View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      setSelectedLead(lead);
                                      openEditLeadModal();
                                    }}>
                                      Edit Lead
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={async () => {
                                        if (confirm(`Are you sure you want to delete ${lead.company_name}?`)) {
                                          try {
                                            await deleteLead(lead.id);
                                            const leadsRes = await getLeads();
                                            setLeads(leadsRes.data || []);
                                            alert("Lead deleted successfully");
                                          } catch (error: any) {
                                            alert(`Failed to delete lead: ${error.message || 'Unknown error'}`);
                                          }
                                        }
                                      }}
                                      className="text-red-600"
                                    >
                                      Delete Lead
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                  );
                })}
                    </tbody>
                  </table>
              </div>
              )}
            </Card>
          </>
        )}

        {selectedProject && (
          <>
            {/* Bulk Actions Toolbar */}
            {selectedLeadIds.size > 0 && (
              <Card className="p-4 bg-blue-50 border-blue-200 shadow-sm mb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-blue-900">
                      {selectedLeadIds.size} lead{selectedLeadIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedLeadIds(new Set())}
                      className="text-xs"
                    >
                      Clear Selection
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setShowBulkAssignModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Assign to Salesman
                    </Button>
                    <Button
                      onClick={() => setShowBulkDeleteModal(true)}
                      variant="destructive"
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Selected
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Leads Table */}
            <Card className="p-3 sm:p-6 bg-white border-slate-200">
              {/* Select All Header */}
              {filteredLeads.length > 0 && (
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={handleSelectAll}
                    className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Select All ({filteredLeads.length} leads)
                  </span>
                </div>
              )}
              
              {filteredLeads.length === 0 && leads.length > 0 && (
                <div className="text-center py-12">
                  <Filter className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                  <p className="text-slate-500 mb-2">No leads match the current filters</p>
                  <p className="text-sm text-slate-500">Try adjusting your filters or search term</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => {
                      setStatusFilter("all");
                      setAssigneeFilter("all");
                      setSearchTerm("");
                    }}
                  >
                    Clear Filters
                  </Button>
                </div>
              )}
              
              {filteredLeads.length === 0 && leads.length === 0 && (
                <div className="text-center py-12">
                  <Clock className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-500">No leads found for this project. Add your first lead to get started!</p>
                </div>
              )}

              {filteredLeads.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700 w-10">
                          <Checkbox
                            checked={allFilteredSelected}
                            onCheckedChange={handleSelectAll}
                            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                          />
                        </th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Lead</th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Project</th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Contact</th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Assigned To</th>
                        <th className="text-right py-2 px-3 font-medium text-xs text-slate-700">Value</th>
                        <th className="text-center py-2 px-3 font-medium text-xs text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                {filteredLeads.map((lead) => {
                  const assignedUser = salesUsers.find(u => u.id === lead.assigned_to);
                  const assignedName = assignedUser?.full_name || assignedUser?.email?.split("@")[0] || "Unassigned";
                  const lastTouched = lead.updated_at || lead.created_at;
                  const daysStale = lastTouched ? Math.floor((Date.now() - new Date(lastTouched).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                  const isStale = daysStale > 7;
                        const isSelected = selectedLeadIds.has(lead.id);
                        const projectName = projects.find(p => p.id === lead.project_id)?.name || 'No Project';
                  
                  return (
                          <tr 
                            key={lead.id} 
                            className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''} ${leadNoteCounts[lead.id] > 0 ? 'bg-blue-50/30' : ''}`}
                            onClick={() => {
                      setSelectedLead(lead);
                      setShowDetailsModal(true);
                            }}
                          >
                            <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => handleToggleLead(lead.id, checked)}
                                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-8 h-8 ring-1 ring-slate-200">
                                  <AvatarFallback className="bg-slate-900 text-white font-semibold text-xs">
                                    {(lead.company_name || "?").slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-xs font-medium text-slate-900">{lead.company_name}</div>
                                    {leadNoteCounts[lead.id] > 0 && (
                                      <div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium border border-blue-200">
                                        <StickyNote className="w-3 h-3" />
                                        <span>{leadNoteCounts[lead.id]}</span>
                                      </div>
                                    )}
                                  </div>
                            {isStale && (
                                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs px-1.5 py-0.5 mt-0.5">
                                      Stale ({daysStale}d)
                                    </Badge>
                            )}
                          </div>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              {projectName !== 'No Project' ? (
                                <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs px-2 py-0.5">
                                  {projectName}
                                </Badge>
                              ) : (
                                <span className="text-xs text-slate-400">No project</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex flex-col gap-1">
                                <div className="text-xs text-slate-900">{lead.contact_name || 'N/A'}</div>
                            {lead.email && (
                                  <div className="text-xs text-slate-500 truncate max-w-[150px]">{lead.email}</div>
                            )}
                            {lead.phone && (
                                  <div className="text-xs text-slate-500">{lead.phone}</div>
                                )}
                                {/* Note + Callback indicators */}
                                <div className="flex flex-wrap gap-1">
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
                                  {normalizeStatus(lead.status) === 'not_interested' && (
                                    <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] px-1.5 py-0.5">
                                      Not Interested
                                    </Badge>
                            )}
                          </div>
                                {(lead.followup_notes || lead.lead_notes) && (
                                  <div className="text-[11px] text-slate-500 line-clamp-2">
                                    {(lead.followup_notes || lead.lead_notes || '').slice(0, 80)}
                                    {(lead.followup_notes || lead.lead_notes || '').length > 80 ? '…' : ''}
                          </div>
                                )}
                        </div>
                            </td>
                            <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={normalizeStatus(lead.status) || lead.status}
                                onValueChange={(value) => {
                                  handleStatusChange(lead.id, value);
                                }}
                                disabled={updatingLeadId === lead.id}
                              >
                                <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-7 w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="new">New</SelectItem>
                                  <SelectItem value="qualified">Qualified</SelectItem>
                                  <SelectItem value="proposal">In Proposal</SelectItem>
                                  <SelectItem value="closed_won">Closed Won</SelectItem>
                                  <SelectItem value="not_interested">Not Interested</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={lead.assigned_to || "unassigned"}
                            onValueChange={(value) => {
                              handleAssignLead(lead.id, value === "unassigned" ? "" : value);
                            }}
                            disabled={assigningLead === lead.id}
                          >
                                <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-7 w-32">
                                  <SelectValue placeholder="Assign..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {salesUsers.map((u: any) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.full_name || u.email?.split("@")[0] || u.id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                            </td>
                            <td className="py-2 px-3 text-right text-xs font-semibold text-slate-900">
                              {formatCurrencyCompact(lead.value || 0)}
                            </td>
                            <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-center gap-1">
                                {(() => {
                                  const phoneNumbers = parsePhoneNumbers(lead.contact_phone || lead.phone);
                                  if (phoneNumbers.length === 0) {
                                    return (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 hover:bg-slate-100"
                                        title="No phone number"
                                        disabled
                            >
                                        <PhoneIcon className="w-3.5 h-3.5 text-slate-400" />
                                      </Button>
                                    );
                                  } else if (phoneNumbers.length === 1) {
                                    return (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 hover:bg-slate-100"
                                        title={`Call ${phoneNumbers[0]}`}
                                        asChild
                                      >
                                        <a href={`tel:${phoneNumbers[0]}`}>
                                          <PhoneIcon className="w-3.5 h-3.5" />
                                        </a>
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
                                            title={`${phoneNumbers.length} phone numbers`}
                                          >
                                            <PhoneIcon className="w-3.5 h-3.5" />
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
                                    );
                                  }
                                })()}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-slate-100"
                                  title="Email"
                                  onClick={() => handleEmail(lead)}
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                </Button>
                                {(() => {
                                  const phoneNumbers = parsePhoneNumbers(lead.contact_phone || lead.phone || (lead as any).mobile_phone);
                                  if (phoneNumbers.length === 0) {
                                    return (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 hover:bg-slate-100"
                                        title="WhatsApp - No phone number"
                                        disabled
                                      >
                                        <MessageCircle className="w-3.5 h-3.5 text-slate-400" />
                                      </Button>
                                    );
                                  }
                                  return (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 hover:bg-green-100"
                                      title="WhatsApp"
                                      onClick={() => handleWhatsApp(lead)}
                                    >
                                      <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                                    </Button>
                                  );
                                })()}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-slate-100"
                                  title="Add Note"
                                  onClick={() => handleAddNote(lead)}
                                >
                                  <StickyNote className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-slate-100"
                                  title="Schedule Callback"
                                  onClick={() => handleScheduleCallback(lead)}
                                >
                                  <Calendar className="w-3.5 h-3.5" />
                                </Button>
                                <Button 
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-slate-100"
                                  title="Edit"
                      onClick={() => {
                                    setSelectedLead(lead);
                                    openEditLeadModal();
                      }}
                    >
                                  <Edit className="w-3.5 h-3.5" />
                    </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                      <MoreHorizontal className="w-3.5 h-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => {
                                      setSelectedLead(lead);
                                      setShowDetailsModal(true);
                                    }}>
                                      View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      setSelectedLead(lead);
                                      openEditLeadModal();
                                    }}>
                                      Edit Lead
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={async () => {
                                        if (confirm(`Are you sure you want to delete ${lead.company_name}?`)) {
                                          try {
                                            await deleteLead(lead.id);
                                            const leadsRes = await getLeads();
                                            setLeads(leadsRes.data || []);
                                            alert("Lead deleted successfully");
                                          } catch (error: any) {
                                            alert(`Failed to delete lead: ${error.message || 'Unknown error'}`);
                                          }
                                        }
                                      }}
                                      className="text-red-600"
                                    >
                                      Delete Lead
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                  </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                )}
            </Card>
          </>
        )}

        {/* Add Lead Modal */}
        <Dialog open={showAddLeadModal} onOpenChange={setShowAddLeadModal}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Lead</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {createMessage && (
                <Alert className={createMessage.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                  <AlertDescription className={createMessage.type === "success" ? "text-green-700" : "text-red-700"}>
                    {createMessage.text}
                  </AlertDescription>
                </Alert>
              )}
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="basic">Basic Info</TabsTrigger>
                  <TabsTrigger value="contact">Contact</TabsTrigger>
                  <TabsTrigger value="address">Address</TabsTrigger>
                  <TabsTrigger value="classification">Classification</TabsTrigger>
                  <TabsTrigger value="followup">Follow-up</TabsTrigger>
                </TabsList>
                
                {/* Basic Information Tab */}
                <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="mb-4">
                <Label htmlFor="lead-project">Project *</Label>
                <Select
                  value={(leadForm as any).project_id || ""}
                  onValueChange={(value) => setLeadForm({ ...leadForm, project_id: value } as any)}
                >
                  <SelectTrigger id="lead-project">
                    <SelectValue placeholder="Choose which project this lead belongs to" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company">Company Name *</Label>
                  <Input
                    id="company"
                    value={leadForm.company_name}
                    onChange={(e) => setLeadForm({ ...leadForm, company_name: e.target.value })}
                    placeholder="Acme Corp"
                  />
                </div>
                <div>
                  <Label htmlFor="contact">Contact Name *</Label>
                  <Input
                    id="contact"
                    value={leadForm.contact_name}
                    onChange={(e) => setLeadForm({ ...leadForm, contact_name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div>
                      <Label htmlFor="designation">Designation / Title</Label>
                  <Input
                        id="designation"
                        value={leadForm.designation}
                        onChange={(e) => setLeadForm({ ...leadForm, designation: e.target.value })}
                        placeholder="CEO, Manager, etc."
                  />
                </div>
                <div>
                  <Label htmlFor="value">Deal Value (USD) *</Label>
                  <Input
                    id="value"
                    type="number"
                    value={leadForm.value}
                    onChange={(e) => setLeadForm({ ...leadForm, value: e.target.value })}
                    placeholder="50000"
                  />
                </div>
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select value={leadForm.status} onValueChange={(value) => setLeadForm({ ...leadForm, status: value as any })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="qualified">Qualified</SelectItem>
                          <SelectItem value="proposal">Proposal</SelectItem>
                          <SelectItem value="closed_won">Closed Won</SelectItem>
                          <SelectItem value="not_interested">Not Interested</SelectItem>
                        </SelectContent>
                      </Select>
                </div>
                <div>
                  <Label htmlFor="assign">Assign To</Label>
                  <Select value={leadForm.assigned_to || "unassigned"} onValueChange={(value) => setLeadForm({ ...leadForm, assigned_to: value === "unassigned" ? "" : value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select salesperson" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {salesUsers.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.email?.split("@")[0] || u.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                    <div>
                      <Label htmlFor="list-name">List Name</Label>
                      <Input
                        id="list-name"
                        value={leadForm.list_name}
                        onChange={(e) => setLeadForm({ ...leadForm, list_name: e.target.value })}
                        placeholder="List name"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="link">Company Website / Link</Label>
                      <Input
                        id="link"
                        type="url"
                        value={leadForm.link}
                        onChange={(e) => setLeadForm({ ...leadForm, link: e.target.value })}
                        placeholder="https://example.com"
                      />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="description">Notes / Description</Label>
                  <Textarea
                    id="description"
                    value={leadForm.description}
                    onChange={(e) => setLeadForm({ ...leadForm, description: e.target.value })}
                    placeholder="Add any additional notes about this lead..."
                    rows={3}
                  />
                </div>
                  </div>
                </TabsContent>

                {/* Contact Information Tab */}
                <TabsContent value="contact" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={leadForm.email}
                        onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                        placeholder="john@acme.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone (Primary)</Label>
                      <Input
                        id="phone"
                        value={leadForm.phone}
                        onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                        placeholder="+1-555-0000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mobile-phone">Mobile Phone</Label>
                      <Input
                        id="mobile-phone"
                        value={leadForm.mobile_phone}
                        onChange={(e) => setLeadForm({ ...leadForm, mobile_phone: e.target.value })}
                        placeholder="+1-555-0000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="direct-phone">Direct Phone</Label>
                      <Input
                        id="direct-phone"
                        value={leadForm.direct_phone}
                        onChange={(e) => setLeadForm({ ...leadForm, direct_phone: e.target.value })}
                        placeholder="+1-555-0000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="office-phone">Office Phone</Label>
                      <Input
                        id="office-phone"
                        value={leadForm.office_phone}
                        onChange={(e) => setLeadForm({ ...leadForm, office_phone: e.target.value })}
                        placeholder="+1-555-0000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="linkedin">LinkedIn</Label>
                      <Input
                        id="linkedin"
                        type="url"
                        value={leadForm.linkedin}
                        onChange={(e) => setLeadForm({ ...leadForm, linkedin: e.target.value })}
                        placeholder="https://linkedin.com/in/..."
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Address Information Tab */}
                <TabsContent value="address" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                      <Label htmlFor="address-line1">Address Line 1</Label>
                  <Input
                        id="address-line1"
                        value={leadForm.address_line1}
                        onChange={(e) => setLeadForm({ ...leadForm, address_line1: e.target.value })}
                        placeholder="Street address"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="address-line2">Address Line 2</Label>
                      <Input
                        id="address-line2"
                        value={leadForm.address_line2}
                        onChange={(e) => setLeadForm({ ...leadForm, address_line2: e.target.value })}
                        placeholder="Apartment, suite, etc."
                      />
                    </div>
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={leadForm.city}
                        onChange={(e) => setLeadForm({ ...leadForm, city: e.target.value })}
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={leadForm.state}
                        onChange={(e) => setLeadForm({ ...leadForm, state: e.target.value })}
                        placeholder="State"
                      />
                    </div>
                    <div>
                      <Label htmlFor="zip">Zip / Postal Code</Label>
                      <Input
                        id="zip"
                        value={leadForm.zip}
                        onChange={(e) => setLeadForm({ ...leadForm, zip: e.target.value })}
                        placeholder="12345"
                      />
                    </div>
                    <div>
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        value={leadForm.country}
                        onChange={(e) => setLeadForm({ ...leadForm, country: e.target.value })}
                        placeholder="Country"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Classification Tab */}
                <TabsContent value="classification" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="customer-group">Customer Group</Label>
                      <Input
                        id="customer-group"
                        value={leadForm.customer_group}
                        onChange={(e) => setLeadForm({ ...leadForm, customer_group: e.target.value })}
                        placeholder="Customer group"
                      />
                    </div>
                    <div>
                      <Label htmlFor="product-group">Product Group</Label>
                      <Input
                        id="product-group"
                        value={leadForm.product_group}
                        onChange={(e) => setLeadForm({ ...leadForm, product_group: e.target.value })}
                        placeholder="Product group"
                      />
                    </div>
                    <div>
                      <Label htmlFor="software-category">Software Category</Label>
                      <Select value={(leadForm as any).software_category || "other"} onValueChange={(v) => setLeadForm({ ...leadForm, software_category: v } as any)}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="erp">ERP</SelectItem>
                          <SelectItem value="blockchain_erp">Blockchain ERP</SelectItem>
                          <SelectItem value="crm">CRM</SelectItem>
                          <SelectItem value="hrms">HRMS</SelectItem>
                          <SelectItem value="accounting">Accounting</SelectItem>
                          <SelectItem value="inventory">Inventory</SelectItem>
                          <SelectItem value="pos">POS</SelectItem>
                          <SelectItem value="ecommerce">E-Commerce</SelectItem>
                          <SelectItem value="custom">Custom Development</SelectItem>
                          <SelectItem value="saas">SaaS</SelectItem>
                          <SelectItem value="mobile">Mobile App</SelectItem>
                          <SelectItem value="website">Website</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="industry">Industry</Label>
                      <Select value={(leadForm as any).industry || "other"} onValueChange={(v) => setLeadForm({ ...leadForm, industry: v } as any)}>
                        <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manufacturing">Manufacturing</SelectItem>
                          <SelectItem value="retail">Retail</SelectItem>
                          <SelectItem value="healthcare">Healthcare</SelectItem>
                          <SelectItem value="education">Education</SelectItem>
                          <SelectItem value="construction">Construction</SelectItem>
                          <SelectItem value="logistics">Logistics</SelectItem>
                          <SelectItem value="hospitality">Hospitality</SelectItem>
                          <SelectItem value="finance">Finance</SelectItem>
                          <SelectItem value="it">IT / Technology</SelectItem>
                          <SelectItem value="real_estate">Real Estate</SelectItem>
                          <SelectItem value="agriculture">Agriculture</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="priority-select">Priority</Label>
                      <Select value={(leadForm as any).priority || "medium"} onValueChange={(v) => setLeadForm({ ...leadForm, priority: v } as any)}>
                        <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="urgent">🔴 Urgent</SelectItem>
                          <SelectItem value="high">🟠 High</SelectItem>
                          <SelectItem value="medium">🟡 Medium</SelectItem>
                          <SelectItem value="low">🟢 Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="lead-source">Lead Source</Label>
                      <Input
                        id="lead-source"
                        value={leadForm.lead_source}
                        onChange={(e) => setLeadForm({ ...leadForm, lead_source: e.target.value })}
                        placeholder="Website, LinkedIn, Referral, etc."
                      />
                    </div>
                    <div>
                      <Label htmlFor="data-source">Data Source</Label>
                      <Input
                        id="data-source"
                        value={leadForm.data_source}
                        onChange={(e) => setLeadForm({ ...leadForm, data_source: e.target.value })}
                        placeholder="Data source"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lead-score">Lead Score (0-100)</Label>
                      <Input
                        id="lead-score"
                        type="number"
                        min="0"
                        max="100"
                        value={leadForm.lead_score}
                        onChange={(e) => setLeadForm({ ...leadForm, lead_score: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="tags">Tags (comma-separated)</Label>
                      <Input
                        id="tags"
                        value={leadForm.tags}
                        onChange={(e) => setLeadForm({ ...leadForm, tags: e.target.value })}
                        placeholder="tag1, tag2, tag3"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="lead-notes">Lead Notes</Label>
                      <Textarea
                        id="lead-notes"
                        value={leadForm.lead_notes}
                        onChange={(e) => setLeadForm({ ...leadForm, lead_notes: e.target.value })}
                        placeholder="Additional notes about the lead..."
                        rows={3}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="organization-notes">Organization Notes</Label>
                      <Textarea
                        id="organization-notes"
                        value={leadForm.organization_notes}
                        onChange={(e) => setLeadForm({ ...leadForm, organization_notes: e.target.value })}
                        placeholder="Notes about the organization..."
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="date-of-birth">Date of Birth</Label>
                      <Input
                        id="date-of-birth"
                        type="date"
                        value={leadForm.date_of_birth}
                        onChange={(e) => setLeadForm({ ...leadForm, date_of_birth: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="special-event-date">Special Event Date</Label>
                      <Input
                        id="special-event-date"
                        type="date"
                        value={leadForm.special_event_date}
                        onChange={(e) => setLeadForm({ ...leadForm, special_event_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="reference-url1">Reference URL 1</Label>
                      <Input
                        id="reference-url1"
                    type="url"
                        value={leadForm.reference_url1}
                        onChange={(e) => setLeadForm({ ...leadForm, reference_url1: e.target.value })}
                        placeholder="https://..."
                  />
                </div>
                    <div>
                      <Label htmlFor="reference-url2">Reference URL 2</Label>
                      <Input
                        id="reference-url2"
                        type="url"
                        value={leadForm.reference_url2}
                        onChange={(e) => setLeadForm({ ...leadForm, reference_url2: e.target.value })}
                        placeholder="https://..."
                      />
              </div>
                    <div>
                      <Label htmlFor="reference-url3">Reference URL 3</Label>
                      <Input
                        id="reference-url3"
                        type="url"
                        value={leadForm.reference_url3}
                        onChange={(e) => setLeadForm({ ...leadForm, reference_url3: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Follow-up Tab */}
                <TabsContent value="followup" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="next-followup-date">Next Follow-up Date</Label>
                      <Input
                        id="next-followup-date"
                        type="datetime-local"
                        value={leadForm.next_followup_date}
                        onChange={(e) => setLeadForm({ ...leadForm, next_followup_date: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="repeat-followup"
                          checked={leadForm.repeat_followup}
                          onCheckedChange={(checked) => setLeadForm({ ...leadForm, repeat_followup: checked as boolean })}
                        />
                        <Label htmlFor="repeat-followup" className="cursor-pointer">Repeat Follow-up</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="do-not-followup"
                          checked={leadForm.do_not_followup}
                          onCheckedChange={(checked) => setLeadForm({ ...leadForm, do_not_followup: checked as boolean })}
                        />
                        <Label htmlFor="do-not-followup" className="cursor-pointer">Do Not Follow-up</Label>
                      </div>
                    </div>
                    {leadForm.do_not_followup && (
                      <div className="col-span-2">
                        <Label htmlFor="do-not-followup-reason">Do Not Follow-up Reason</Label>
                        <Input
                          id="do-not-followup-reason"
                          value={leadForm.do_not_followup_reason}
                          onChange={(e) => setLeadForm({ ...leadForm, do_not_followup_reason: e.target.value })}
                          placeholder="Reason for not following up"
                        />
                      </div>
                    )}
                    <div className="col-span-2">
                      <Label htmlFor="followup-notes">Follow-up Notes</Label>
                      <Textarea
                        id="followup-notes"
                        value={leadForm.followup_notes}
                        onChange={(e) => setLeadForm({ ...leadForm, followup_notes: e.target.value })}
                        placeholder="Notes for follow-up..."
                        rows={3}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAddLeadModal(false);
                setLeadForm({ ...EMPTY_LEAD_FORM });
                setCreateMessage(null);
              }} disabled={creating}>Cancel</Button>
              <Button onClick={handleCreateLead} disabled={creating}>
                {creating ? "Creating..." : "Create Lead"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Lead Details Modal */}
        <Dialog
          open={showDetailsModal}
          onOpenChange={(open) => {
            setShowDetailsModal(open);
            if (!open) {
              // Remove leadId from URL when closing
              const next = new URLSearchParams(searchParams);
              next.delete("leadId");
              setSearchParams(next, { replace: true });
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
            <DialogHeader className="border-b border-slate-200 pb-4 flex flex-row items-center justify-between">
              <DialogTitle className="text-xl text-slate-900">Lead Details</DialogTitle>
              {selectedLead && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={openEditLeadModal}>
                    Edit Lead
                  </Button>
                  <Button size="sm" variant="destructive" onClick={async () => {
                    if (!window.confirm('Are you sure you want to delete this lead?')) return;
                    try {
                      await deleteLead(selectedLead.id);
                      const leadsRes = await getLeads();
                      setLeads(leadsRes.data || []);
                      setShowDetailsModal(false);
                    } catch (err) {
                      alert('Failed to delete lead.');
                    }
                  }}>
                    Delete Lead
                  </Button>
                </div>
              )}
            </DialogHeader>
            {selectedLead && (
              <div className="space-y-6">
                {/* Header Section */}
                <div className="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold text-slate-900">{selectedLead.company_name}</h3>
                        <p className="text-sm text-slate-600">{selectedLead.contact_name || 'No contact'}</p>
                      </div>
                      <Badge className={`${getStatusColor(selectedLead.status)} text-xs px-3 py-1`}>
                        {selectedLead.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                        {selectedLead.project_id && (
                          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs px-2 py-0.5">
                            {selectedLead.projects?.name || 'Project'}
                          </Badge>
                        )}
                        <span className="text-slate-500">•</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(selectedLead.value || 0)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 justify-start sm:justify-end">
                        <span className="font-medium text-slate-700">Assigned:</span>
                        <span className="text-slate-900">
                          {salesUsers.find(u => u.id === selectedLead.assigned_to)?.full_name ||
                            salesUsers.find(u => u.id === selectedLead.assigned_to)?.email?.split("@")[0] ||
                            'Unassigned'}
                        </span>
                        {selectedLead.updated_at && (
                          <>
                            <span className="text-slate-400">•</span>
                            <span>Updated {new Date(selectedLead.updated_at).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                    Contact Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedLead.email && (
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Email</span>
                        <a href={`mailto:${selectedLead.email}`} className="text-blue-700 hover:text-blue-900 break-all text-sm font-medium">{selectedLead.email}</a>
                      </div>
                    )}
                    {(() => {
                      const phoneNumbers = parsePhoneNumbers(selectedLead.contact_phone || selectedLead.phone);
                      if (phoneNumbers.length > 0) {
                        return (
                          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                            <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">
                              Phone {phoneNumbers.length > 1 ? `(${phoneNumbers.length})` : ''}
                            </span>
                            <div className="space-y-1.5">
                              {phoneNumbers.map((phone, idx) => (
                                <a 
                                  key={idx}
                                  href={`tel:${phone}`} 
                                  className="flex items-center gap-2 text-slate-800 hover:text-blue-700 text-sm font-medium"
                                >
                                  <PhoneIcon className="w-4 h-4" />
                                  <span>{phone}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {(selectedLead as any).designation && (
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Title</span>
                        <span className="text-slate-900 text-sm font-medium">{(selectedLead as any).designation}</span>
                      </div>
                    )}
                    {(selectedLead as any).linkedin && (
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">LinkedIn</span>
                        <a href={(selectedLead as any).linkedin.startsWith('http') ? (selectedLead as any).linkedin : `https://${(selectedLead as any).linkedin}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:text-blue-900 text-sm font-medium underline">View Profile</a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Address Information */}
                {((selectedLead as any).address_line1 || (selectedLead as any).city || (selectedLead as any).state || (selectedLead as any).country) && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-teal-500 rounded-full"></span>
                      Address Information
                    </h4>
                    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
                      {(selectedLead as any).address_line1 && <p className="text-slate-900 text-sm">{(selectedLead as any).address_line1}</p>}
                      {(selectedLead as any).address_line2 && <p className="text-slate-900 text-sm">{(selectedLead as any).address_line2}</p>}
                      <p className="text-slate-700 text-sm">
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

                {/* Classification & Grouping */}
                {((selectedLead as any).customer_group || (selectedLead as any).product_group || (selectedLead as any).tags || (selectedLead as any).lead_source || (selectedLead as any).lead_score) && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-violet-500 rounded-full"></span>
                      Classification & Grouping
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(selectedLead as any).customer_group && (
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                          <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Customer Group</span>
                          <span className="text-slate-900 text-sm font-medium">{(selectedLead as any).customer_group}</span>
                        </div>
                      )}
                      {(selectedLead as any).product_group && (
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                          <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Product Group</span>
                          <span className="text-slate-900 text-sm font-medium">{(selectedLead as any).product_group}</span>
                        </div>
                      )}
                      {(selectedLead as any).lead_source && (
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                          <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Lead Source</span>
                          <span className="text-slate-900 text-sm font-medium">{(selectedLead as any).lead_source}</span>
                        </div>
                      )}
                      {(selectedLead as any).data_source && (
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                          <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Data Source</span>
                          <span className="text-slate-900 text-sm font-medium">{(selectedLead as any).data_source}</span>
                        </div>
                      )}
                      {(selectedLead as any).lead_score !== undefined && (selectedLead as any).lead_score !== null && (
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                          <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Lead Score</span>
                          <span className="text-slate-900 text-sm font-medium">{(selectedLead as any).lead_score}</span>
                        </div>
                      )}
                      {(selectedLead as any).tags && Array.isArray((selectedLead as any).tags) && (selectedLead as any).tags.length > 0 && (
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 sm:col-span-2">
                          <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Tags</span>
                          <div className="flex flex-wrap gap-2">
                            {(selectedLead as any).tags.map((tag: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="bg-white text-slate-800 border-slate-200 text-[11px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Follow-up Information */}
                {((selectedLead as any).next_followup_date || (selectedLead as any).followup_notes || (selectedLead as any).do_not_followup) && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-orange-500 rounded-full"></span>
                      Follow-up Information
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(selectedLead as any).next_followup_date && (
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                          <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Next Follow-up</span>
                          <span className="text-slate-900 text-sm font-medium">{new Date((selectedLead as any).next_followup_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {(selectedLead as any).repeat_followup && (
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                          <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Repeat Follow-up</span>
                          <span className="text-slate-900 text-sm font-medium">Yes</span>
                        </div>
                      )}
                      {(selectedLead as any).do_not_followup && (
                        <div className="p-3 rounded-lg border border-red-200 bg-red-50 sm:col-span-2">
                          <span className="text-[11px] font-semibold text-red-700 block mb-1 uppercase tracking-wide">Do Not Follow-up</span>
                          <span className="text-red-900 text-sm font-medium">Yes</span>
                          {(selectedLead as any).do_not_followup_reason && (
                            <p className="text-red-800 text-sm mt-1">Reason: {(selectedLead as any).do_not_followup_reason}</p>
                          )}
                        </div>
                      )}
                      {(selectedLead as any).followup_notes && (
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 sm:col-span-2">
                          <span className="text-[11px] font-semibold text-slate-600 block mb-1 uppercase tracking-wide">Follow-up Notes</span>
                          <p className="text-slate-900 text-sm">{(selectedLead as any).followup_notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Additional Notes */}
                {((selectedLead as any).lead_notes || (selectedLead as any).organization_notes) && (
                  <div>
                    <h4 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                      Additional Notes
                    </h4>
                    <div className="space-y-3">
                      {(selectedLead as any).lead_notes && (
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                          <span className="text-xs font-semibold text-yellow-700 block mb-2 uppercase tracking-wide">📋 Lead Notes</span>
                          <p className="text-yellow-900 text-sm">{(selectedLead as any).lead_notes}</p>
                        </div>
                      )}
                      {(selectedLead as any).organization_notes && (
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                          <span className="text-xs font-semibold text-yellow-700 block mb-2 uppercase tracking-wide">🏢 Organization Notes</span>
                          <p className="text-yellow-900 text-sm">{(selectedLead as any).organization_notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Personal Information */}
                {((selectedLead as any).date_of_birth || (selectedLead as any).special_event_date) && (
                  <div>
                    <h4 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                      Personal Information
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      {(selectedLead as any).date_of_birth && (
                        <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
                          <span className="text-xs font-semibold text-pink-700 block mb-2 uppercase tracking-wide">🎂 Date of Birth</span>
                          <span className="text-pink-900 text-sm font-medium">{new Date((selectedLead as any).date_of_birth).toLocaleDateString()}</span>
                        </div>
                      )}
                      {(selectedLead as any).special_event_date && (
                        <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
                          <span className="text-xs font-semibold text-pink-700 block mb-2 uppercase tracking-wide">🎉 Special Event Date</span>
                          <span className="text-pink-900 text-sm font-medium">{new Date((selectedLead as any).special_event_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Reference URLs */}
                {((selectedLead as any).reference_url1 || (selectedLead as any).reference_url2 || (selectedLead as any).reference_url3) && (
                  <div>
                    <h4 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                      Reference URLs
                    </h4>
                    <div className="space-y-2">
                      {(selectedLead as any).reference_url1 && (
                        <div className="bg-cyan-50 p-3 rounded-lg border border-cyan-200">
                          <a href={(selectedLead as any).reference_url1.startsWith('http') ? (selectedLead as any).reference_url1 : `https://${(selectedLead as any).reference_url1}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-800 text-sm font-medium underline">🔗 Reference URL 1</a>
                        </div>
                      )}
                      {(selectedLead as any).reference_url2 && (
                        <div className="bg-cyan-50 p-3 rounded-lg border border-cyan-200">
                          <a href={(selectedLead as any).reference_url2.startsWith('http') ? (selectedLead as any).reference_url2 : `https://${(selectedLead as any).reference_url2}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-800 text-sm font-medium underline">🔗 Reference URL 2</a>
                        </div>
                      )}
                      {(selectedLead as any).reference_url3 && (
                        <div className="bg-cyan-50 p-3 rounded-lg border border-cyan-200">
                          <a href={(selectedLead as any).reference_url3.startsWith('http') ? (selectedLead as any).reference_url3 : `https://${(selectedLead as any).reference_url3}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-800 text-sm font-medium underline">🔗 Reference URL 3</a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* List Name */}
                {(selectedLead as any).list_name && (
                  <div>
                    <h4 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                      List Information
                    </h4>
                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                      <span className="text-xs font-semibold text-indigo-700 block mb-2 uppercase tracking-wide">📋 List Name</span>
                      <span className="text-indigo-900 text-sm font-medium">{(selectedLead as any).list_name}</span>
                    </div>
                  </div>
                )}

                {/* Company Link */}
                {selectedLead.link && (
                  <div>
                    <h4 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                      Company Website
                    </h4>
                    <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200 hover:border-cyan-300 hover:bg-cyan-100 transition-all">
                      <a 
                        href={selectedLead.link.startsWith('http') ? selectedLead.link : `https://${selectedLead.link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-600 hover:text-cyan-800 break-all text-sm font-medium underline flex items-center gap-2"
                      >
                        🔗 {selectedLead.link}
                      </a>
                    </div>
                  </div>
                )}

                {/* Deal Information */}
                <div>
                  <h4 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Deal Information
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <span className="text-xs font-semibold text-green-700 block mb-2 uppercase tracking-wide">💰 Deal Value</span>
                      <span className="text-xl font-bold text-green-600">{formatCurrencyCompact(selectedLead.value || 0)}</span>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <span className="text-xs font-semibold text-blue-700 block mb-2 uppercase tracking-wide">📊 Status</span>
                      <span className="text-lg font-bold text-blue-600 capitalize">{selectedLead.status}</span>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                      <span className="text-xs font-semibold text-orange-700 block mb-2 uppercase tracking-wide">📅 Created</span>
                      <span className="text-sm font-bold text-orange-600">{new Date(selectedLead.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Assignment Information */}
                {selectedLead.assigned_to && (() => {
                  const assignedUser = salesUsers.find(u => u.id === selectedLead.assigned_to);
                  return (
                    <div>
                      <h4 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                        Assigned To
                      </h4>
                      <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                        <span className="text-lg font-bold text-indigo-900">{assignedUser?.full_name || assignedUser?.email?.split("@")[0] || "Unknown"}</span>
                        {assignedUser?.email && <p className="text-sm text-indigo-700 mt-2">📧 {assignedUser.email}</p>}
                      </div>
                    </div>
                  );
                })()}

                {/* Lead Description */}
                {selectedLead.description && (
                  <div>
                    <h4 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                      Lead Description
                    </h4>
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <p className="text-slate-700 text-sm leading-relaxed">{selectedLead.description}</p>
                    </div>
                  </div>
                )}

                {/* Recent Notes Section */}
                <div>
                  <h4 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
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
                            <p className="text-slate-500 text-sm">✍️ No notes added yet. Salesperson can add notes from their dashboard.</p>
                          </div>
                        );
                      }
                      return notes.map((a: any, idx: number) => (
                        <div key={a.id} className="bg-pink-50 p-4 rounded-lg border border-pink-200 hover:border-pink-300 hover:bg-pink-100 transition-all">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <span className="text-base font-bold text-pink-900">{a.title || 'Note'}</span>
                            <span className="text-xs text-slate-600 whitespace-nowrap bg-white px-2 py-1 rounded border border-slate-200">{new Date(a.created_at).toLocaleString()}</span>
                          </div>
                          {a.description && (
                            <p className="text-slate-700 text-sm leading-relaxed break-words">{a.description}</p>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Lead Modal */}
        <Dialog open={showEditLeadModal} onOpenChange={setShowEditLeadModal}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Lead - {editLeadForm?.company_name || 'Lead'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {editMessage && (
                <Alert className={editMessage.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                  <AlertDescription className={editMessage.type === "success" ? "text-green-700" : "text-red-700"}>
                    {editMessage.text}
                  </AlertDescription>
                </Alert>
              )}
              {editLeadForm && (
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="basic">Basic Info</TabsTrigger>
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
                          value={editLeadForm.company_name || ''}
                      onChange={(e) => setEditLeadForm({ ...editLeadForm, company_name: e.target.value })}
                      placeholder="Acme Corp"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-contact">Contact Name *</Label>
                    <Input
                      id="edit-contact"
                          value={editLeadForm.contact_name || ''}
                      onChange={(e) => setEditLeadForm({ ...editLeadForm, contact_name: e.target.value })}
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                        <Label htmlFor="edit-designation">Designation / Title</Label>
                    <Input
                          id="edit-designation"
                          value={editLeadForm.designation || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, designation: e.target.value })}
                          placeholder="CEO, Manager, etc."
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-value">Deal Value (USD) *</Label>
                    <Input
                      id="edit-value"
                      type="number"
                      value={editLeadForm.value}
                      onChange={(e) => setEditLeadForm({ ...editLeadForm, value: e.target.value })}
                      placeholder="50000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-status">Status</Label>
                    <Select value={editLeadForm.status} onValueChange={(value) => setEditLeadForm({ ...editLeadForm, status: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="qualified">Qualified</SelectItem>
                        <SelectItem value="proposal">Proposal</SelectItem>
                        <SelectItem value="closed_won">Closed Won</SelectItem>
                        <SelectItem value="not_interested">Not Interested</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                      <div>
                        <Label htmlFor="edit-list-name">List Name</Label>
                        <Input
                          id="edit-list-name"
                          value={editLeadForm.list_name || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, list_name: e.target.value })}
                          placeholder="List name"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="edit-link">Company Website / Link</Label>
                        <Input
                          id="edit-link"
                          type="url"
                          value={editLeadForm.link || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, link: e.target.value })}
                          placeholder="https://example.com"
                        />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="edit-description">Notes / Description</Label>
                    <Textarea
                      id="edit-description"
                          value={editLeadForm.description || ''}
                      onChange={(e) => setEditLeadForm({ ...editLeadForm, description: e.target.value })}
                      placeholder="Add any additional notes about this lead..."
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
                          value={editLeadForm.email || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, email: e.target.value })}
                          placeholder="john@acme.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-phone">Phone (Primary)</Label>
                        <Input
                          id="edit-phone"
                          value={editLeadForm.phone || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, phone: e.target.value })}
                          placeholder="+1-555-0000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-mobile-phone">Mobile Phone</Label>
                        <Input
                          id="edit-mobile-phone"
                          value={editLeadForm.mobile_phone || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, mobile_phone: e.target.value })}
                          placeholder="+1-555-0000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-direct-phone">Direct Phone</Label>
                        <Input
                          id="edit-direct-phone"
                          value={editLeadForm.direct_phone || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, direct_phone: e.target.value })}
                          placeholder="+1-555-0000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-office-phone">Office Phone</Label>
                        <Input
                          id="edit-office-phone"
                          value={editLeadForm.office_phone || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, office_phone: e.target.value })}
                          placeholder="+1-555-0000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-linkedin">LinkedIn</Label>
                        <Input
                          id="edit-linkedin"
                          type="url"
                          value={editLeadForm.linkedin || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, linkedin: e.target.value })}
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
                          value={editLeadForm.address_line1 || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, address_line1: e.target.value })}
                          placeholder="Street address"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="edit-address-line2">Address Line 2</Label>
                        <Input
                          id="edit-address-line2"
                          value={editLeadForm.address_line2 || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, address_line2: e.target.value })}
                          placeholder="Apartment, suite, etc."
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-city">City</Label>
                        <Input
                          id="edit-city"
                          value={editLeadForm.city || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, city: e.target.value })}
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-state">State</Label>
                        <Input
                          id="edit-state"
                          value={editLeadForm.state || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, state: e.target.value })}
                          placeholder="State"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-zip">Zip / Postal Code</Label>
                        <Input
                          id="edit-zip"
                          value={editLeadForm.zip || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, zip: e.target.value })}
                          placeholder="12345"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-country">Country</Label>
                        <Input
                          id="edit-country"
                          value={editLeadForm.country || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, country: e.target.value })}
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
                          value={editLeadForm.customer_group || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, customer_group: e.target.value })}
                          placeholder="Customer group"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-product-group">Product Group</Label>
                        <Input
                          id="edit-product-group"
                          value={editLeadForm.product_group || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, product_group: e.target.value })}
                          placeholder="Product group"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-lead-source">Lead Source</Label>
                        <Input
                          id="edit-lead-source"
                          value={editLeadForm.lead_source || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, lead_source: e.target.value })}
                          placeholder="Website, LinkedIn, Referral, etc."
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-data-source">Data Source</Label>
                        <Input
                          id="edit-data-source"
                          value={editLeadForm.data_source || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, data_source: e.target.value })}
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
                          value={editLeadForm.lead_score || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, lead_score: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="0"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="edit-tags">Tags (comma-separated)</Label>
                        <Input
                          id="edit-tags"
                          value={Array.isArray(editLeadForm.tags) ? editLeadForm.tags.join(', ') : (editLeadForm.tags || '')}
                          onChange={(e) => {
                            const tags = e.target.value.split(',').map(t => t.trim()).filter(t => t);
                            setEditLeadForm({ ...editLeadForm, tags: tags.length > 0 ? tags : null });
                          }}
                          placeholder="tag1, tag2, tag3"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="edit-lead-notes">Lead Notes</Label>
                        <Textarea
                          id="edit-lead-notes"
                          value={editLeadForm.lead_notes || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, lead_notes: e.target.value })}
                          placeholder="Additional notes about the lead..."
                          rows={3}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="edit-organization-notes">Organization Notes</Label>
                        <Textarea
                          id="edit-organization-notes"
                          value={editLeadForm.organization_notes || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, organization_notes: e.target.value })}
                          placeholder="Notes about the organization..."
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-date-of-birth">Date of Birth</Label>
                        <Input
                          id="edit-date-of-birth"
                          type="date"
                          value={editLeadForm.date_of_birth || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, date_of_birth: e.target.value || null })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-special-event-date">Special Event Date</Label>
                        <Input
                          id="edit-special-event-date"
                          type="date"
                          value={editLeadForm.special_event_date || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, special_event_date: e.target.value || null })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-reference-url1">Reference URL 1</Label>
                        <Input
                          id="edit-reference-url1"
                      type="url"
                          value={editLeadForm.reference_url1 || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, reference_url1: e.target.value })}
                          placeholder="https://..."
                    />
                  </div>
                      <div>
                        <Label htmlFor="edit-reference-url2">Reference URL 2</Label>
                        <Input
                          id="edit-reference-url2"
                          type="url"
                          value={editLeadForm.reference_url2 || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, reference_url2: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-reference-url3">Reference URL 3</Label>
                        <Input
                          id="edit-reference-url3"
                          type="url"
                          value={editLeadForm.reference_url3 || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, reference_url3: e.target.value })}
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
                          value={editLeadForm.next_followup_date ? new Date(editLeadForm.next_followup_date).toISOString().slice(0, 16) : ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, next_followup_date: e.target.value || null })}
                        />
                      </div>
                      <div className="flex items-end gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="edit-repeat-followup"
                            checked={editLeadForm.repeat_followup || false}
                            onCheckedChange={(checked) => setEditLeadForm({ ...editLeadForm, repeat_followup: checked as boolean })}
                          />
                          <Label htmlFor="edit-repeat-followup" className="cursor-pointer">Repeat Follow-up</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="edit-do-not-followup"
                            checked={editLeadForm.do_not_followup || false}
                            onCheckedChange={(checked) => setEditLeadForm({ ...editLeadForm, do_not_followup: checked as boolean })}
                          />
                          <Label htmlFor="edit-do-not-followup" className="cursor-pointer">Do Not Follow-up</Label>
                        </div>
                      </div>
                      {editLeadForm.do_not_followup && (
                        <div className="col-span-2">
                          <Label htmlFor="edit-do-not-followup-reason">Do Not Follow-up Reason</Label>
                          <Input
                            id="edit-do-not-followup-reason"
                            value={editLeadForm.do_not_followup_reason || ''}
                            onChange={(e) => setEditLeadForm({ ...editLeadForm, do_not_followup_reason: e.target.value })}
                            placeholder="Reason for not following up"
                          />
                </div>
                      )}
                      <div className="col-span-2">
                        <Label htmlFor="edit-followup-notes">Follow-up Notes</Label>
                        <Textarea
                          id="edit-followup-notes"
                          value={editLeadForm.followup_notes || ''}
                          onChange={(e) => setEditLeadForm({ ...editLeadForm, followup_notes: e.target.value })}
                          placeholder="Notes for follow-up..."
                          rows={3}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditLeadModal(false)} disabled={editing}>Cancel</Button>
              <Button onClick={handleEditLead} disabled={editing}>
                {editing ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Import Modal */}
        <Dialog open={showBulkImportModal} onOpenChange={setShowBulkImportModal}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                Bulk Import Leads from Excel
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {importMessage && (
                <Alert className={importMessage.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                  <AlertDescription className={importMessage.type === "success" ? "text-green-700" : "text-red-700"}>
                    {importMessage.text}
                  </AlertDescription>
                </Alert>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Excel File Format</h4>
                <p className="text-sm text-blue-800 mb-2">Your Excel file should have the following columns (column names are case-insensitive):</p>
                <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
                  <li><strong>Required:</strong> Company Name (or Company, company_name)</li>
                  <li><strong>Optional:</strong> Contact Name, Email, Phone, Description, Link/Website, Value/Deal Value</li>
                  <li><strong>Multiple Phone Numbers:</strong> You can have multiple phone columns (Phone, Mobile, Phone 1, Phone 2, etc.) or comma/semicolon-separated values in a single column</li>
                </ul>
                <p className="text-xs text-blue-700 mt-2">The first row should contain column headers. Rows without a company name will be skipped. Multiple phone numbers will be detected automatically.</p>
              </div>

              <div>
                <Label htmlFor="import-project">Select Project *</Label>
                <Select 
                  value={selectedImportProject} 
                  onValueChange={setSelectedImportProject}
                >
                  <SelectTrigger>
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

              <div>
                <Label htmlFor="excel-file">Upload Excel File (.xlsx or .xls)</Label>
                <Input
                  id="excel-file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelFile}
                  className="cursor-pointer"
                />
              </div>

              {excelData.length > 0 && (() => {
                // Helper to find phone number (same as in handleBulkImport)
                const findPhoneNumber = (row: any): string => {
                  const phoneVariations = [
                    "Phone", "phone", "PHONE", "Phone Number", "phone number", "PhoneNumber", "phone_number",
                    "Contact Phone", "contact phone", "ContactPhone", "contact_phone", "Mobile", "mobile",
                    "Mobile Number", "mobile number", "Cell", "cell", "Tel", "tel", "Telephone", "telephone",
                    "Contact Number", "contact number", "ContactNumber", "contact_number", "Phone No", "phone no",
                    "Mobile No", "mobile no", "Contact No", "contact no", "Number", "number", "No", "no",
                    "Phno", "phno", "PHNO", "PhNo", "Ph No", "ph no",  // Add Phno variations
                  ];
                  for (const variation of phoneVariations) {
                    if (row[variation] !== undefined && row[variation] !== null) {
                      let value: string;
                      if (typeof row[variation] === 'number') {
                        value = String(row[variation]);
                      } else {
                        value = String(row[variation]).trim();
                      }
                      if (value && value !== "null" && value !== "undefined" && value.length >= 6) {
                        return value;
                      }
                    }
                  }
                  const rowKeys = Object.keys(row);
                  for (const key of rowKeys) {
                    const lowerKey = key.toLowerCase().replace(/[_\s-]/g, '');
                    if (lowerKey.includes('phone') || lowerKey.includes('phno') || lowerKey === 'ph' || lowerKey === 'phno' ||
                        lowerKey.includes('mobile') || lowerKey.includes('cell') || 
                        lowerKey.includes('tel') || (lowerKey.includes('contact') && (lowerKey.includes('no') || lowerKey.includes('num')))) {
                      const rawValue = row[key];
                      if (rawValue !== undefined && rawValue !== null) {
                        let value: string;
                        if (typeof rawValue === 'number') {
                          value = String(rawValue);
                        } else {
                          value = String(rawValue).trim();
                        }
                        if (value && value.length >= 6 && /\d/.test(value)) {
                          return value;
                        }
                      }
                    }
                  }
                  return "";
                };
                
                const findEmail = (row: any): string => {
                  const emailVariations = ["Email", "email", "EMAIL", "E-mail", "e-mail", "Contact Email", "contact email"];
                  for (const variation of emailVariations) {
                    if (row[variation] !== undefined && row[variation] !== null) {
                      const value = String(row[variation]).trim();
                      if (value) return value;
                    }
                  }
                  const rowKeys = Object.keys(row);
                  for (const key of rowKeys) {
                    const lowerKey = key.toLowerCase().replace(/[_\s-]/g, '');
                    if (lowerKey.includes('email') || lowerKey.includes('mail')) {
                      const value = String(row[key] || '').trim();
                      if (value && value.includes('@')) return value;
                    }
                  }
                  return "";
                };
                
                return (
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
                              <th key={idx} className="px-3 py-2 text-left border-b border-slate-200 font-semibold text-slate-700">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {excelData.slice(0, 10).map((row, rowIdx) => (
                            <tr key={rowIdx} className="border-b border-slate-100 hover:bg-slate-50">
                              {excelHeaders.map((header, colIdx) => (
                                <td key={colIdx} className="px-3 py-2 text-slate-600">
                                  {(() => {
                                    const val = row[header];
                                    if (val !== undefined && val !== null) {
                                      if (typeof val === 'number') return String(val);
                                      return String(val).substring(0, 50);
                                    }
                                    return "";
                                  })()}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {excelData.length > 10 && (
                        <div className="p-2 text-xs text-slate-500 text-center bg-slate-50">
                          Showing first 10 of {excelData.length} rows. All rows will be imported.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {excelHeaders.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h4 className="font-semibold text-slate-900 mb-2">Detected Columns:</h4>
                  <div className="flex flex-wrap gap-2">
                    {excelHeaders.map((header, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {header}
                      </Badge>
                    ))}
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
                  setImportMessage(null);
                }} 
                disabled={importing}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleBulkImport} 
                disabled={importing || excelData.length === 0 || !selectedImportProject}
                className="bg-green-600 hover:bg-green-700"
              >
                {importing ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import {excelData.length} Lead(s)
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Assign Modal */}
        <Dialog open={showBulkAssignModal} onOpenChange={setShowBulkAssignModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Bulk Assign Leads</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  Assign {selectedLeadIds.size} selected lead{selectedLeadIds.size !== 1 ? 's' : ''} to a salesman.
                </AlertDescription>
              </Alert>
              <div>
                <Label htmlFor="bulk-assign-salesman">Select Salesman</Label>
                <Select 
                  value={bulkAssignSalesman} 
                  onValueChange={setBulkAssignSalesman}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a salesman" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.email?.split("@")[0] || u.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowBulkAssignModal(false);
                  setBulkAssignSalesman("");
                }} 
                disabled={bulkAssigning}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleBulkAssign} 
                disabled={bulkAssigning || !bulkAssignSalesman}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {bulkAssigning ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Assign {selectedLeadIds.size} Lead{selectedLeadIds.size !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Modal */}
        <Dialog open={showBulkDeleteModal} onOpenChange={setShowBulkDeleteModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Leads</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Are you sure you want to delete {selectedLeadIds.size} selected lead{selectedLeadIds.size !== 1 ? 's' : ''}? 
                  This action cannot be undone.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowBulkDeleteModal(false);
                }} 
                disabled={bulkDeleting}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleBulkDelete} 
                disabled={bulkDeleting}
                variant="destructive"
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {bulkDeleting ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete {selectedLeadIds.size} Lead{selectedLeadIds.size !== 1 ? 's' : ''}
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
                  {selectedLeadForEmail.contact_name && (
                    <p className="text-xs text-slate-600 mt-1">{selectedLeadForEmail.contact_name}</p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email-subject">Subject *</Label>
                <Input
                  id="email-subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Enter subject"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-body">Message *</Label>
                <Textarea
                  id="email-body"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={8}
                  placeholder="Enter your email message..."
                  className="font-medium"
                />
                <p className="text-xs text-slate-500">
                  You can customize this message before sending. The message will open in Gmail (or your default mail client).
                </p>
              </div>
            </div>
            <DialogFooter>
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
              <Button
                onClick={handleSendEmail}
                disabled={!emailSubject.trim() || !emailBody.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Mail className="w-4 h-4 mr-2" />
                Send Email
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>

      {/* AI Lead Generation Dialog */}
      <AILeadGenerationDialog
        open={showAILeadDialog}
        onClose={() => setShowAILeadDialog(false)}
        projects={projects}
        defaultProjectId={selectedProject?.id}
        existingLeads={leads}
        salesUsers={salesUsers}
        onLeadsImported={async () => {
          const leadsRes = await import("@/lib/supabase").then(m => m.getLeads());
          if (leadsRes?.data) setLeads(leadsRes.data as any[]);
        }}
      />


      {/* AI Lead Scoring Dialog */}
      <AILeadScoringDialog
        open={showScoringDialog}
        onClose={() => setShowScoringDialog(false)}
        leads={filteredLeads}
        onScoresApplied={(scores) => {
          setAiScores((prev) => ({ ...prev, ...scores }));
          setShowScoringDialog(false);
        }}
      />

      {/* WhatsApp Bulk Sender */}
      <WhatsAppSender
        open={showWhatsApp}
        onClose={() => setShowWhatsApp(false)}
        leads={leads.filter(l => selectedLeadIds.has(l.id))}
        mode={selectedLeadIds.size === 1 ? "single" : "bulk"}
      />

      {/* WhatsApp Group Import */}
      <WhatsAppGroupImport
        open={showWAGroupImport}
        onClose={() => setShowWAGroupImport(false)}
        projects={projects}
        salesUsers={salesUsers}
        defaultProjectId={selectedProject?.id}
        onImported={async (count) => {
          // Reload leads after import
          const leadsRes = await import("@/lib/supabase").then(m => m.getLeads());
          if (leadsRes?.data) setLeads(leadsRes.data as any[]);
        }}
      />
    </div>
  );
};

export default ManagerLeads;





