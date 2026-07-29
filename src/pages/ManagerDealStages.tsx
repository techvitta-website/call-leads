import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader, Edit, Trash2, GripVertical, CheckCircle, XCircle } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentUser, getDealStages, createDealStage, updateDealStage, deleteDealStage, getUserRole } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { isStaff, normalizeRole } from "@/lib/roles";

const ManagerDealStages = () => {
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingStage, setEditingStage] = useState<any | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", color: "#6B7280", order_index: 0 });
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

        const { data, error } = await getDealStages();
        if (error) throw error;
        setStages(data || []);
      } catch (error) {
        console.error("Error fetching deal stages:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;

    setSubmitting(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;

      if (editingStage) {
        const { error } = await updateDealStage(editingStage.id, formData);
        if (error) throw error;
      } else {
        const { error } = await createDealStage({
          ...formData,
          created_by: user.id,
        });
        if (error) throw error;
      }

      const { data, error } = await getDealStages();
      if (error) throw error;
      setStages(data || []);
      setShowModal(false);
      setEditingStage(null);
      setFormData({ name: "", description: "", color: "#6B7280", order_index: 0 });
    } catch (error) {
      console.error("Error saving deal stage:", error);
      alert("Failed to save deal stage");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (stage: any) => {
    setEditingStage(stage);
    setFormData({
      name: stage.name || "",
      description: stage.description || "",
      color: stage.color || "#6B7280",
      order_index: stage.order_index || 0,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this deal stage?")) return;

    try {
      const { error } = await deleteDealStage(id);
      if (error) throw error;

      const { data, error: fetchError } = await getDealStages();
      if (fetchError) throw fetchError;
      setStages(data || []);
    } catch (error) {
      console.error("Error deleting deal stage:", error);
      alert("Failed to delete deal stage");
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
      <main className="flex-1 p-2 sm:p-4 lg:p-8 pt-16 sm:pt-16 lg:pt-8 overflow-auto bg-slate-50">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">Deal Stages</h1>
            <p className="text-sm sm:text-base text-slate-600">Manage your sales pipeline stages</p>
          </div>
          <Button
            onClick={() => {
              setEditingStage(null);
              setFormData({ name: "", description: "", color: "#6B7280", order_index: 0 });
              setShowModal(true);
            }}
            className="bg-slate-900 hover:bg-slate-800 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Stage
          </Button>
        </div>

        <div className="grid gap-4">
          {stages.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-slate-600 mb-4">No deal stages yet</p>
              <Button
                onClick={() => {
                  setEditingStage(null);
                  setFormData({ name: "", description: "", color: "#6B7280", order_index: 0 });
                  setShowModal(true);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First Stage
              </Button>
            </Card>
          ) : (
            stages.map((stage) => (
              <Card key={stage.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <GripVertical className="w-5 h-5 text-slate-400" />
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">{stage.name}</h3>
                      {stage.description && (
                        <p className="text-sm text-slate-600 mt-1">{stage.description}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="mr-4">
                      Order: {stage.order_index}
                    </Badge>
                    {stage.is_active ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(stage)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(stage.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="bg-white">
            <DialogHeader>
              <DialogTitle>{editingStage ? "Edit Deal Stage" : "Create Deal Stage"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Stage Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Qualified, Proposal, Negotiation"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Stage description"
                  className="mt-1.5"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="color">Color</Label>
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="mt-1.5 h-10"
                  />
                </div>
                <div>
                  <Label htmlFor="order_index">Order Index</Label>
                  <Input
                    id="order_index"
                    type="number"
                    value={formData.order_index}
                    onChange={(e) => setFormData({ ...formData, order_index: parseInt(e.target.value) || 0 })}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModal(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || !formData.name.trim()}>
                {submitting ? "Saving..." : editingStage ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default ManagerDealStages;
