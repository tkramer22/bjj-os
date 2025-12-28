import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Users, Phone, Upload, Filter } from "lucide-react";
import { type Recipient } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateRecipientDialog } from "@/components/create-recipient-dialog";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Recipients() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [csvImportDialogOpen, setCsvImportDialogOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recipientToDelete, setRecipientToDelete] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const { toast } = useToast();

  const { data: recipients, isLoading } = useQuery<Recipient[]>({
    queryKey: ["/api/recipients"],
  });

  // Calculate unique groups and filtered recipients
  const { groups, filteredRecipients, groupCounts } = useMemo(() => {
    if (!recipients) return { groups: [], filteredRecipients: [], groupCounts: {} };

    const uniqueGroups = new Set<string>();
    const counts: Record<string, number> = {};

    recipients.forEach(r => {
      const group = r.group || "Ungrouped";
      uniqueGroups.add(group);
      counts[group] = (counts[group] || 0) + 1;
    });

    const filtered = selectedGroup === "all" 
      ? recipients 
      : recipients.filter(r => {
          const group = r.group || "Ungrouped";
          return group === selectedGroup;
        });

    return {
      groups: Array.from(uniqueGroups).sort(),
      filteredRecipients: filtered,
      groupCounts: counts
    };
  }, [recipients, selectedGroup]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/recipients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipients"] });
      toast({
        title: "Recipient deleted",
        description: "The recipient has been deleted successfully.",
      });
      setDeleteDialogOpen(false);
      setRecipientToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete recipient. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Recipients</h1>
          <p className="text-sm text-muted-foreground">
            Manage your SMS recipients
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setCsvImportDialogOpen(true)}
            data-testid="button-import-csv"
          >
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button
            onClick={() => {
              setEditingRecipient(null);
              setCreateDialogOpen(true);
            }}
            data-testid="button-add-recipient"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Recipient
          </Button>
        </div>
      </div>

      {!isLoading && recipients && recipients.length > 0 && groups.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-[200px]" data-testid="select-group-filter">
                <SelectValue placeholder="All Groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All Groups ({recipients.length})
                </SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group} ({groupCounts[group] || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filteredRecipients.length} of {recipients.length} recipients
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : recipients && recipients.length > 0 ? (
        filteredRecipients.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredRecipients.map((recipient) => (
              <Card key={recipient.id} data-testid={`recipient-card-${recipient.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(recipient.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate" data-testid={`text-name-${recipient.id}`}>
                        {recipient.name}
                      </h3>
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span className="font-mono truncate" data-testid={`text-phone-${recipient.id}`}>
                          {recipient.phoneNumber}
                        </span>
                      </div>
                      {recipient.group && (
                        <Badge variant="outline" className="mt-2" data-testid={`badge-group-${recipient.id}`}>
                          {recipient.group}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingRecipient(recipient);
                          setCreateDialogOpen(true);
                        }}
                        data-testid={`button-edit-${recipient.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setRecipientToDelete(recipient.id);
                          setDeleteDialogOpen(true);
                        }}
                        data-testid={`button-delete-${recipient.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Filter className="h-16 w-16 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No recipients in this group</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                Try selecting a different group or clear the filter
              </p>
              <Button
                className="mt-6"
                variant="outline"
                onClick={() => setSelectedGroup("all")}
                data-testid="button-clear-filter"
              >
                Clear Filter
              </Button>
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-16 w-16 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No recipients yet</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              Add recipients to start sending them SMS messages
            </p>
            <Button
              className="mt-6"
              onClick={() => setCreateDialogOpen(true)}
              data-testid="button-add-first-recipient"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Recipient
            </Button>
          </CardContent>
        </Card>
      )}

      <CreateRecipientDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        editingRecipient={editingRecipient}
      />

      <CsvImportDialog
        open={csvImportDialogOpen}
        onOpenChange={setCsvImportDialogOpen}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipient</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this recipient? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => recipientToDelete && deleteMutation.mutate(recipientToDelete)}
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
