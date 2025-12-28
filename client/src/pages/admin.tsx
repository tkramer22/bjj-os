import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Plus, Power, PowerOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showBulkForm, setShowBulkForm] = useState(true);
  const { toast } = useToast();

  // Single code form
  const [singleCode, setSingleCode] = useState("");
  const [influencerName, setInfluencerName] = useState("");
  const [commissionRate, setCommissionRate] = useState("25");

  // Bulk form
  const [bulkCodes, setBulkCodes] = useState("");
  const [bulkCommissionRate, setBulkCommissionRate] = useState("25");

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/admin/login", { password });
      return res.json();
    },
    onSuccess: () => {
      setIsAuthenticated(true);
      toast({ title: "Login successful" });
    },
    onError: () => {
      toast({ title: "Invalid password", variant: "destructive" });
    },
  });

  // Get all codes
  const { data: codes, isLoading } = useQuery({
    queryKey: ["/api/admin/codes"],
    enabled: isAuthenticated,
  });

  // Create single code
  const createCodeMutation = useMutation({
    mutationFn: async (data: { code: string; influencerName: string; commissionRate: number }) => {
      const res = await apiRequest("POST", "/api/admin/codes/create", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/codes"] });
      setSingleCode("");
      setInfluencerName("");
      toast({ title: "Code created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error creating code", description: error.message, variant: "destructive" });
    },
  });

  // Create bulk codes
  const bulkCreateMutation = useMutation({
    mutationFn: async (data: { codes: string; commissionRate: number }) => {
      const res = await apiRequest("POST", "/api/admin/codes/bulk-create", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/codes"] });
      setBulkCodes("");
      toast({ title: `Created ${data.created} codes successfully` });
    },
    onError: (error: any) => {
      toast({ title: "Error creating codes", description: error.message, variant: "destructive" });
    },
  });

  // Toggle code status
  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/codes/${id}/toggle`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/codes"] });
    },
  });

  // Mark as paid
  const markPaidMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/mark-paid", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/codes"] });
      toast({ title: "All codes marked as paid" });
    },
  });

  // Export CSV
  const handleExportCSV = () => {
    window.open("/api/admin/export-csv", "_blank");
  };

  // Handle form submissions
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(password);
  };

  const handleSingleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCodeMutation.mutate({
      code: singleCode,
      influencerName,
      commissionRate: parseFloat(commissionRate) / 100,
    });
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    bulkCreateMutation.mutate({
      codes: bulkCodes,
      commissionRate: parseFloat(bulkCommissionRate) / 100,
    });
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>Enter admin password to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" data-testid="label-password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  data-testid="input-password"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? "Logging in..." : "Login"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Dashboard
  const influencerCodes = (codes as any[])?.filter((c: any) => c.codeType === "influencer") || [];
  const totalRevenue = influencerCodes.reduce((sum: number, code: any) => {
    return sum + (code.activeSubscribers || 0) * 3.99;
  }, 0);
  const totalCommissionOwed = influencerCodes.reduce((sum: number, code: any) => {
    return sum + parseFloat(code.commissionOwed || "0");
  }, 0);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-admin-title">Influencer Dashboard</h1>
            <p className="text-muted-foreground">Manage referral codes and track commissions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV} data-testid="button-export-csv">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={() => markPaidMutation.mutate()} data-testid="button-mark-paid">
              Mark All As Paid
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Active Subscribers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-subs">
                {influencerCodes.reduce((sum: number, c: any) => sum + (c.activeSubscribers || 0), 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-monthly-revenue">
                ${totalRevenue.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Commission Owed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-commission-owed">
                ${totalCommissionOwed.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 1: Generate Codes */}
        <Card>
          <CardHeader>
            <CardTitle>Generate Influencer Codes</CardTitle>
            <CardDescription>Create new referral codes for influencers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <Button
                variant={showBulkForm ? "default" : "outline"}
                onClick={() => setShowBulkForm(true)}
                data-testid="button-toggle-bulk"
              >
                Bulk Generate
              </Button>
              <Button
                variant={!showBulkForm ? "default" : "outline"}
                onClick={() => setShowBulkForm(false)}
                data-testid="button-toggle-single"
              >
                Single Code
              </Button>
            </div>

            {showBulkForm ? (
              <form onSubmit={handleBulkSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bulk-codes" data-testid="label-bulk-codes">Influencer Codes (one per line)</Label>
                  <Textarea
                    id="bulk-codes"
                    value={bulkCodes}
                    onChange={(e) => setBulkCodes(e.target.value)}
                    placeholder="GORDONRYAN&#10;LACHLAN&#10;BERNARDO&#10;CRAIGJONESBJJ"
                    rows={6}
                    data-testid="input-bulk-codes"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulk-commission" data-testid="label-bulk-commission">Commission Rate (%)</Label>
                  <Input
                    id="bulk-commission"
                    type="number"
                    value={bulkCommissionRate}
                    onChange={(e) => setBulkCommissionRate(e.target.value)}
                    placeholder="25"
                    data-testid="input-bulk-commission"
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={bulkCreateMutation.isPending}
                  data-testid="button-bulk-generate"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {bulkCreateMutation.isPending ? "Generating..." : "Generate All Codes"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSingleCodeSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code" data-testid="label-single-code">Code</Label>
                  <Input
                    id="code"
                    value={singleCode}
                    onChange={(e) => setSingleCode(e.target.value)}
                    placeholder="GORDONRYAN"
                    data-testid="input-single-code"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="influencer" data-testid="label-influencer-name">Influencer Name</Label>
                  <Input
                    id="influencer"
                    value={influencerName}
                    onChange={(e) => setInfluencerName(e.target.value)}
                    placeholder="Gordon Ryan"
                    data-testid="input-influencer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commission" data-testid="label-single-commission">Commission Rate (%)</Label>
                  <Input
                    id="commission"
                    type="number"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    placeholder="25"
                    data-testid="input-single-commission"
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={createCodeMutation.isPending}
                  data-testid="button-single-generate"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {createCodeMutation.isPending ? "Creating..." : "Generate Code"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Section 2: Performance Dashboard */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Dashboard</CardTitle>
            <CardDescription>Track influencer code performance and commissions</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading codes...</div>
            ) : influencerCodes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No influencer codes yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Influencer</TableHead>
                    <TableHead>Total Signups</TableHead>
                    <TableHead>Active Subs</TableHead>
                    <TableHead>Monthly Revenue</TableHead>
                    <TableHead>Commission Rate</TableHead>
                    <TableHead>Commission Owed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {influencerCodes.map((code: any) => {
                    const monthlyRevenue = (code.activeSubscribers || 0) * 3.99;
                    const commissionRate = parseFloat(code.commissionRate || "0");
                    const commissionOwed = monthlyRevenue * commissionRate;

                    return (
                      <TableRow key={code.id} data-testid={`row-code-${code.code}`}>
                        <TableCell className="font-mono" data-testid={`text-code-${code.code}`}>
                          {code.code}
                        </TableCell>
                        <TableCell data-testid={`text-influencer-${code.code}`}>
                          {code.influencerName || code.code}
                        </TableCell>
                        <TableCell data-testid={`text-signups-${code.code}`}>
                          {code.totalSignups || 0}
                        </TableCell>
                        <TableCell data-testid={`text-active-subs-${code.code}`}>
                          {code.activeSubscribers || 0}
                        </TableCell>
                        <TableCell data-testid={`text-revenue-${code.code}`}>
                          ${monthlyRevenue.toFixed(2)}
                        </TableCell>
                        <TableCell data-testid={`text-rate-${code.code}`}>
                          {(commissionRate * 100).toFixed(0)}%
                        </TableCell>
                        <TableCell className="font-semibold" data-testid={`text-owed-${code.code}`}>
                          ${commissionOwed.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={code.isActive ? "default" : "secondary"}
                            data-testid={`badge-status-${code.code}`}
                          >
                            {code.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleMutation.mutate(code.id)}
                            data-testid={`button-toggle-${code.code}`}
                          >
                            {code.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
