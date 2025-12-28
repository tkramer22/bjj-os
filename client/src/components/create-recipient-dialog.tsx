import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRecipientSchema, type InsertRecipient, type Recipient } from "@shared/schema";
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
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface CreateRecipientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRecipient?: Recipient | null;
}

export function CreateRecipientDialog({
  open,
  onOpenChange,
  editingRecipient,
}: CreateRecipientDialogProps) {
  const { toast } = useToast();

  const form = useForm<InsertRecipient>({
    resolver: zodResolver(insertRecipientSchema),
    defaultValues: {
      name: "",
      phoneNumber: "",
      group: "",
    },
  });

  useEffect(() => {
    if (editingRecipient) {
      form.reset({
        name: editingRecipient.name,
        phoneNumber: editingRecipient.phoneNumber,
        group: editingRecipient.group || "",
      });
    } else {
      form.reset({
        name: "",
        phoneNumber: "",
        group: "",
      });
    }
  }, [editingRecipient, form]);

  const createMutation = useMutation({
    mutationFn: (data: InsertRecipient) => apiRequest("POST", "/api/recipients", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipients"] });
      toast({
        title: "Recipient added",
        description: "The recipient has been added successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add recipient. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: InsertRecipient) =>
      apiRequest("PATCH", `/api/recipients/${editingRecipient?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipients"] });
      toast({
        title: "Recipient updated",
        description: "The recipient has been updated successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update recipient. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertRecipient) => {
    if (editingRecipient) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">
            {editingRecipient ? "Edit Recipient" : "Add Recipient"}
          </DialogTitle>
          <DialogDescription>
            {editingRecipient
              ? "Update recipient information"
              : "Add a new SMS recipient"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Doe"
                      data-testid="input-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="+1234567890"
                      className="font-mono"
                      data-testid="input-phone"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Include country code (e.g., +1 for US)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="group"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., VIP, Marketing"
                      data-testid="input-group"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Organize recipients into groups
                  </FormDescription>
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
                {editingRecipient ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
