import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { insertMessageTemplateSchema, type InsertMessageTemplate, type MessageTemplate } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: MessageTemplate;
}

export function CreateTemplateDialog({ open, onOpenChange, template }: CreateTemplateDialogProps) {
  const { toast } = useToast();
  const isEditing = !!template;

  const form = useForm<InsertMessageTemplate>({
    resolver: zodResolver(insertMessageTemplateSchema),
    defaultValues: {
      name: "",
      content: "",
      description: "",
    },
  });

  useEffect(() => {
    if (template) {
      form.reset({
        name: template.name,
        content: template.content,
        description: template.description || "",
      });
    } else {
      form.reset({
        name: "",
        content: "",
        description: "",
      });
    }
  }, [template, form]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertMessageTemplate) => {
      if (isEditing) {
        return await apiRequest("PATCH", `/api/templates/${template.id}`, data);
      } else {
        return await apiRequest("POST", "/api/templates", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: isEditing ? "Template updated" : "Template created",
        description: isEditing
          ? "Your template has been updated successfully"
          : "Your template has been created successfully",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: isEditing ? "Failed to update template" : "Failed to create template",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertMessageTemplate) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">
            {isEditing ? "Edit Template" : "Create Template"}
          </DialogTitle>
          <DialogDescription>
            Create a reusable message template with personalization variables
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Welcome Message"
                      {...field}
                      data-testid="input-template-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="A friendly welcome message for new subscribers"
                      {...field}
                      data-testid="input-template-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Hi {{name}}, welcome! Your phone number is {{phone}}."
                      rows={6}
                      {...field}
                      data-testid="textarea-template-content"
                    />
                  </FormControl>
                  <FormDescription>
                    Use variables: <Badge variant="outline" className="font-mono mx-1">{`{{name}}`}</Badge>
                    <Badge variant="outline" className="font-mono mx-1">{`{{phone}}`}</Badge>
                    <Badge variant="outline" className="font-mono mx-1">{`{{group}}`}</Badge>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-submit"
              >
                {createMutation.isPending
                  ? isEditing
                    ? "Updating..."
                    : "Creating..."
                  : isEditing
                  ? "Update Template"
                  : "Create Template"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
