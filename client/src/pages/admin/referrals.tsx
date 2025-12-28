import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, ToggleLeft, ToggleRight, Trash2, Download, Users, DollarSign, TrendingUp, Gift, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminApiRequest } from "@/lib/adminApi";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

type DiscountType = 'none' | 'percentage' | 'fixed' | 'trial_extension' | 'free_month' | 'free_months';

interface ReferralCode {
  id: string;
  code: string;
  codeType: string;
  influencerName?: string;
  commissionRate?: string;
  commissionPercent?: number;
  discountType?: DiscountType;
  discountValue?: string;
  discountDescription?: string;
  stripeCouponId?: string;
  totalSignups?: number;
  activeSubscribers?: number;
  totalRevenueGenerated?: string;
  commissionOwed?: string;
  isActive: boolean;
  createdAt: string;
}

interface ReferredUser {
  id: string;
  email: string;
  username?: string;
  referralCodeUsed: string;
  referredByInfluencer?: string;
  referralSignupDate?: string;
  discountTypeReceived?: string;
  discountValueReceived?: string;
  discountDescription?: string;
  subscriptionType?: string;
  subscriptionStatus?: string;
  createdAt: string;
}

interface InfluencerPayout {
  id: string;
  code: string;
  influencerName: string;
  commissionRate: number;
  totalSignups: number;
  activeSubscribers: number;
  totalRevenue: string;
  commissionOwed: string;
  stripeAccountId?: string;
  payoutMethod: string;
  isActive: boolean;
}

const DISCOUNT_OPTIONS: { value: DiscountType; label: string; description: string }[] = [
  { value: 'none', label: 'No Discount', description: 'No discount for users' },
  { value: 'percentage', label: 'Percentage Off', description: 'X% off first month' },
  { value: 'fixed', label: 'Fixed Amount Off', description: '$X off first month' },
  { value: 'free_month', label: 'Free First Month', description: '1 month free' },
  { value: 'free_months', label: 'Multiple Free Months', description: 'X months free' },
  { value: 'trial_extension', label: 'Extended Trial', description: 'Extra trial days' },
];

