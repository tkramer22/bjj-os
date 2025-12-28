import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSmsScheduleSchema, type InsertSmsSchedule, type SmsSchedule, type Recipient, type MessageTemplate } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
  { value: "UTC", label: "UTC" },
];

interface CreateScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSchedule?: SmsSchedule | null;
}

export function CreateScheduleDialog({
  open,
  onOpenChange,
  editingSchedule,
}: CreateScheduleDialogProps) {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  
  const { data: recipients } = useQuery<Recipient[]>({
    queryKey: ["/api/recipients"],
  });

  const { data: templates } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/templates"],
  });

  // Calculate groups from recipients
  const groupedRecipients = useMemo(() => {
    if (!recipients) return {};
    
    const groups: Record<string, Recipient[]> = {};
    recipients.forEach(recipient => {
      const group = recipient.group || "Ungrouped";
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(recipient);
    });
    return groups;
  }, [recipients]);

  const form = useForm<InsertSmsSchedule>({
    resolver: zodResolver(insertSmsScheduleSchema),
    defaultValues: {
      message: "",
      scheduleTime: "09:00",
      timezone: "America/New_York",
      active: true,
      recipientIds: [],
    },
  });

  useEffect(() => {
    if (editingSchedule) {
      form.reset({
        message: editingSchedule.message,
        scheduleTime: editingSchedule.scheduleTime,
        timezone: editingSchedule.timezone,
        active: editingSchedule.active,
        recipientIds: editingSchedule.recipientIds,
      });
      setSelectedTemplate("");
    } else {
      form.reset({
        message: "",
        scheduleTime: "09:00",
        timezone: "America/New_York",
        active: true,
        recipientIds: [],
      });
      setSelectedTemplate("");
    }
  }, [editingSchedule, form]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (templateId && templates) {
      const template = templates.find(t => t.id === templateId);
      if (template) {
        form.setValue("message", template.content);
      }
    }
  };

  const handleGroupSelect = (group: string) => {
    const groupRecipients = groupedRecipients[group] || [];
    const groupRecipientIds = groupRecipients.map(r => r.id);
    const currentIds = form.getValues("recipientIds") || [];
    
    // Check if all group recipients are already selected
    const allSelected = groupRecipientIds.every(id => currentIds.includes(id));
    
    if (allSelected) {
      // Deselect all in group
      form.setValue(
        "recipientIds",
        currentIds.filter(id => !groupRecipientIds.includes(id))
      );
    } else {
      // Select all in group (add only new ones)
      const newIds = [...currentIds];
      groupRecipientIds.forEach(id => {
        if (!newIds.includes(id)) {
          newIds.push(id);
        }
      });
      form.setValue("recipientIds", newIds);
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: InsertSmsSchedule) => apiRequest("POST", "/api/schedules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Schedule created",
        description: "Your SMS schedule has been created successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create schedule. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: InsertSmsSchedule) =>
      apiRequest("PATCH", `/api/schedules/${editingSchedule?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Schedule updated",
        description: "Your SMS schedule has been updated successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update schedule. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertSmsSchedule) => {
    if (editingSchedule) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">
            {editingSchedule ? "Edit Schedule" : "Create Schedule"}
          </DialogTitle>
          <DialogDescription>
            {editingSchedule
              ? "Update your SMS schedule details"
              : "Set up a new daily SMS schedule"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {templates && templates.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Use Template (Optional)</label>
                <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                  <SelectTrigger data-testid="select-template">
                    <SelectValue placeholder="Select a template or write your own message" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Write custom message</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate && selectedTemplate !== "none" && (
                  <p className="text-xs text-muted-foreground">
                    Variables like {`{{name}}`} and {`{{phone}}`} will be replaced with recipient data
                  </p>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter your SMS message or select a template above..."
                      className="min-h-[100px] resize-none"
                      data-testid="input-message"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {field.value.length}/1600 characters. Use {`{{name}}`}, {`{{phone}}`}, or {`{{group}}`} for personalization
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="scheduleTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule Time</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        data-testid="input-schedule-time"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Daily send time
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-timezone">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Schedule timezone
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="recipientIds"
              render={() => (
                <FormItem>
                  <FormLabel>Recipients</FormLabel>
                  <FormDescription>
                    Select recipients who will receive this message
                  </FormDescription>
                  {recipients && recipients.length > 0 ? (
                    <>
                      {Object.keys(groupedRecipients).length > 1 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          <span className="text-xs text-muted-foreground">Quick select:</span>
                          {Object.keys(groupedRecipients).sort().map((group) => {
                            const groupRecipientIds = groupedRecipients[group].map(r => r.id);
                            const currentIds = form.watch("recipientIds") || [];
                            const allSelected = groupRecipientIds.every(id => currentIds.includes(id));
                            
                            return (
                              <Button
                                key={group}
                                type="button"
                                variant={allSelected ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleGroupSelect(group)}
                                data-testid={`button-select-group-${group}`}
                              >
                                {group} ({groupedRecipients[group].length})
                              </Button>
                            );
                          })}
                        </div>
                      )}
                      <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                        {recipients.map((recipient) => (
                        <FormField
                          key={recipient.id}
                          control={form.control}
                          name="recipientIds"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(recipient.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, recipient.id])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== recipient.id
                                          )
                                        );
                                  }}
                                  data-testid={`checkbox-recipient-${recipient.id}`}
                                />
                              </FormControl>
                              <div className="flex-1">
                                <FormLabel className="text-sm font-normal cursor-pointer">
                                  {recipient.name}
                                </FormLabel>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {recipient.phoneNumber}
                                </p>
                              </div>
                            </FormItem>
                          )}
                        />
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No recipients available. Add recipients first.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingSchedule ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
