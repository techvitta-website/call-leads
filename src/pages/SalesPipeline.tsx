import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader,
  Phone,
  Mail,
  DollarSign,
  Calendar,
  Building2,
  User,
  TrendingUp,
  Search,
  Filter,
  MoreVertical,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  ChevronDown,
  Edit,
  MoreHorizontal,
  Upload,
  FileSpreadsheet,
  MessageCircle,
  StickyNote,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getLeads, getCurrentUser, getUserRole, updateLead, createBulkLeads, getProjects, subscribeToLeads, createLeadActivity } from "@/lib/supabase";
import { formatCurrency, formatCurrencyCompact } from "@/utils/currency";
import * as XLSX from "xlsx";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import { formatDistanceToNow } from "date-fns";
import type { Role as UserRole } from "@/lib/roles";

type StageKey = "new" | "qualified" | "proposal" | "closed_won" | "not_interested";

const stageMeta: Record<StageKey, { label: string; color: string; description: string }> = {
  new: {
    label: "New Leads",
    color: "blue",
    description: "Fresh opportunities to pursue",
  },
  qualified: {
    label: "Qualified",
    color: "purple",
    description: "Vetted and engaged prospects",
  },
  proposal: {
    label: "Proposal Sent",
    color: "amber",
    description: "Awaiting decision",
  },
  closed_won: {
    label: "Closed",
    color: "emerald",
    description: "Successfully closed deals",
  },
  not_interested: {
    label: "Archived",
    color: "slate",
    description: "Declined or inactive",
  },
};


