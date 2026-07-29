import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader, Edit, Trash2, Eye, FileText } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCurrentUser, getQuotations, createQuotation, updateQuotation, deleteQuotation, getQuotation, getLeads, getProjects, getUserRole } from "@/lib/supabase";
import { formatCurrency } from "@/utils/currency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isStaff, normalizeRole } from "@/lib/roles";

const ManagerQuotations = () => {
  const [loading, setLoading] = useState(true);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<any | null>(null);
  const [editingQuotation, setEditingQuotation] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    quotation_number: "",
    lead_id: "",
    project_id: "",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    quotation_date: new Date().toISOString().split('T')[0],
    valid_until: "",
    subtotal: 0,
    tax_rate: 0,
    tax_amount: 0,
    discount: 0,
    total_amount: 0,
    status: "draft",
    notes: "",
    terms_conditions: "",
  });
  const [items, setItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

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

        const [quotationsRes, leadsRes, projectsRes] = await Promise.all([
          getQuotations(),
          getLeads(),
          getProjects(),
        ]);

        setQuotations(quotationsRes.data || []);
        setLeads(leadsRes.data || []);
        setProjects(projectsRes.data || []);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const generateQuotationNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `QT-${year}${month}-${random}`;
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
    const discount = parseFloat(String(formData.discount)) || 0;
    const taxRate = parseFloat(String(formData.tax_rate)) || 0;
    const taxAmount = (subtotal - discount) * (taxRate / 100);
    const total = subtotal - discount + taxAmount;

    setFormData({
      ...formData,
      subtotal,
      tax_amount: taxAmount,
      total_amount: total,
    });
  };

  useEffect(() => {
    calculateTotals();
  }, [items, formData.discount, formData.tax_rate]);

  const handleAddItem = () => {
    setItems([...items, {
      item_name: "",
      description: "",
      quantity: 1,
      unit_price: 0,
      total_price: 0,
    }]);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unit_price') {
      const qty = parseFloat(String(newItems[index].quantity)) || 0;
      const price = parseFloat(String(newItems[index].unit_price)) || 0;
      newItems[index].total_price = qty * price;
    }
    
    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!formData.quotation_number || !formData.customer_name) {
      alert("Please fill in required fields");
      return;
    }

    setSubmitting(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const quotationData = {
        ...formData,
        lead_id: formData.lead_id || null,
        project_id: formData.project_id || null,
        created_by: user.id,
        quotation_items: items.filter(item => item.item_name),
      };

      if (editingQuotation) {
        const { error } = await updateQuotation(editingQuotation.id, quotationData);
        if (error) throw error;
      } else {
        const { error } = await createQuotation(quotationData);
        if (error) throw error;
      }

      const { data, error } = await getQuotations();
      if (error) throw error;
      setQuotations(data || []);
      setShowModal(false);
      setEditingQuotation(null);
      setFormData({
        quotation_number: generateQuotationNumber(),
        lead_id: "",
        project_id: "",
        customer_name: "",
        customer_email: "",
        customer_phone: "",
        quotation_date: new Date().toISOString().split('T')[0],
        valid_until: "",
        subtotal: 0,
        tax_rate: 0,
        tax_amount: 0,
        discount: 0,
        total_amount: 0,
        status: "draft",
        notes: "",
        terms_conditions: "",
      });
      setItems([]);
    } catch (error) {
      console.error("Error saving quotation:", error);
      alert("Failed to save quotation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDetails = async (id: string) => {
    try {
      const { data, error } = await getQuotation(id);
      if (error) throw error;
      setSelectedQuotation(data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error("Error fetching quotation:", error);
    }
  };

  const handleEdit = (quotation: any) => {
    setEditingQuotation(quotation);
    setFormData({
      quotation_number: quotation.quotation_number,
      lead_id: quotation.lead_id || "",
      project_id: quotation.project_id || "",
      customer_name: quotation.customer_name,
      customer_email: quotation.customer_email || "",
      customer_phone: quotation.customer_phone || "",
      quotation_date: quotation.quotation_date || new Date().toISOString().split('T')[0],
      valid_until: quotation.valid_until || "",
      subtotal: quotation.subtotal || 0,
      tax_rate: quotation.tax_rate || 0,
      tax_amount: quotation.tax_amount || 0,
      discount: quotation.discount || 0,
      total_amount: quotation.total_amount || 0,
      status: quotation.status || "draft",
      notes: quotation.notes || "",
      terms_conditions: quotation.terms_conditions || "",
    });
    setItems(quotation.quotation_items || []);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this quotation?")) return;

    try {
      const { error } = await deleteQuotation(id);
      if (error) throw error;

      const { data, error: fetchError } = await getQuotations();
      if (fetchError) throw fetchError;
      setQuotations(data || []);
    } catch (error) {
      console.error("Error deleting quotation:", error);
      alert("Failed to delete quotation");
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-slate-100 text-slate-800",
      sent: "bg-blue-100 text-blue-800",
      accepted: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      expired: "bg-orange-100 text-orange-800",
    };
    return colors[status] || colors.draft;
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar role="manager" />
      <main className="flex-1 p-2 sm:p-4 lg:p-8 pt-16 sm:pt-16 lg:pt-8 overflow-auto bg-slate-50">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">Quotations</h1>
            <p className="text-sm sm:text-base text-slate-600">Manage customer quotations</p>
          </div>
          <Button
            onClick={() => {
              setEditingQuotation(null);
              setFormData({
                quotation_number: generateQuotationNumber(),
                lead_id: "",
                project_id: "",
                customer_name: "",
                customer_email: "",
                customer_phone: "",
                quotation_date: new Date().toISOString().split('T')[0],
                valid_until: "",
                subtotal: 0,
                tax_rate: 0,
                tax_amount: 0,
                discount: 0,
                total_amount: 0,
                status: "draft",
                notes: "",
                terms_conditions: "",
              });
              setItems([]);
              setShowModal(true);
            }}
            className="bg-slate-900 hover:bg-slate-800 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Quotation
          </Button>
        </div>

        <Card className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quotation #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No quotations yet
                  </TableCell>
                </TableRow>
              ) : (
                quotations.map((quotation) => (
                  <TableRow key={quotation.id}>
                    <TableCell className="font-medium">{quotation.quotation_number}</TableCell>
                    <TableCell>{quotation.customer_name}</TableCell>
                    <TableCell>{new Date(quotation.quotation_date).toLocaleDateString()}</TableCell>
                    <TableCell>{formatCurrency(quotation.total_amount)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(quotation.status)}>
                        {quotation.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(quotation.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(quotation)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(quotation.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Create/Edit Modal */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="bg-white max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingQuotation ? "Edit Quotation" : "Create Quotation"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quotation Number *</Label>
                  <Input
                    value={formData.quotation_number}
                    onChange={(e) => setFormData({ ...formData, quotation_number: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="accepted">Accepted</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Lead</Label>
                  <Select
                    value={formData.lead_id}
                    onValueChange={(value) => {
                      const lead = leads.find(l => l.id === value);
                      setFormData({
                        ...formData,
                        lead_id: value,
                        customer_name: lead?.company_name || formData.customer_name,
                        customer_email: lead?.email || formData.customer_email,
                        customer_phone: lead?.phone || formData.customer_phone,
                      });
                    }}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select lead" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {leads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Project</Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) => setFormData({ ...formData, project_id: value })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Customer Name *</Label>
                <Input
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  className="mt-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer Email</Label>
                  <Input
                    type="email"
                    value={formData.customer_email}
                    onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Customer Phone</Label>
                  <Input
                    value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quotation Date</Label>
                  <Input
                    type="date"
                    value={formData.quotation_date}
                    onChange={(e) => setFormData({ ...formData, quotation_date: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Item
                  </Button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {items.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 p-2 border rounded">
                      <Input
                        placeholder="Item name"
                        value={item.item_name}
                        onChange={(e) => handleItemChange(index, 'item_name', e.target.value)}
                        className="col-span-4"
                      />
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        className="col-span-3"
                      />
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        className="col-span-1"
                      />
                      <Input
                        type="number"
                        placeholder="Unit Price"
                        value={item.unit_price}
                        onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                        className="col-span-2"
                      />
                      <div className="col-span-1 flex items-center">
                        {formatCurrency(item.total_price, { showDecimals: true })}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(index)}
                        className="col-span-1 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Tax Rate (%)</Label>
                  <Input
                    type="number"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: parseFloat(e.target.value) || 0 })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Discount</Label>
                  <Input
                    type="number"
                    value={formData.discount}
                    onChange={(e) => setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Total Amount</Label>
                  <div className="mt-1.5 p-2 bg-slate-50 rounded border font-semibold">
                    {formatCurrency(formData.total_amount, { showDecimals: true })}
                  </div>
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="mt-1.5"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModal(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Saving..." : editingQuotation ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="bg-white max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Quotation Details</DialogTitle>
            </DialogHeader>
            {selectedQuotation && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Quotation Number</Label>
                    <p className="font-semibold">{selectedQuotation.quotation_number}</p>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Badge className={getStatusColor(selectedQuotation.status)}>
                      {selectedQuotation.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label>Customer</Label>
                  <p className="font-semibold">{selectedQuotation.customer_name}</p>
                </div>
                {selectedQuotation.quotation_items && selectedQuotation.quotation_items.length > 0 && (
                  <div>
                    <Label>Items</Label>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Unit Price</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedQuotation.quotation_items.map((item: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>{item.item_name}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>${item.unit_price}</TableCell>
                            <TableCell>${item.total_price}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="text-right">
                  <p className="text-lg font-semibold">Total: {formatCurrency(selectedQuotation.total_amount)}</p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default ManagerQuotations;
