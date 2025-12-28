import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Play, Pause, Trash2, Edit, Calendar, Users, Clock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { adminApiRequest } from "@/lib/adminApi";
import { queryClient } from "@/lib/queryClient";

export default function AdminSchedules() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    time: "09:00",
    message: "",
    active: true,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      time: "09:00",
      message: "",
      active: true,
    });
    setEditingSchedule(null);
  };

  // Fetch schedules
  const { data: schedulesData, isLoading } = useQuery({
    queryKey: ['/api/admin/schedules'],
    queryFn: () => adminApiRequest('/api/admin/schedules'),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['/api/admin/schedules/stats'],
    queryFn: () => adminApiRequest('/api/admin/schedules/stats'),
  });

  // Create/Update schedule mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingSchedule) {
        return await adminApiRequest(`/api/admin/schedules/${editingSchedule.id}`, 'PATCH', data);
      } else {
        return await adminApiRequest('/api/admin/schedules', 'POST', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/schedules'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/schedules/stats'] });
      setIsCreateOpen(false);
      resetForm();
      toast({
        title: editingSchedule ? "Schedule Updated" : "Schedule Created",
        description: editingSchedule ? "Schedule has been updated successfully" : "New schedule has been created",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save schedule",
        variant: "destructive",
      });
    },
  });

  // Toggle schedule mutation
  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      return await adminApiRequest(`/api/admin/schedules/${id}/toggle`, 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/schedules'] });
      toast({
        title: "Schedule Updated",
        description: "Schedule status has been changed",
      });
    },
  });

  // Delete schedule mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await adminApiRequest(`/api/admin/schedules/${id}`, 'DELETE', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/schedules'] });
      toast({
        title: "Schedule Deleted",
        description: "Schedule has been permanently deleted",
      });
    },
  });

  const handleEdit = (schedule: any) => {
    setEditingSchedule(schedule);
    setFormData({
      name: schedule.message || "",
      time: schedule.scheduleTime || "09:00",
      message: schedule.message || "",
      active: schedule.active !== false,
    });
    setIsCreateOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const schedules = schedulesData?.schedules || [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">SMS & Email Schedules</h1>
            <p className="text-muted-foreground mt-1">Manage automated delivery schedules</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsCreateOpen(open); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-schedule">
                <Plus className="w-4 h-4 mr-2" />
                Create Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{editingSchedule ? "Edit Schedule" : "Create New Schedule"}</DialogTitle>
                  <DialogDescription>
                    {editingSchedule ? "Update the schedule details" : "Set up a new automated delivery schedule"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="message">Message/Schedule Name</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value, name: e.target.value })}
                      placeholder="Daily technique delivery"
                      required
                      rows={2}
                      data-testid="textarea-message"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="time">Time of Day (24-hour format)</Label>
                    <Input
                      id="time"
                      type="time"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      required
                      data-testid="input-schedule-time"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-schedule">
                    {saveMutation.isPending ? "Saving..." : (editingSchedule ? "Update" : "Create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-total-schedules">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Schedules</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total">{stats?.total || 0}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-active-schedules">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Play className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-active">{stats?.active || 0}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-total-recipients">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Recipients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-recipients">{stats?.totalRecipients || 0}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-sent-today">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sent Today</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-sent-today">{stats?.sentToday || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Schedules Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Schedules</CardTitle>
            <CardDescription>Manage your automated delivery schedules</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : schedules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No schedules found. Create your first schedule to get started.
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Message/Name</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Last Sent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map((schedule: any) => (
                      <TableRow key={schedule.id} data-testid={`row-schedule-${schedule.id}`}>
                        <TableCell className="font-medium">{schedule.message}</TableCell>
                        <TableCell>{schedule.scheduleTime}</TableCell>
                        <TableCell>{schedule.recipientCount || 0}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {schedule.lastSent ? format(new Date(schedule.lastSent), 'MMM dd, HH:mm') : 'Never'}
                        </TableCell>
                        <TableCell>
                          {schedule.active ? (
                            <Badge variant="default" data-testid={`badge-status-${schedule.id}`}>
                              <Play className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" data-testid={`badge-status-${schedule.id}`}>
                              <Pause className="w-3 h-3 mr-1" />
                              Paused
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleMutation.mutate(schedule.id)}
                              data-testid={`button-toggle-${schedule.id}`}
                            >
                              {schedule.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(schedule)}
                              data-testid={`button-edit-${schedule.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteMutation.mutate(schedule.id)}
                              data-testid={`button-delete-${schedule.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
