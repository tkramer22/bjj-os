import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, X, Users, Loader2, Eye, Pencil, Trash2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { adminApiRequest } from "@/lib/adminApi";

export default function AdminLifetime() {
  const { toast } = useToast();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBeltLevel, setEditBeltLevel] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editAdminNotes, setEditAdminNotes] = useState("");
  const [editLifetimeBypass, setEditLifetimeBypass] = useState(false);
  
  // Email invitation states
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteReason, setInviteReason] = useState<string>("");
  const [sendEmailChecked, setSendEmailChecked] = useState(false);
  const [emailSubject, setEmailSubject] = useState("BJJ OS lifetime access for free");
  const [emailBody, setEmailBody] = useState(`Hey [Name],

I've been working on this for a while and I'm really excited to finally share it with you. 

It's called BJJ OS - and I'm giving you lifetime access, no charge, ever. I'm genuinely grateful you're willing to try it.

Here's what it actually is:

At the core is Professor OS - an AI system I built specifically for BJJ. It's not just a chatbot that spits out generic answers. 

It learns your game. Tracks what you're working on, what's clicking, what you're struggling with. It autonomously analyzes thousands of videos daily - curating, saving, and categorizing them after passing numerous algorithm tests for quality. The goal is to build a library of thousands of videos over time, with only elite instruction making the cut.

Ask it technique questions and it gives you real answers, not surface-level stuff. It recommends specific videos based on YOUR game, YOUR body type, YOUR goals. The more you use it, the better it gets at coaching you.

I'm seriously shocked by how smart it is and it's constantly learning.

This is something I believe can actually help people improve. Not just track sessions or show random videos - but genuinely accelerate your learning.

That said, I'm still building and refining it. I want to know what's bad and what could be better. Please help me bang out the kinks. Criticism only helps and it's appreciated.

👉 Click here to get started: https://bjjos.app/signup?email=[EMAIL]

Email me at Todd@bjjos.app or text/call me at 1.914.837.3750 anytime. I would love to hear from you.

Os!
- Todd`);

  const { data: lifetimeUsers, isLoading } = useQuery({
    queryKey: ['/api/admin/lifetime-users'],
    queryFn: () => adminApiRequest('/api/admin/lifetime-users'),
  });

  const { data: viewUserData, isLoading: viewUserLoading } = useQuery({
    queryKey: ['/api/admin/lifetime-users', viewUserId],
    enabled: !!viewUserId,
    queryFn: () => adminApiRequest(`/api/admin/lifetime-users/${viewUserId}`),
  });

  const { data: editUserData, isLoading: editUserLoading } = useQuery({
    queryKey: ['/api/admin/lifetime-users', editUserId],
    enabled: !!editUserId,
    queryFn: async () => {
      const data = await adminApiRequest(`/api/admin/lifetime-users/${editUserId}`);
      setEditDisplayName(data.displayName || data.name || '');
      setEditBeltLevel(data.beltLevel || '');
      setEditReason(data.membership?.reason || data.reason || '');
      setEditAdminNotes(data.adminNotes || '');
      setEditLifetimeBypass(data.isLifetimeUser || false);
      return data;
    },
  });


  const editUserMutation = useMutation({
    mutationFn: async (data: { id: string; displayName: string; beltLevel: string; reason: string; adminNotes: string; isLifetimeUser: boolean }) => {
      return await adminApiRequest(`/api/admin/lifetime-users/${data.id}`, 'PATCH', {
        displayName: data.displayName,
        beltLevel: data.beltLevel,
        reason: data.reason,
        adminNotes: data.adminNotes,
        isLifetimeUser: data.isLifetimeUser,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lifetime-users'] });
      toast({
        title: "User Updated",
        description: "User details updated successfully",
      });
      setEditUserId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await adminApiRequest(`/api/admin/lifetime-users/${userId}`, 'DELETE', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lifetime-users'] });
      toast({
        title: "User Deleted",
        description: "User deleted successfully",
      });
      setDeleteUserId(null);
      setSelectedUsers(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      return await adminApiRequest('/api/admin/lifetime-users/bulk-delete', 'POST', { userIds });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lifetime-users'] });
      toast({
        title: "Bulk Delete Complete",
        description: data.summary,
      });
      setShowBulkDeleteDialog(false);
      setSelectedUsers(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to bulk delete users",
        variant: "destructive",
      });
    },
  });
  
  // Instant grant mutation
  const instantGrantMutation = useMutation({
    mutationFn: async (data: { email: string; reason: string; sendEmail: boolean; emailSubject?: string; emailBody?: string }) => {
      return await adminApiRequest('/api/admin/lifetime/grant-instant', 'POST', data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/lifetime-users'] });
      toast({
        title: "Success!",
        description: data.message,
      });
      setInviteEmail("");
      setInviteReason("");
      setSendEmailChecked(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to grant lifetime access",
        variant: "destructive",
      });
    },
  });


  const handleEditSubmit = () => {
    if (!editUserId) return;
    editUserMutation.mutate({
      id: editUserId,
      displayName: editDisplayName,
      beltLevel: editBeltLevel,
      reason: editReason,
      adminNotes: editAdminNotes,
      isLifetimeUser: editLifetimeBypass,
    });
  };
  
  const handleInstantGrant = () => {
    if (!inviteEmail) {
      toast({
        title: "Missing Information",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }
    if (!inviteReason) {
      toast({
        title: "Missing Information",
        description: "Please select a reason for lifetime access",
        variant: "destructive",
      });
      return;
    }
    instantGrantMutation.mutate({
      email: inviteEmail,
      reason: inviteReason,
      sendEmail: sendEmailChecked,
      emailSubject: sendEmailChecked ? emailSubject : undefined,
      emailBody: sendEmailChecked ? emailBody : undefined,
    });
  };

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUsers(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === lifetimeUsers?.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(lifetimeUsers?.map((u: any) => u.id) || []));
    }
  };

  const formatDisplayName = (user: any) => {
    const name = user.displayName || user.name || 'Unnamed';
    const username = user.username;
    return username ? `${name} (@${username})` : name;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h2 className="text-3xl font-bold">Lifetime Access Management</h2>
        
        {/* Email Invitation Card - Instant Grant */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Send Lifetime Access Invitation
            </CardTitle>
            <CardDescription>
              Grant free lifetime access to beta testers, special contributors, or VIP users. They get full access forever without paying.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleInstantGrant();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email Address *</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  data-testid="input-invite-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-reason">Reason for Lifetime Access *</Label>
                <Select value={inviteReason} onValueChange={setInviteReason} required>
                  <SelectTrigger id="invite-reason" data-testid="select-invite-reason">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Beta Tester">Beta Tester</SelectItem>
                    <SelectItem value="VIP / Founding Member">VIP / Founding Member</SelectItem>
                    <SelectItem value="Gym Owner">Gym Owner</SelectItem>
                    <SelectItem value="Elite Instructor (Black Belt)">Elite Instructor (Black Belt)</SelectItem>
                    <SelectItem value="Elite Competitor">Elite Competitor</SelectItem>
                    <SelectItem value="Business Partner">Business Partner</SelectItem>
                    <SelectItem value="Personal Friend">Personal Friend</SelectItem>
                    <SelectItem value="Essential Training Partner">Essential Training Partner</SelectItem>
                    <SelectItem value="Content Creator / Influencer">Content Creator / Influencer</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="send-email" 
                  checked={sendEmailChecked}
                  onCheckedChange={(checked) => setSendEmailChecked(checked as boolean)}
                  data-testid="checkbox-send-email"
                />
                <label
                  htmlFor="send-email"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Send invitation email
                </label>
              </div>

              {/* Message Editor - shows when send email is checked */}
              {sendEmailChecked && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    <span className="font-medium">Message Preview</span>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email-subject">Subject</Label>
                    <Input
                      id="email-subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Email subject"
                      data-testid="input-email-subject"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email-body">Message Body</Label>
                    <Textarea
                      id="email-body"
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      placeholder="Email message"
                      rows={20}
                      className="font-mono text-sm"
                      data-testid="textarea-email-body"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                    <span>💡</span>
                    <span>You can edit this message before sending. Use [Name] and [EMAIL] as placeholders.</span>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={!inviteEmail || !inviteReason || instantGrantMutation.isPending}
                className="w-full"
                data-testid="button-grant-lifetime"
              >
                <Star className="h-4 w-4 mr-2" />
                {instantGrantMutation.isPending ? "Granting..." : (sendEmailChecked ? "Grant Lifetime Access & Send Email" : "Grant Lifetime Access")}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        {/* Lifetime Members List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Lifetime Memberships
                </CardTitle>
                <CardDescription>
                  Grant free lifetime access to beta testers, special contributors, or VIP users. They get full access forever without paying.
                  {lifetimeUsers && lifetimeUsers.length > 0 && (
                    <span className="ml-2 font-semibold">({lifetimeUsers.length} total)</span>
                  )}
                </CardDescription>
              </div>
              {selectedUsers.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowBulkDeleteDialog(true)}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected ({selectedUsers.size})
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={lifetimeUsers?.length > 0 && selectedUsers.size === lifetimeUsers?.length}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Belt</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Bypass</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading lifetime members...
                  </TableCell>
                </TableRow>
              ) : lifetimeUsers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No lifetime members yet. Grant access to your first beta tester above!
                  </TableCell>
                </TableRow>
              ) : (
                lifetimeUsers?.map((user: any) => (
                  <TableRow key={user.id} data-testid={`row-lifetime-${user.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedUsers.has(user.id)}
                        onCheckedChange={() => toggleUserSelection(user.id)}
                        data-testid={`checkbox-user-${user.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{formatDisplayName(user)}</TableCell>
                    <TableCell className="font-mono text-sm">{user.phoneNumber || user.email || 'Unknown'}</TableCell>
                    <TableCell>
                      {user.reason ? (
                        <Badge variant="secondary" className="text-xs">{user.reason}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.beltLevel ? (
                        <Badge variant="outline">{user.beltLevel}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(user.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </TableCell>
                    <TableCell>
                      {user.isLifetimeUser ? (
                        <Badge variant="default" className="text-xs">ON</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">OFF</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewUserId(user.id)}
                          data-testid={`button-view-${user.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditUserId(user.id)}
                          data-testid={`button-edit-${user.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteUserId(user.id)}
                          data-testid={`button-delete-${user.id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* View User Dialog */}
      <Dialog open={!!viewUserId} onOpenChange={(open) => !open && setViewUserId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              Complete information for this lifetime user
            </DialogDescription>
          </DialogHeader>
          {viewUserLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : viewUserData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Display Name</Label>
                  <div className="font-medium">{viewUserData.displayName || viewUserData.name || 'Not set'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Username</Label>
                  <div className="font-mono text-sm">{viewUserData.username || 'Not set'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone Number</Label>
                  <div className="font-mono text-sm">{viewUserData.phoneNumber}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Belt Level</Label>
                  <div>{viewUserData.beltLevel || 'Not set'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Style</Label>
                  <div>{viewUserData.style || 'Not set'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Content Preference</Label>
                  <div>{viewUserData.contentPreference || 'Not set'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Training Frequency</Label>
                  <div>{viewUserData.trainingFrequency ? `${viewUserData.trainingFrequency}x/week` : 'Not set'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Compete Status</Label>
                  <div>{viewUserData.competeStatus || 'Not set'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Lifetime Bypass</Label>
                  <div>
                    {viewUserData.isLifetimeUser ? (
                      <Badge variant="default">Enabled</Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <div className="text-sm">{new Date(viewUserData.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Last Login</Label>
                  <div className="text-sm">{viewUserData.lastLogin ? new Date(viewUserData.lastLogin).toLocaleString() : 'Never'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Referral Code</Label>
                  <div className="font-mono text-sm">{viewUserData.referralCode || 'None'}</div>
                </div>
              </div>
              {viewUserData.focusAreas && viewUserData.focusAreas.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Focus Areas</Label>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {viewUserData.focusAreas.map((area: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-xs">{area}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {viewUserData.struggles && viewUserData.struggles.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Struggles</Label>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {viewUserData.struggles.map((struggle: string, idx: number) => (
                      <Badge key={idx} variant="secondary" className="text-xs">{struggle}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {viewUserData.adminNotes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Admin Notes</Label>
                  <div className="text-sm mt-1 p-3 bg-muted rounded-md">{viewUserData.adminNotes}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUserId} onOpenChange={(open) => !open && setEditUserId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and settings
            </DialogDescription>
          </DialogHeader>
          {editUserLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-display-name">Display Name</Label>
                <Input
                  id="edit-display-name"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="John Smith"
                  data-testid="input-edit-display-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-belt-level">Belt Level</Label>
                <Select value={editBeltLevel} onValueChange={setEditBeltLevel}>
                  <SelectTrigger data-testid="select-edit-belt">
                    <SelectValue placeholder="Select belt level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="white">White</SelectItem>
                    <SelectItem value="blue">Blue</SelectItem>
                    <SelectItem value="purple">Purple</SelectItem>
                    <SelectItem value="brown">Brown</SelectItem>
                    <SelectItem value="black">Black</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-reason">Reason for Lifetime Access</Label>
                <Select value={editReason} onValueChange={setEditReason}>
                  <SelectTrigger data-testid="select-edit-reason">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Beta Tester">Beta Tester</SelectItem>
                    <SelectItem value="VIP / Founding Member">VIP / Founding Member</SelectItem>
                    <SelectItem value="Gym Owner">Gym Owner</SelectItem>
                    <SelectItem value="Elite Instructor (Black Belt)">Elite Instructor (Black Belt)</SelectItem>
                    <SelectItem value="Elite Competitor">Elite Competitor</SelectItem>
                    <SelectItem value="Business Partner">Business Partner</SelectItem>
                    <SelectItem value="Personal Friend">Personal Friend</SelectItem>
                    <SelectItem value="Essential Training Partner">Essential Training Partner</SelectItem>
                    <SelectItem value="Content Creator / Influencer">Content Creator / Influencer</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-admin-notes">Admin Notes</Label>
                <Textarea
                  id="edit-admin-notes"
                  value={editAdminNotes}
                  onChange={(e) => setEditAdminNotes(e.target.value)}
                  placeholder="Internal notes..."
                  rows={3}
                  data-testid="input-edit-admin-notes"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-lifetime-bypass"
                  checked={editLifetimeBypass}
                  onCheckedChange={(checked) => setEditLifetimeBypass(!!checked)}
                  data-testid="checkbox-edit-lifetime-bypass"
                />
                <Label htmlFor="edit-lifetime-bypass" className="cursor-pointer">
                  Enable Lifetime Bypass (LIFETIME code works)
                </Label>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setEditUserId(null)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEditSubmit}
                  disabled={editUserMutation.isPending}
                  data-testid="button-save-edit"
                >
                  {editUserMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Single User Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={(open) => !open && setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this user and all their data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteUserId) {
                  deleteUserMutation.mutate(deleteUserId);
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedUsers.size} Users?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedUsers.size} selected users and all their data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedUsers))}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedUsers.size} Users`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