export default function AdminReferrals() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("codes");
  
  // Create code form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [influencerName, setInfluencerName] = useState("");
  const [commissionRate, setCommissionRate] = useState("20");
  const [codeType, setCodeType] = useState<"influencer" | "user">("influencer");
  const [discountType, setDiscountType] = useState<DiscountType>("free_month");
  const [discountValue, setDiscountValue] = useState("1");

  // Queries
  const { data: codesData, isLoading: codesLoading, refetch: refetchCodes } = useQuery({
    queryKey: ['/api/admin/referrals/codes'],
    queryFn: () => adminApiRequest('/api/admin/referrals/codes'),
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['/api/admin/referrals/users'],
    queryFn: () => adminApiRequest('/api/admin/referrals/users'),
    enabled: activeTab === 'users',
  });

  const { data: payoutsData, isLoading: payoutsLoading } = useQuery({
    queryKey: ['/api/admin/referrals/payouts'],
    queryFn: () => adminApiRequest('/api/admin/referrals/payouts'),
    enabled: activeTab === 'payouts',
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['/api/admin/referrals/analytics'],
    queryFn: () => adminApiRequest('/api/admin/referrals/analytics?period=30'),
    enabled: activeTab === 'analytics',
  });

  // Mutations
  const createCodeMutation = useMutation({
    mutationFn: async (data: {
      code: string;
      codeType: string;
      influencerName: string;
      commissionRate: string;
      discountType: DiscountType;
      discountValue: string;
    }) => {
      return await adminApiRequest('/api/admin/referrals/codes', 'POST', data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/referrals/codes'] });
      toast({
        title: "Referral Code Created",
        description: data.message || `Code ${code} created successfully`,
      });
      resetCreateForm();
      setIsCreateOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create referral code",
        variant: "destructive",
      });
    },
  });

  const toggleCodeMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await adminApiRequest(`/api/admin/referrals/codes/${id}`, 'PUT', { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/referrals/codes'] });
      toast({
        title: "Code Updated",
        description: "Referral code status has been updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update code",
        variant: "destructive",
      });
    },
  });

  const deleteCodeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await adminApiRequest(`/api/admin/referrals/codes/${id}`, 'DELETE', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/referrals/codes'] });
      toast({
        title: "Code Deleted",
        description: "Referral code and associated Stripe coupon have been deleted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete code",
        variant: "destructive",
      });
    },
  });

  const resetCreateForm = () => {
    setCode("");
    setInfluencerName("");
    setCommissionRate("20");
    setCodeType("influencer");
    setDiscountType("free_month");
    setDiscountValue("1");
  };

  const handleCreateCode = () => {
    if (!code) {
      toast({
        title: "Missing Code",
        description: "Please enter a referral code",
        variant: "destructive",
      });
      return;
    }
    
    // For free_month, set value to 1; for none, set to 0
    let finalDiscountValue = discountValue;
    if (discountType === 'free_month') {
      finalDiscountValue = '1';
    } else if (discountType === 'none') {
      finalDiscountValue = '0';
    }
    
    createCodeMutation.mutate({
      code,
      codeType,
      influencerName,
      commissionRate,
      discountType,
      discountValue: finalDiscountValue,
    });
  };

  const handleExport = (type: 'users' | 'payouts') => {
    const url = `/api/admin/referrals/export?type=${type}`;
    window.open(url, '_blank');
  };

  const getDiscountValueLabel = () => {
    switch (discountType) {
      case 'percentage':
        return 'Percentage (0-100)';
      case 'fixed':
        return 'Amount ($)';
      case 'free_months':
        return 'Number of Months';
      case 'trial_extension':
        return 'Extra Days';
      default:
        return 'Value';
    }
  };

  const showDiscountValue = discountType !== 'none' && discountType !== 'free_month';

  const codes: ReferralCode[] = codesData?.codes || [];
  const users: ReferredUser[] = usersData?.users || [];
  const influencers: InfluencerPayout[] = payoutsData?.influencers || [];
  const payoutTotals = payoutsData?.totals || {};
  const analytics = analyticsData || {};

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-3xl font-bold" data-testid="text-page-title">Referral Management</h2>
            <p className="text-muted-foreground">Manage influencer codes, track conversions, and process payouts</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-referral">
                <Plus className="w-4 h-4 mr-2" />
                Create Code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Referral Code</DialogTitle>
                <DialogDescription>
                  Create a referral code with optional Stripe coupon for user discounts
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Referral Code</Label>
                  <Input
                    id="code"
                    placeholder="JTORRES"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    data-testid="input-referral-code"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Code Type</Label>
                  <Select value={codeType} onValueChange={(v) => setCodeType(v as "influencer" | "user")}>
                    <SelectTrigger data-testid="select-code-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="influencer">Influencer (earns commission)</SelectItem>
                      <SelectItem value="user">Promo Code (no commission)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {codeType === "influencer" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="influencerName">Influencer Name</Label>
                      <Input
                        id="influencerName"
                        placeholder="JT Torres"
                        value={influencerName}
                        onChange={(e) => setInfluencerName(e.target.value)}
                        data-testid="input-influencer-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commission">Commission Rate (%)</Label>
                      <Input
                        id="commission"
                        type="number"
                        placeholder="20"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(e.target.value)}
                        data-testid="input-commission-rate"
                      />
                      <p className="text-xs text-muted-foreground">
                        Influencer earns {commissionRate}% of every subscription payment
                      </p>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>User Discount Type</Label>
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as DiscountType)}>
                    <SelectTrigger data-testid="select-discount-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCOUNT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex flex-col">
                            <span>{opt.label}</span>
                            <span className="text-xs text-muted-foreground">{opt.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {showDiscountValue && (
                  <div className="space-y-2">
                    <Label htmlFor="discountValue">{getDiscountValueLabel()}</Label>
                    <Input
                      id="discountValue"
                      type="number"
                      placeholder="1"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      data-testid="input-discount-value"
                    />
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={handleCreateCode}
                  disabled={createCodeMutation.isPending}
                  data-testid="button-submit-referral"
                >
                  {createCodeMutation.isPending ? "Creating..." : "Create Referral Code"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="codes" data-testid="tab-codes">
              <Gift className="w-4 h-4 mr-2" />
              Codes
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="w-4 h-4 mr-2" />
              Referred Users
            </TabsTrigger>
            <TabsTrigger value="payouts" data-testid="tab-payouts">
              <DollarSign className="w-4 h-4 mr-2" />
              Payouts
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              <TrendingUp className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Referral Codes Tab */}
          <TabsContent value="codes" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {codes.length} referral codes configured
              </p>
              <Button variant="ghost" size="icon" onClick={() => refetchCodes()} data-testid="button-refresh-codes">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>User Benefit</TableHead>
                    <TableHead>Uses</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codesLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Loading referral codes...
                      </TableCell>
                    </TableRow>
                  ) : codes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No referral codes yet. Create your first one above!
                      </TableCell>
                    </TableRow>
                  ) : (
                    codes.map((ref: ReferralCode) => (
                      <TableRow key={ref.id} data-testid={`row-code-${ref.id}`}>
                        <TableCell className="font-mono font-medium">{ref.code}</TableCell>
                        <TableCell>{ref.influencerName || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={ref.codeType === 'influencer' ? 'default' : 'secondary'}>
                            {ref.codeType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {ref.commissionPercent ? `${ref.commissionPercent}%` : '-'}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {ref.discountDescription || 'No discount'}
                          </span>
                        </TableCell>
                        <TableCell>{ref.totalSignups || 0}</TableCell>
                        <TableCell className="font-medium">
                          ${parseFloat(ref.totalRevenueGenerated || '0').toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={ref.isActive ? 'default' : 'secondary'}>
                            {ref.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleCodeMutation.mutate({ id: ref.id, isActive: !ref.isActive })}
                              data-testid={`button-toggle-${ref.id}`}
                            >
                              {ref.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Delete referral code ${ref.code}? This will also delete the Stripe coupon.`)) {
                                  deleteCodeMutation.mutate(ref.id);
                                }
                              }}
                              data-testid={`button-delete-${ref.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Referred Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {usersData?.total || 0} users signed up with referral codes
              </p>
              <Button variant="outline" size="sm" onClick={() => handleExport('users')} data-testid="button-export-users">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>

            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Code Used</TableHead>
                    <TableHead>Influencer</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Signup Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Loading referred users...
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No users have signed up with referral codes yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user: ReferredUser) => (
                      <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>{user.username || '-'}</TableCell>
                        <TableCell className="font-mono">{user.referralCodeUsed}</TableCell>
                        <TableCell>{user.referredByInfluencer || '-'}</TableCell>
                        <TableCell>
                          <span className="text-sm">{user.discountDescription || 'None'}</span>
                        </TableCell>
                        <TableCell>
                          {user.referralSignupDate 
                            ? new Date(user.referralSignupDate).toLocaleDateString() 
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={user.subscriptionStatus === 'active' ? 'default' : 'secondary'}
                          >
                            {user.subscriptionStatus || 'unknown'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Influencer Payouts Tab */}
          <TabsContent value="payouts" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Influencers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-influencers">
                    {payoutTotals.influencerCount || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Signups</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-signups">
                    {payoutTotals.totalSignups || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-revenue">
                    ${payoutTotals.totalRevenue || '0.00'}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Commission Owed</CardTitle>
                  <DollarSign className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary" data-testid="text-commission-owed">
                    ${payoutTotals.totalCommissionOwed || '0.00'}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-end">
              <Button variant="outline" size="sm" onClick={() => handleExport('payouts')} data-testid="button-export-payouts">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>

            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Influencer</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Commission Rate</TableHead>
                    <TableHead>Signups</TableHead>
                    <TableHead>Active Subs</TableHead>
                    <TableHead>Revenue Generated</TableHead>
                    <TableHead>Commission Owed</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payoutsLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Loading payout data...
                      </TableCell>
                    </TableRow>
                  ) : influencers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No influencer codes yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    influencers.map((inf: InfluencerPayout) => (
                      <TableRow key={inf.id} data-testid={`row-influencer-${inf.id}`}>
                        <TableCell className="font-medium">{inf.influencerName}</TableCell>
                        <TableCell className="font-mono">{inf.code}</TableCell>
                        <TableCell>{inf.commissionRate}%</TableCell>
                        <TableCell>{inf.totalSignups}</TableCell>
                        <TableCell>{inf.activeSubscribers}</TableCell>
                        <TableCell>${inf.totalRevenue}</TableCell>
                        <TableCell className="font-medium text-primary">${inf.commissionOwed}</TableCell>
                        <TableCell>
                          <Badge variant={inf.isActive ? 'default' : 'secondary'}>
                            {inf.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Referred</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-analytics-total">
                    {analytics.totals?.totalReferred || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Subscribers</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-analytics-active">
                    {analytics.totals?.activeSubscribers || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">In Trial</CardTitle>
                  <Gift className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-analytics-trials">
                    {analytics.totals?.trials || 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Signups Over Time Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Referral Signups Over Time (Last 30 Days)</CardTitle>
                <CardDescription>Daily signups from referral codes</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Loading chart data...
                  </div>
                ) : (analytics.signupsByDay?.length || 0) === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No signup data available yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.signupsByDay}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        className="text-muted-foreground"
                      />
                      <YAxis className="text-muted-foreground" />
                      <Tooltip 
                        labelFormatter={(val) => new Date(val).toLocaleDateString()}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))' 
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Conversion by Discount Type */}
            <Card>
              <CardHeader>
                <CardTitle>Conversion Rate by Discount Type</CardTitle>
                <CardDescription>Which discount types convert best</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Loading chart data...
                  </div>
                ) : (analytics.conversionByDiscount?.length || 0) === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No conversion data available yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.conversionByDiscount}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="discountType" className="text-muted-foreground" />
                      <YAxis className="text-muted-foreground" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))' 
                        }}
                        formatter={(value: any, name: string) => {
                          if (name === 'conversionRate') return [`${value}%`, 'Conversion Rate'];
                          return [value, name];
                        }}
                      />
                      <Bar dataKey="conversionRate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                        {analytics.conversionByDiscount?.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={`hsl(var(--primary) / ${0.5 + (index * 0.1)})`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top Performing Codes */}
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Codes</CardTitle>
                <CardDescription>Codes ranked by total signups</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Influencer</TableHead>
                        <TableHead>Signups</TableHead>
                        <TableHead>Active Subs</TableHead>
                        <TableHead>Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analyticsLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : (analytics.topCodes?.length || 0) === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                            No codes with signups yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        analytics.topCodes?.map((code: any, index: number) => (
                          <TableRow key={code.code} data-testid={`row-top-code-${index}`}>
                            <TableCell className="font-mono font-medium">{code.code}</TableCell>
                            <TableCell>{code.influencerName || '-'}</TableCell>
                            <TableCell>{code.totalSignups || 0}</TableCell>
                            <TableCell>{code.activeSubscribers || 0}</TableCell>
                            <TableCell>${code.totalRevenueGenerated}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
