import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SettingsLayout } from "./layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Check, Users, Gift } from "lucide-react";

interface UserProfile {
  id: number;
  phoneNumber: string;
  username?: string;
}

interface ReferralData {
  referralCode: string;
  totalReferrals: number;
  activeReferrals: number;
  referrals: Array<{
    id: number;
    phoneNumber: string;
    username?: string;
    status: string;
    createdAt: string;
  }>;
}

export default function ReferralsSettings() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: userData, isLoading: userLoading } = useQuery<{ user: UserProfile }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: referralData, isLoading: referralLoading, error: referralError } = useQuery<ReferralData>({
    queryKey: ["/api/referrals/my-code"],
    enabled: !!userData?.user.id,
    retry: false,
  });

  const isLoading = userLoading || referralLoading;

  const handleCopyCode = () => {
    if (referralCode && referralCode !== 'N/A') {
      navigator.clipboard.writeText(referralCode);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Referral code copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = () => {
    if (referralCode && referralCode !== 'N/A') {
      const link = `${window.location.origin}/signup?ref=${referralCode}`;
      navigator.clipboard.writeText(link);
      toast({
        title: "Copied!",
        description: "Referral link copied to clipboard",
      });
    }
  };

  if (isLoading) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </SettingsLayout>
    );
  }

  const user = userData?.user;
  
  // Fallback to phone-based code if API not available
  const referralCode = referralData?.referralCode || user?.phoneNumber?.slice(-6) || 'N/A';
  const totalReferrals = referralData?.totalReferrals || 0;
  const activeReferrals = referralData?.activeReferrals || 0;
  
  // Check if referrals API is unavailable
  const isReferralApiUnavailable = referralError && !referralData;

  return (
    <SettingsLayout>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Referrals</h1>
        <p className="text-muted-foreground mb-6">
          Share BJJ OS with your training partners and earn rewards
        </p>

        {/* Referral Code */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Your Referral Code</CardTitle>
            <CardDescription>
              {isReferralApiUnavailable 
                ? "Referral program coming soon. Your temporary code is shown below."
                : "Share this code with friends to give them a discount and earn rewards"
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input 
                value={referralCode} 
                readOnly 
                className="font-mono text-lg"
                data-testid="input-referral-code"
              />
              <Button 
                onClick={handleCopyCode}
                variant="outline"
                data-testid="button-copy-code"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <Button 
              onClick={handleCopyLink} 
              variant="secondary" 
              className="w-full"
              data-testid="button-copy-link"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Referral Link
            </Button>
            {isReferralApiUnavailable && (
              <p className="text-xs text-muted-foreground">
                Referral tracking is being set up. Your code will work once the program launches.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-referrals">
                {totalReferrals}
              </div>
              <p className="text-xs text-muted-foreground">
                All-time sign-ups
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Referrals</CardTitle>
              <Gift className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-referrals">
                {activeReferrals}
              </div>
              <p className="text-xs text-muted-foreground">
                Currently subscribed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Rewards Info */}
        <Card>
          <CardHeader>
            <CardTitle>Referral Rewards</CardTitle>
            <CardDescription>
              Earn rewards when your friends join BJJ OS
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-1">
                  Friend
                </Badge>
                <div>
                  <p className="font-medium">10% off first year</p>
                  <p className="text-sm text-muted-foreground">
                    Your friend gets a discount on their subscription
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-1">
                  You
                </Badge>
                <div>
                  <p className="font-medium">1 month free per referral</p>
                  <p className="text-sm text-muted-foreground">
                    Earn free months when friends subscribe
                  </p>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Rewards are automatically applied to your account. Questions? Contact support.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}
