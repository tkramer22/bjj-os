import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, XCircle, Eye, Shield, Smartphone, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminApiRequest } from "@/lib/adminApi";
import { formatDistanceToNow } from "date-fns";

interface FlaggedAccount {
  id: string;
  userId: string;
  phoneNumber: string;
  name: string | null;
  fraudScore: number;
  riskLevel: string;
  flaggedAt: string;
  lastReviewedAt: string | null;
  isResolved: boolean;
  fraudIndicators: string[];
  deviceCount: number;
  suspiciousEvents: number;
}

interface DeviceInfo {
  id: string;
  deviceName: string;
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
  ipAddress: string;
  location: string | null;
}

export default function AdminFlaggedAccounts() {
  const { toast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState<FlaggedAccount | null>(null);
  const [showDevices, setShowDevices] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: flaggedAccounts, isLoading, error: flaggedError } = useQuery({
    queryKey: ['/api/admin/flagged-accounts'],
    queryFn: () => adminApiRequest('/api/admin/flagged-accounts'),
  });

  const { data: userDevices } = useQuery({
    queryKey: ['/api/admin/devices', selectedUserId],
    queryFn: () => adminApiRequest(`/api/admin/devices/${selectedUserId}`),
    enabled: !!selectedUserId && showDevices,
  });

  const resolveFlagMutation = useMutation({
    mutationFn: async ({ userId, resolution }: { userId: string; resolution: 'legitimate' | 'fraudulent' }) => {
      return await adminApiRequest(`/api/admin/flagged-accounts/${userId}/review`, 'POST', { resolution });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/flagged-accounts'] });
      toast({
        title: "✅ Account Reviewed",
        description: variables.resolution === 'legitimate' 
          ? "Account marked as legitimate" 
          : "Account flagged as fraudulent",
      });
      setSelectedAccount(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resolve flag",
        variant: "destructive",
      });
    },
  });

  const viewDevices = (userId: string, account: FlaggedAccount) => {
    setSelectedUserId(userId);
    setSelectedAccount(account);
    setShowDevices(true);
  };

  const getRiskBadgeColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'HIGH': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'MEDIUM': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'LOW': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const unresolvedAccounts = flaggedAccounts?.filter((a: FlaggedAccount) => !a.isResolved) || [];
  const resolvedAccounts = flaggedAccounts?.filter((a: FlaggedAccount) => a.isResolved) || [];

  return (
    <AdminLayout title="Account Sharing Prevention">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Flagged</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-flagged">
                {flaggedAccounts?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Accounts requiring review
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unresolved</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-unresolved-count">
                {unresolvedAccounts.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Pending admin action
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Risk</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500" data-testid="text-high-risk-count">
                {flaggedAccounts?.filter((a: FlaggedAccount) => a.riskLevel === 'HIGH').length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Critical attention needed
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Flagged Accounts</CardTitle>
            <CardDescription>
              Review and take action on accounts with suspicious sharing patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            {flaggedError ? (
              <div className="text-center py-8" data-testid="error-flagged-accounts">
                <XCircle className="h-12 w-12 mx-auto mb-2 text-red-500" />
                <p className="text-red-500 font-medium">Failed to load flagged accounts</p>
                <p className="text-sm text-muted-foreground mt-1">{(flaggedError as Error).message}</p>
              </div>
            ) : isLoading ? (
              <div className="flex justify-center py-8" data-testid="loading-flagged-accounts">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : unresolvedAccounts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-flagged-accounts">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                <p>No flagged accounts to review</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Risk Level</TableHead>
                    <TableHead>Fraud Score</TableHead>
                    <TableHead>Indicators</TableHead>
                    <TableHead>Devices</TableHead>
                    <TableHead>Flagged</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unresolvedAccounts.map((account: FlaggedAccount) => (
                    <TableRow key={account.id} data-testid={`row-flagged-account-${account.userId}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{account.name || 'Unknown'}</div>
                          <div className="text-sm text-muted-foreground">{account.phoneNumber}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRiskBadgeColor(account.riskLevel)} data-testid={`badge-risk-${account.userId}`}>
                          {account.riskLevel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm" data-testid={`text-fraud-score-${account.userId}`}>
                          {account.fraudScore.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {account.fraudIndicators.slice(0, 2).map((indicator, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {indicator}
                            </Badge>
                          ))}
                          {account.fraudIndicators.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{account.fraudIndicators.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Smartphone className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{account.deviceCount}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(account.flaggedAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewDevices(account.userId, account)}
                            data-testid={`button-view-devices-${account.userId}`}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveFlagMutation.mutate({ userId: account.userId, resolution: 'legitimate' })}
                            disabled={resolveFlagMutation.isPending}
                            data-testid={`button-mark-legitimate-${account.userId}`}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Legitimate
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => resolveFlagMutation.mutate({ userId: account.userId, resolution: 'fraudulent' })}
                            disabled={resolveFlagMutation.isPending}
                            data-testid={`button-mark-fraudulent-${account.userId}`}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Fraudulent
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {resolvedAccounts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Resolved Accounts</CardTitle>
              <CardDescription>Previously reviewed flagged accounts</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Risk Level</TableHead>
                    <TableHead>Fraud Score</TableHead>
                    <TableHead>Reviewed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedAccounts.map((account: FlaggedAccount) => (
                    <TableRow key={account.id} className="opacity-60">
                      <TableCell>
                        <div>
                          <div className="font-medium">{account.name || 'Unknown'}</div>
                          <div className="text-sm text-muted-foreground">{account.phoneNumber}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRiskBadgeColor(account.riskLevel)}>
                          {account.riskLevel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">
                          {account.fraudScore.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {account.lastReviewedAt 
                          ? formatDistanceToNow(new Date(account.lastReviewedAt), { addSuffix: true })
                          : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Dialog open={showDevices} onOpenChange={setShowDevices}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Device Details</DialogTitle>
              <DialogDescription>
                {selectedAccount && (
                  <>
                    Authorized devices for {selectedAccount.name || selectedAccount.phoneNumber}
                    {' - '}
                    <Badge className={getRiskBadgeColor(selectedAccount.riskLevel)}>
                      {selectedAccount.riskLevel} RISK
                    </Badge>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {selectedAccount && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Fraud Indicators</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {selectedAccount.fraudIndicators.map((indicator, idx) => (
                        <Badge key={idx} variant="outline">
                          {indicator}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div>
                  <h3 className="font-semibold mb-3">Authorized Devices ({userDevices?.length || 0})</h3>
                  {userDevices && userDevices.length > 0 ? (
                    <div className="space-y-2">
                      {userDevices.map((device: DeviceInfo) => (
                        <Card key={device.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{device.deviceName}</span>
                                  {device.isActive ? (
                                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                                      Active
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">Inactive</Badge>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                                  <div>
                                    <span className="font-medium">IP:</span> {device.ipAddress}
                                  </div>
                                  <div>
                                    <span className="font-medium">Location:</span> {device.location || 'Unknown'}
                                  </div>
                                  <div>
                                    <span className="font-medium">First seen:</span>{' '}
                                    {formatDistanceToNow(new Date(device.firstSeenAt), { addSuffix: true })}
                                  </div>
                                  <div>
                                    <span className="font-medium">Last seen:</span>{' '}
                                    {formatDistanceToNow(new Date(device.lastSeenAt), { addSuffix: true })}
                                  </div>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground font-mono">
                                  Fingerprint: {device.fingerprint.substring(0, 16)}...
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No devices found</p>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
