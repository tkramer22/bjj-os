import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Calendar, Users, Power } from "lucide-react";
import { type SmsSchedule, type Recipient } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateScheduleDialog } from "@/components/create-schedule-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Schedules() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<SmsSchedule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: schedules, isLoading } = useQuery<SmsSchedule[]>({
    queryKey: ["/api/schedules"],
  });

  const { data: recipients } = useQuery<Recipient[]>({
    queryKey: ["/api/recipients"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/schedules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Schedule deleted",
        description: "The SMS schedule has been deleted successfully.",
      });
      setDeleteDialogOpen(false);
      setScheduleToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete schedule. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest("PATCH", `/api/schedules/${id}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const getRecipientNames = (recipientIds: string[]) => {
    if (!recipients) return "";
    return recipients
      .filter((r) => recipientIds.includes(r.id))
      .map((r) => r.name)
      .join(", ");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">SMS Schedules</h1>
          <p className="text-sm text-muted-foreground">
            Manage your daily SMS campaigns
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingSchedule(null);
            setCreateDialogOpen(true);
          }}
          data-testid="button-create-schedule"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Schedule
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : schedules && schedules.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map((schedule) => (
            <Card key={schedule.id} data-testid={`schedule-card-${schedule.id}`}>
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge
                    variant={schedule.active ? "default" : "secondary"}
                    data-testid={`badge-active-${schedule.active}`}
                  >
                    {schedule.active ? "Active" : "Paused"}
                  </Badge>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingSchedule(schedule);
                        setCreateDialogOpen(true);
                      }}
                      data-testid={`button-edit-${schedule.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setScheduleToDelete(schedule.id);
                        setDeleteDialogOpen(true);
                      }}
                      data-testid={`button-delete-${schedule.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-base line-clamp-2">
                  {schedule.message}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{schedule.scheduleTime}</span>
                  <span className="text-muted-foreground">daily</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {schedule.timezone.replace(/_/g, ' ')}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {schedule.recipientIds.length} recipient
                    {schedule.recipientIds.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {recipients && schedule.recipientIds.length > 0 && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {getRecipientNames(schedule.recipientIds)}
                  </p>
                )}
                <Button
                  variant={schedule.active ? "outline" : "default"}
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    toggleMutation.mutate({
                      id: schedule.id,
                      active: !schedule.active,
                    })
                  }
                  disabled={toggleMutation.isPending}
                  data-testid={`button-toggle-${schedule.id}`}
                >
                  <Power className="mr-2 h-4 w-4" />
                  {schedule.active ? "Pause" : "Activate"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="h-16 w-16 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No schedules yet</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              Create your first SMS schedule to start sending daily messages to your recipients
            </p>
            <Button
              className="mt-6"
              onClick={() => setCreateDialogOpen(true)}
              data-testid="button-create-first-schedule"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Schedule
            </Button>
          </CardContent>
        </Card>
      )}

      <CreateScheduleDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        editingSchedule={editingSchedule}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this schedule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => scheduleToDelete && deleteMutation.mutate(scheduleToDelete)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
