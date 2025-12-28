import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Pencil, Trash2 } from "lucide-react";
import { type MessageTemplate } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { CreateTemplateDialog } from "@/components/create-template-dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
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

export default function Templates() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<MessageTemplate | null>(null);

  const { data: templates, isLoading } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "Template deleted",
        description: "The template has been deleted successfully",
      });
      setDeletingTemplate(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (template: MessageTemplate) => {
    setEditingTemplate(template);
  };

  const handleDelete = (template: MessageTemplate) => {
    setDeletingTemplate(template);
  };

  const extractVariables = (content: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      variables.add(match[1]);
    }
    
    return Array.from(variables);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Message Templates</h1>
          <p className="text-sm text-muted-foreground">
            Create reusable message templates with personalization variables
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-template">
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((template) => (
            <Card key={template.id} data-testid={`template-card-${template.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {template.name}
                    </CardTitle>
                    {template.description && (
                      <CardDescription>{template.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(template)}
                      data-testid={`button-edit-${template.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(template)}
                      data-testid={`button-delete-${template.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm whitespace-pre-wrap" data-testid={`text-content-${template.id}`}>
                    {template.content}
                  </p>
                </div>
                {extractVariables(template.content).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">Variables:</span>
                    {extractVariables(template.content).map((variable) => (
                      <Badge key={variable} variant="outline" className="font-mono text-xs">
                        {`{{${variable}}}`}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-16 w-16 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No templates yet</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              Create reusable message templates with variables like {`{{name}}`} and {`{{phone}}`}
            </p>
            <Button onClick={() => setIsCreateOpen(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Template
            </Button>
          </CardContent>
        </Card>
      )}

      <CreateTemplateDialog
        open={isCreateOpen || !!editingTemplate}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingTemplate(null);
          }
        }}
        template={editingTemplate || undefined}
      />

      <AlertDialog open={!!deletingTemplate} onOpenChange={() => setDeletingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingTemplate?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTemplate && deleteMutation.mutate(deletingTemplate.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