const SalesPipeline = () => {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedStage, setSelectedStage] = useState<StageKey>("new");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    company_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    value: 0,
    source: "",
    status: "new",
    description: "",
    project_id: "",
    // New comprehensive fields
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
    link: "",
  });
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Bulk import states
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedImportProject, setSelectedImportProject] = useState<string>("");
  const [projects, setProjects] = useState<any[]>([]);
  
  // WhatsApp, Notes, and Schedule modals
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [selectedLeadForWhatsApp, setSelectedLeadForWhatsApp] = useState<any | null>(null);
  const [selectedLeadForActivity, setSelectedLeadForActivity] = useState<any | null>(null);
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [noteText, setNoteText] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackNotes, setCallbackNotes] = useState("");
  const [submittingActivity, setSubmittingActivity] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          navigate('/', { replace: true });
          return;
        }

        setCurrentUser(user);
        
        // Use centralized role check - always gets fresh data from DB
        const userRole = await getUserRole(user.id);
        
        if (!userRole || userRole !== 'salesman') {
          const roleRoutes: Record<string, string> = { owner: '/owner', manager: '/manager' };
          navigate(roleRoutes[userRole as UserRole] || '/', { replace: true });
          return;
        }

        const { data } = await getLeads(user ? { assignedTo: user.id } : undefined);
        setLeads(data || []);
        
        // Load projects for bulk import
        const projectsRes = await getProjects();
        setProjects(projectsRes.data || []);
      } catch (error) {
        console.error("Error loading pipeline leads", error);
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

    if (!currentUser) {
      setImportMessage({ type: "error", text: "User not found. Please refresh the page." });
      return;
    }

    if (excelData.length === 0) {
      setImportMessage({ type: "error", text: "No data to import. Please upload a valid Excel file." });
      return;
    }

    // Helper function to find ALL phone numbers from row
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

      for (const variation of phoneVariations) {
        if (row[variation] !== undefined && row[variation] !== null) {
          addPhoneNumber(row[variation]);
        }
      }

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

    // Helper function to find email from row
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

      for (const variation of emailVariations) {
        if (row[variation] !== undefined && row[variation] !== null && String(row[variation]).trim() !== "") {
          return String(row[variation]).trim();
        }
      }

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

    // Map Excel columns to lead fields
    const leadsToImport = excelData.map((row: any) => {
      const companyName = row["Company Name"] || row["Company"] || row["company_name"] || row["CompanyName"] || 
                         row["COMPANY"] || row["company"] || Object.values(row)[0] || "";
      
      if (!companyName || companyName.trim() === "") {
        return null;
      }

      const phoneNumbers = findAllPhoneNumbers(row);
      const phoneValue = phoneNumbers.length > 0 ? phoneNumbers.join(', ') : undefined;
      const emailValue = findEmail(row);

      const leadData = {
        company_name: String(companyName).trim(),
        contact_name: (row["Contact Name"] || row["Contact"] || row["contact_name"] || row["ContactName"] || 
                     row["CONTACT"] || row["contact"] || row["Name"] || row["name"] || "").toString().trim(),
        email: emailValue || undefined,
        phone: phoneValue || undefined,
        project_id: selectedImportProject,
        assigned_to: currentUser.id, // Automatically assign to current salesman
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
        const { data } = await getLeads(currentUser ? { assignedTo: currentUser.id } : undefined);
        setLeads(data || []);
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

  const handleAddLead = async () => {
    if (!formData.project_id) {
      alert("Please select a project");
      return;
    }
    if (!formData.company_name || !formData.contact_name) {
      alert("Company name and contact name are required");
      return;
    }
    try {
      const { createLead } = await import("@/lib/supabase");
      let leadData: any = {
        company_name: formData.company_name,
        contact_name: formData.contact_name,
        email: formData.contact_email || null,
        phone: formData.contact_phone || null,
        value: formData.value || 0,
        status: formData.status as 'new' | 'qualified' | 'proposal' | 'closed_won' | 'not_interested',
        project_id: formData.project_id,
        description: formData.description || undefined,
        link: formData.link || undefined,
        // New comprehensive fields
        designation: formData.designation?.trim() || null,
        mobile_phone: formData.mobile_phone?.trim() || null,
        direct_phone: formData.direct_phone?.trim() || null,
        office_phone: formData.office_phone?.trim() || null,
        linkedin: formData.linkedin?.trim() || null,
        address_line1: formData.address_line1?.trim() || null,
        address_line2: formData.address_line2?.trim() || null,
        city: formData.city?.trim() || null,
        state: formData.state?.trim() || null,
        country: formData.country?.trim() || null,
        zip: formData.zip?.trim() || null,
        customer_group: formData.customer_group?.trim() || null,
        product_group: formData.product_group?.trim() || null,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : null,
        lead_source: formData.lead_source?.trim() || formData.source?.trim() || null,
        data_source: formData.data_source?.trim() || null,
        lead_score: formData.lead_score ? parseInt(formData.lead_score) : null,
        next_followup_date: formData.next_followup_date || null,
        followup_notes: formData.followup_notes?.trim() || null,
        repeat_followup: formData.repeat_followup || false,
        do_not_followup: formData.do_not_followup || false,
        do_not_followup_reason: formData.do_not_followup_reason?.trim() || null,
        lead_notes: formData.lead_notes?.trim() || null,
        organization_notes: formData.organization_notes?.trim() || null,
        date_of_birth: formData.date_of_birth || null,
        special_event_date: formData.special_event_date || null,
        reference_url1: formData.reference_url1?.trim() || null,
        reference_url2: formData.reference_url2?.trim() || null,
        reference_url3: formData.reference_url3?.trim() || null,
        list_name: formData.list_name?.trim() || null,
      };
      if (currentUser) {
        leadData.assigned_to = currentUser.id; // Automatically assign to current salesman
      }
      const { data, error } = await createLead(leadData);
      if (!error) {
        alert("Lead added successfully!");
        setShowAddModal(false);
        setFormData({
          company_name: "",
          contact_name: "",
          contact_email: "",
          contact_phone: "",
          value: 0,
          source: "",
          status: "new",
          description: "",
          project_id: "",
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
          link: "",
        });
        // Refresh leads
        const { data: leadsData } = await getLeads(currentUser ? { assignedTo: currentUser.id } : undefined);
        if (leadsData) setLeads(leadsData);
      } else {
        alert(`Failed to add lead: ${error.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Failed to add lead: ${err.message || 'Unknown error'}`);
    }
  };

  const stages = useMemo(() => {
    const grouped: Record<StageKey, { leads: any[]; value: number }> = {
      new: { leads: [], value: 0 },
      qualified: { leads: [], value: 0 },
      proposal: { leads: [], value: 0 },
      closed_won: { leads: [], value: 0 },
      not_interested: { leads: [], value: 0 },
    };

    leads.forEach((lead: any) => {
      const key = (lead.status || "new") as StageKey;
      if (!grouped[key]) return;
      grouped[key].leads.push(lead);
      grouped[key].value += lead.value || 0;
    });

    return (Object.keys(stageMeta) as StageKey[]).map((key) => ({
      key,
      name: stageMeta[key].label,
      leads: grouped[key].leads,
      value: grouped[key].value,
      color: stageMeta[key].color,
      description: stageMeta[key].description,
    }));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const stageLeads = stages.find(s => s.key === selectedStage)?.leads || [];
    if (!searchQuery) return stageLeads;
    
    return stageLeads.filter(lead =>
      lead.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.contact_email || lead.email)?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [stages, selectedStage, searchQuery]);

  const totalValue = stages.reduce((s, st) => s + st.value, 0);
  const totalLeads = leads.length;
  const activeDeals = leads.filter(l => !["closed_won", "not_interested"].includes(l.status)).length;

  const moveToStage = async (leadId: string, newStage: StageKey) => {
    try {
      await updateLead(leadId, { status: newStage });
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId ? { ...lead, status: newStage } : lead
        )
      );
    } catch (error) {
      console.error("Error moving lead:", error);
    }
  };

  // Helper function to parse phone numbers
  const parsePhoneNumbers = (phoneString: string | null | undefined): string[] => {
    if (!phoneString) return [];
    const phones = String(phoneString)
      .split(/[,;|\n\r]+/)
      .map(p => p.trim())
      .filter(p => p.length >= 7 && p.length <= 20 && /[\d\+\-\(\)\s]{7,}/.test(p));
    return [...new Set(phones)]; // Remove duplicates
  };

  // Format phone number for WhatsApp
  const formatPhoneForWhatsApp = (phone: string): string | null => {
    if (!phone) return null;
    
    // Step 1: Remove all non-digit characters (keep only digits)
    let cleaned = phone.replace(/[^\d]/g, '');
    
    // Step 2: Handle international prefixes
    if (cleaned.startsWith('00')) {
      cleaned = cleaned.slice(2);
    }
    
    // Step 3: Remove ALL leading zeros - WhatsApp requires no leading zeros
    cleaned = cleaned.replace(/^0+/, '');
    
    // Step 4: Validate length (E.164 standard: 1-15 digits)
    if (cleaned.length < 7 || cleaned.length > 15) {
      return null;
    }
    
    // Step 5: Ensure it's all digits and doesn't start with 0
    if (!/^\d+$/.test(cleaned) || cleaned.startsWith('0')) {
      return null;
    }
    
    // Step 6: Final check - must start with 1-9 (valid country code)
    if (!/^[1-9]\d+$/.test(cleaned)) {
      return null;
    }
    
    return cleaned;
  };

  // Get default WhatsApp message for a lead
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

  // Handle WhatsApp
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

  // Send WhatsApp message
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

  // Handle Add Note
  const handleAddNote = (lead: any) => {
    setSelectedLeadForActivity(lead);
    setNoteText("");
    setShowNoteModal(true);
  };

  // Handle Schedule Callback
  const handleScheduleCallback = (lead: any) => {
    setSelectedLeadForActivity(lead);
    setCallbackDate("");
    setCallbackNotes("");
    setShowCallbackModal(true);
  };

  // Submit Note
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
      
      // Refresh leads
      const user = await getCurrentUser();
      if (user) {
        const { data } = await getLeads(user ? { assignedTo: user.id } : undefined);
        setLeads(data || []);
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

  // Submit Callback
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
      
      // Refresh leads
      const user = await getCurrentUser();
      if (user) {
        const { data } = await getLeads(user ? { assignedTo: user.id } : undefined);
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

  const getStageColor = (color: string) => {
    // Black and white color scheme
    const colors: Record<string, { bg: string; text: string; border: string; badge: string }> = {
      blue: { bg: "bg-slate-50", text: "text-slate-900", border: "border-slate-200", badge: "bg-slate-50 text-slate-900 border-slate-200" },
      purple: { bg: "bg-slate-100", text: "text-slate-900", border: "border-slate-300", badge: "bg-slate-100 text-slate-900 border-slate-300" },
      amber: { bg: "bg-slate-100", text: "text-slate-900", border: "border-slate-300", badge: "bg-slate-100 text-slate-900 border-slate-300" },
      emerald: { bg: "bg-slate-50", text: "text-slate-900", border: "border-slate-200", badge: "bg-slate-50 text-slate-900 border-slate-200" },
      slate: { bg: "bg-slate-50", text: "text-slate-900", border: "border-slate-200", badge: "bg-slate-50 text-slate-900 border-slate-200" },
    };
    return colors[color] || colors.slate;
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role="salesman" />
      <main className="flex-1 p-4 lg:p-8 pt-20 sm:pt-16 lg:pt-8 overflow-auto bg-slate-50">
        {loading ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center flex flex-col items-center gap-3">
              <Loader className="w-10 h-10 animate-spin text-slate-900" />
              <span className="text-slate-600">Loading pipeline...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Header with Stats and Add Lead button */}
            <div className="mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">Sales Pipeline</h1>
                  <p className="text-sm text-slate-600">Manage and track your sales pipeline</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button 
                    className="bg-slate-900 hover:bg-slate-800 text-white font-medium flex-1 sm:flex-initial gap-2" 
                    onClick={() => setShowBulkImportModal(true)}
                  >
                    <Upload className="w-4 h-4" />
                    Bulk Import
                  </Button>
                  <Button className="bg-slate-900 hover:bg-slate-800 text-white font-medium flex-1 sm:flex-initial" onClick={() => setShowAddModal(true)}>
                    Add Lead
                  </Button>
                </div>
              </div>
              
              {/* Add Lead Modal */}
              <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent className="bg-white max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Lead</DialogTitle>
                    <DialogDescription>Enter the details for the new lead. Use tabs to navigate between sections.</DialogDescription>
                  </DialogHeader>
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
                          <Label>Company Name *</Label>
                          <Input value={formData.company_name} onChange={e => setFormData({ ...formData, company_name: e.target.value })} placeholder="Acme Corp" />
                        </div>
                        <div>
                          <Label>Contact Name *</Label>
                          <Input value={formData.contact_name} onChange={e => setFormData({ ...formData, contact_name: e.target.value })} placeholder="John Doe" />
                        </div>
                        <div>
                          <Label>Designation / Title</Label>
                          <Input value={formData.designation} onChange={e => setFormData({ ...formData, designation: e.target.value })} placeholder="CEO, Manager, etc." />
                        </div>
                        <div>
                          <Label>Project *</Label>
                          <Select value={formData.project_id} onValueChange={value => setFormData({ ...formData, project_id: value })}>
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
                          <Label>Value (USD) *</Label>
                          <Input type="number" value={formData.value} onChange={e => setFormData({ ...formData, value: parseInt(e.target.value) || 0 })} placeholder="50000" />
                        </div>
                        <div>
                          <Label>Status</Label>
                          <Select value={formData.status} onValueChange={value => setFormData({ ...formData, status: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="qualified">Qualified</SelectItem>
                              <SelectItem value="proposal">Proposal Sent</SelectItem>
                              <SelectItem value="closed_won">Closed</SelectItem>
                              <SelectItem value="not_interested">Archived</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>List Name</Label>
                          <Input value={formData.list_name} onChange={e => setFormData({ ...formData, list_name: e.target.value })} placeholder="List name" />
                        </div>
                        <div className="col-span-2">
                          <Label>Company Website / Link</Label>
                          <Input type="url" value={formData.link} onChange={e => setFormData({ ...formData, link: e.target.value })} placeholder="https://example.com" />
                        </div>
                        <div className="col-span-2">
                          <Label>Description</Label>
                          <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Add any additional notes..." rows={3} />
                        </div>
                      </div>
                    </TabsContent>

                    {/* Contact Information Tab */}
                    <TabsContent value="contact" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Email</Label>
                          <Input type="email" value={formData.contact_email} onChange={e => setFormData({ ...formData, contact_email: e.target.value })} placeholder="john@acme.com" />
                        </div>
                        <div>
                          <Label>Phone (Primary)</Label>
                          <Input value={formData.contact_phone} onChange={e => setFormData({ ...formData, contact_phone: e.target.value })} placeholder="+1-555-0000" />
                        </div>
                        <div>
                          <Label>Mobile Phone</Label>
                          <Input value={formData.mobile_phone} onChange={e => setFormData({ ...formData, mobile_phone: e.target.value })} placeholder="+1-555-0000" />
                        </div>
                        <div>
                          <Label>Direct Phone</Label>
                          <Input value={formData.direct_phone} onChange={e => setFormData({ ...formData, direct_phone: e.target.value })} placeholder="+1-555-0000" />
                        </div>
                        <div>
                          <Label>Office Phone</Label>
                          <Input value={formData.office_phone} onChange={e => setFormData({ ...formData, office_phone: e.target.value })} placeholder="+1-555-0000" />
                        </div>
                        <div>
                          <Label>LinkedIn</Label>
                          <Input type="url" value={formData.linkedin} onChange={e => setFormData({ ...formData, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." />
                        </div>
                      </div>
                    </TabsContent>

                    {/* Address Information Tab */}
                    <TabsContent value="address" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <Label>Address Line 1</Label>
                          <Input value={formData.address_line1} onChange={e => setFormData({ ...formData, address_line1: e.target.value })} placeholder="Street address" />
                        </div>
                        <div className="col-span-2">
                          <Label>Address Line 2</Label>
                          <Input value={formData.address_line2} onChange={e => setFormData({ ...formData, address_line2: e.target.value })} placeholder="Apartment, suite, etc." />
                        </div>
                        <div>
                          <Label>City</Label>
                          <Input value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} placeholder="City" />
                        </div>
                        <div>
                          <Label>State</Label>
                          <Input value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} placeholder="State" />
                        </div>
                        <div>
                          <Label>Zip / Postal Code</Label>
                          <Input value={formData.zip} onChange={e => setFormData({ ...formData, zip: e.target.value })} placeholder="12345" />
                        </div>
                        <div>
                          <Label>Country</Label>
                          <Input value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} placeholder="Country" />
                        </div>
                      </div>
                    </TabsContent>

                    {/* Classification Tab */}
                    <TabsContent value="classification" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Customer Group</Label>
                          <Input value={formData.customer_group} onChange={e => setFormData({ ...formData, customer_group: e.target.value })} placeholder="Customer group" />
                        </div>
                        <div>
                          <Label>Product Group</Label>
                          <Input value={formData.product_group} onChange={e => setFormData({ ...formData, product_group: e.target.value })} placeholder="Product group" />
                        </div>
                        <div>
                          <Label>Lead Source</Label>
                          <Input value={formData.lead_source || formData.source} onChange={e => setFormData({ ...formData, lead_source: e.target.value, source: e.target.value })} placeholder="Website, LinkedIn, Referral, etc." />
                        </div>
                        <div>
                          <Label>Data Source</Label>
                          <Input value={formData.data_source} onChange={e => setFormData({ ...formData, data_source: e.target.value })} placeholder="Data source" />
                        </div>
                        <div>
                          <Label>Lead Score (0-100)</Label>
                          <Input type="number" min="0" max="100" value={formData.lead_score} onChange={e => setFormData({ ...formData, lead_score: e.target.value })} placeholder="0" />
                        </div>
                        <div className="col-span-2">
                          <Label>Tags (comma-separated)</Label>
                          <Input value={formData.tags} onChange={e => setFormData({ ...formData, tags: e.target.value })} placeholder="tag1, tag2, tag3" />
                        </div>
                        <div className="col-span-2">
                          <Label>Lead Notes</Label>
                          <Textarea value={formData.lead_notes} onChange={e => setFormData({ ...formData, lead_notes: e.target.value })} placeholder="Additional notes about the lead..." rows={3} />
                        </div>
                        <div className="col-span-2">
                          <Label>Organization Notes</Label>
                          <Textarea value={formData.organization_notes} onChange={e => setFormData({ ...formData, organization_notes: e.target.value })} placeholder="Notes about the organization..." rows={3} />
                        </div>
                        <div>
                          <Label>Date of Birth</Label>
                          <Input type="date" value={formData.date_of_birth} onChange={e => setFormData({ ...formData, date_of_birth: e.target.value })} />
                        </div>
                        <div>
                          <Label>Special Event Date</Label>
                          <Input type="date" value={formData.special_event_date} onChange={e => setFormData({ ...formData, special_event_date: e.target.value })} />
                        </div>
                        <div>
                          <Label>Reference URL 1</Label>
                          <Input type="url" value={formData.reference_url1} onChange={e => setFormData({ ...formData, reference_url1: e.target.value })} placeholder="https://..." />
                        </div>
                        <div>
                          <Label>Reference URL 2</Label>
                          <Input type="url" value={formData.reference_url2} onChange={e => setFormData({ ...formData, reference_url2: e.target.value })} placeholder="https://..." />
                        </div>
                        <div>
                          <Label>Reference URL 3</Label>
                          <Input type="url" value={formData.reference_url3} onChange={e => setFormData({ ...formData, reference_url3: e.target.value })} placeholder="https://..." />
                        </div>
                      </div>
                    </TabsContent>

                    {/* Follow-up Tab */}
                    <TabsContent value="followup" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Next Follow-up Date</Label>
                          <Input type="datetime-local" value={formData.next_followup_date} onChange={e => setFormData({ ...formData, next_followup_date: e.target.value })} />
                        </div>
                        <div className="flex items-end gap-4">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="repeat-followup"
                              checked={formData.repeat_followup}
                              onCheckedChange={(checked) => setFormData({ ...formData, repeat_followup: checked as boolean })}
                            />
                            <Label htmlFor="repeat-followup" className="cursor-pointer">Repeat Follow-up</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="do-not-followup"
                              checked={formData.do_not_followup}
                              onCheckedChange={(checked) => setFormData({ ...formData, do_not_followup: checked as boolean })}
                            />
                            <Label htmlFor="do-not-followup" className="cursor-pointer">Do Not Follow-up</Label>
                          </div>
                        </div>
                        {formData.do_not_followup && (
                          <div className="col-span-2">
                            <Label>Do Not Follow-up Reason</Label>
                            <Input value={formData.do_not_followup_reason} onChange={e => setFormData({ ...formData, do_not_followup_reason: e.target.value })} placeholder="Reason for not following up" />
                          </div>
                        )}
                        <div className="col-span-2">
                          <Label>Follow-up Notes</Label>
                          <Textarea value={formData.followup_notes} onChange={e => setFormData({ ...formData, followup_notes: e.target.value })} placeholder="Notes for follow-up..." rows={3} />
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                  <div className="flex justify-end pt-4 border-t">
                    <Button className="bg-slate-900 hover:bg-slate-800 text-white font-medium" onClick={handleAddLead}>Add Lead</Button>
                  </div>
                </DialogContent>
              </Dialog>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card className="p-4 bg-white border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Total Pipeline</p>
                      <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalValue)}</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                      <DollarSign className="w-6 h-6 text-slate-900" />
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-white border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Active Deals</p>
                      <p className="text-2xl font-bold text-slate-900">{activeDeals}</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                      <TrendingUp className="w-6 h-6 text-slate-900" />
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-white border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Total Leads</p>
                      <p className="text-2xl font-bold text-slate-900">{totalLeads}</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                      <Building2 className="w-6 h-6 text-slate-900" />
                    </div>
                  </div>
                </Card>
              </div>

              {/* Search and Stage Filter */}
              <Card className="p-4 bg-white border-slate-200 shadow-sm mb-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      placeholder="Search leads by company, contact, or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9 pl-9 bg-white border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-slate-500"
                    />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-auto justify-between bg-white border-slate-200 text-slate-900">
                        <span className="flex items-center gap-2">
                          <Filter className="w-4 h-4" />
                          <span>{stageMeta[selectedStage].label}</span>
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                            {stages.find(s => s.key === selectedStage)?.leads.length || 0}
                          </Badge>
                        </span>
                        <ChevronDown className="w-4 h-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {stages.map((stage) => {
                        const colors = getStageColor(stage.color);
                        return (
                          <DropdownMenuItem
                            key={stage.key}
                            onClick={() => setSelectedStage(stage.key as StageKey)}
                            className={selectedStage === stage.key ? "bg-slate-100 font-semibold" : ""}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span>{stage.name}</span>
                              <Badge className={`${colors.badge} border text-xs`}>
                                {stage.leads.length}
                              </Badge>
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>

              {/* Stage Header - Compact */}
              {(() => {
                const currentStage = stages.find(s => s.key === selectedStage);
                return (
                  <div className="flex items-center justify-between mb-4 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">
                      {currentStage?.name || 'New Leads'} ({currentStage?.leads.length || 0})
                    </span>
                    <span className="text-slate-700">
                      {formatCurrencyCompact(currentStage?.value || 0)}
                    </span>
                  </div>
                );
              })()}

              {/* Leads Table */}
              <Card className="p-3 sm:p-6 bg-white border-slate-200 shadow-sm">
                {filteredLeads.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-500">
                      {searchQuery ? "No leads match your search" : "No leads in this stage"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Lead</th>
                          <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Contact</th>
                          <th className="text-left py-2 px-3 font-medium text-xs text-slate-700">Status</th>
                          <th className="text-right py-2 px-3 font-medium text-xs text-slate-700">Value</th>
                          <th className="text-center py-2 px-3 font-medium text-xs text-slate-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeads.map((lead: any) => {
                          const colors = getStageColor(stageMeta[selectedStage].color);
                          return (
                            <tr 
                              key={lead.id} 
                              className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                            >
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-7 h-7">
                                    <AvatarFallback className="bg-slate-100 text-slate-900 text-xs font-medium">
                                      {lead.company_name?.substring(0, 2).toUpperCase() || 'UN'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <div className="text-xs font-medium text-slate-900">{lead.company_name || "Unnamed Company"}</div>
                                    {lead.created_at && (
                                      <div className="text-xs text-slate-500 mt-0.5">
                                        {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex flex-col gap-0.5">
                                  <div className="text-xs text-slate-900">{lead.contact_name || 'N/A'}</div>
                                  {(lead.contact_email || lead.email) && (
                                    <div className="text-xs text-slate-500 truncate max-w-[150px]">
                                      {lead.contact_email || lead.email}
                                    </div>
                                  )}
                                  {(lead.contact_phone || lead.phone) && (
                                    <div className="text-xs text-slate-500">
                                      {lead.contact_phone || lead.phone}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <Select
                                  value={lead.status || "new"}
                                  onValueChange={(value) => {
                                    moveToStage(lead.id, value as StageKey);
                                  }}
                                >
                                  <SelectTrigger className="bg-white border-slate-200 text-slate-900 text-xs h-7 w-28">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="new">New</SelectItem>
                                    <SelectItem value="qualified">Qualified</SelectItem>
                                    <SelectItem value="proposal">Proposal</SelectItem>
                                    <SelectItem value="closed_won">Closed Won</SelectItem>
                                    <SelectItem value="not_interested">Archived</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="py-2 px-3 text-right text-xs font-semibold text-slate-900">
                                {formatCurrencyCompact(lead.value || 0)}
                              </td>
                              <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 hover:bg-slate-100"
                                    title="Call"
                                    asChild
                                  >
                                    <a href={`tel:${lead.contact_phone || lead.phone || ''}`}>
                                      <Phone className="w-3.5 h-3.5" />
                                    </a>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 hover:bg-slate-100"
                                    title="Email"
                                    asChild
                                  >
                                    <a href={`mailto:${lead.contact_email || lead.email || ''}`}>
                                      <Mail className="w-3.5 h-3.5" />
                                    </a>
                                  </Button>
                                  {(() => {
                                    const phoneNumbers = parsePhoneNumbers(lead.contact_phone || lead.phone || (lead as any).mobile_phone);
                                    const validPhones = phoneNumbers.map(formatPhoneForWhatsApp).filter((p): p is string => Boolean(p));
                                    if (validPhones.length === 0) {
                                      return (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
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
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                        <MoreHorizontal className="w-3.5 h-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {selectedStage === "new" && (
                                        <>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "qualified")}>
                                            <CheckCircle className="w-4 h-4 mr-2" /> Mark as Qualified
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "proposal")}>
                                            <ArrowUpRight className="w-4 h-4 mr-2" /> Send Proposal
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "closed_won")}>
                                            <CheckCircle className="w-4 h-4 mr-2 text-slate-900" /> Close Deal
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "not_interested")}>
                                            <XCircle className="w-4 h-4 mr-2 text-slate-900" /> Archive Lead
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      {selectedStage === "qualified" && (
                                        <>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "proposal")}>
                                            <ArrowUpRight className="w-4 h-4 mr-2" /> Send Proposal
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "closed_won")}>
                                            <CheckCircle className="w-4 h-4 mr-2 text-slate-900" /> Close Deal
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "new")}>
                                            <ArrowUpRight className="w-4 h-4 mr-2" /> Move to New
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "not_interested")}>
                                            <XCircle className="w-4 h-4 mr-2 text-slate-900" /> Archive Lead
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      {selectedStage === "proposal" && (
                                        <>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "closed_won")}>
                                            <CheckCircle className="w-4 h-4 mr-2 text-slate-900" /> Close Deal
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "qualified")}>
                                            <ArrowUpRight className="w-4 h-4 mr-2" /> Move to Qualified
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "not_interested")}>
                                            <XCircle className="w-4 h-4 mr-2 text-slate-900" /> Archive Lead
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      {selectedStage === "closed_won" && (
                                        <>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "proposal")}>
                                            <ArrowUpRight className="w-4 h-4 mr-2" /> Move to Proposal
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "qualified")}>
                                            <ArrowUpRight className="w-4 h-4 mr-2" /> Move to Qualified
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "not_interested")}>
                                            <XCircle className="w-4 h-4 mr-2 text-slate-900" /> Archive Lead
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      {selectedStage === "not_interested" && (
                                        <>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "new")}>
                                            <ArrowUpRight className="w-4 h-4 mr-2" /> Reactivate to New
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "qualified")}>
                                            <ArrowUpRight className="w-4 h-4 mr-2" /> Move to Qualified
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "proposal")}>
                                            <ArrowUpRight className="w-4 h-4 mr-2" /> Move to Proposal
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => moveToStage(lead.id, "closed_won")}>
                                            <CheckCircle className="w-4 h-4 mr-2 text-slate-900" /> Close Deal
                                          </DropdownMenuItem>
                                        </>
                                      )}
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
            </div>
          </>
        )}
        
        {/* Bulk Import Modal */}
        <Dialog open={showBulkImportModal} onOpenChange={setShowBulkImportModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bulk Import Leads from Excel</DialogTitle>
              <DialogDescription>Upload an Excel file to import multiple leads at once</DialogDescription>
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

            <div className="flex justify-end gap-2 mt-4">
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
            </div>
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
                Send via WhatsApp
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
                <Label htmlFor="note">Note *</Label>
                <Textarea
                  id="note"
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
                disabled={!noteText.trim() || submittingActivity}
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
                disabled={!callbackDate || !callbackNotes.trim() || submittingActivity}
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                {submittingActivity ? "Scheduling..." : "Schedule Callback"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default SalesPipeline;


