import { useQuery } from "@tanstack/react-query";
import { SettingsLayout } from "./layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, CreditCard, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { isNativeApp } from "@/lib/capacitorAuth";

interface UserProfile {
  id: number;
  phoneNumber: string;
  username?: string;
  subscriptionType?: 'free' | 'free_trial' | 'monthly' | 'founding' | 'pro' | 'annual' | 'lifetime' | null;
  subscriptionStatus?: string;
  trialEndDate?: string;
}

export default function SubscriptionSettings() {
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/auth/me"],
  });

  if (isLoading) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </SettingsLayout>
    );
  }

  const subscriptionType = user?.subscriptionType || 'free';
  const subscriptionStatus = user?.subscriptionStatus || 'active';
  const trialEndDate = user?.trialEndDate;
  
  // Check if user has lifetime access
  const isLifetime = subscriptionType === 'lifetime';
  
  // Check if user is in trial period
  const isInTrial = !isLifetime && trialEndDate && new Date(trialEndDate) > new Date();
  const daysRemaining = trialEndDate 
    ? Math.ceil((new Date(trialEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      period: 'forever',
      features: [
        'Basic chat with Prof. OS',
        '5 video recommendations per day',
        'Community support',
      ],
      isCurrent: subscriptionType === 'free',
    },
    {
      id: 'monthly',
      name: isInTrial ? `Monthly (Trial - ${daysRemaining} days left)` : 'Monthly',
      price: '$30',
      period: 'per month',
      features: [
        'Unlimited AI coaching',
        'Unlimited video recommendations',
        'Full video library access',
        'Save favorite videos',
        'Priority support',
      ],
      isCurrent: subscriptionType === 'monthly',
    },
    {
      id: 'founding',
      name: 'Founding Member',
      price: '$89',
      period: 'per year',
      badge: 'Best Value',
      features: [
        'Unlimited AI coaching',
        'Unlimited video recommendations',
        'Voice input & output',
        'Priority support',
        'Early access to new features',
        'Lifetime discount locked in',
      ],
      isCurrent: subscriptionType === 'founding',
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$179',
      period: 'per year',
      features: [
        'Everything in Founding',
        'Advanced technique analysis',
        'Competition prep plans',
        'Personal training schedules',
        '1-on-1 strategy sessions (quarterly)',
      ],
      isCurrent: subscriptionType === 'pro',
    },
  ];

  const handleManageSubscription = () => {
    toast({
      title: "Coming Soon",
      description: "Subscription management will be available soon",
    });
  };

  return (
    <SettingsLayout>
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold mb-2">Subscription</h1>
        <p className="text-muted-foreground mb-6">
          Manage your subscription plan and billing
        </p>

        {/* Current Plan */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>
              {isLifetime ? (
                <span className="font-semibold text-primary flex items-center gap-2">
                  Lifetime Access ✓
                </span>
              ) : (
                <>You're currently on the <span className="font-semibold text-foreground">
                  {plans.find(p => p.isCurrent)?.name}
                </span> plan</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                {isLifetime ? (
                  <>
                    <p className="text-2xl font-bold text-primary">
                      Lifetime Access
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Status: <span className="text-green-600 font-medium">Active</span>
                    </p>
                    <p className="text-sm text-muted-foreground italic mt-2">
                      No subscription to manage - you own this forever!
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold">
                      {plans.find(p => p.isCurrent)?.price}
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        {plans.find(p => p.isCurrent)?.period}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {subscriptionType === 'free' || subscriptionType === 'free_trial' ? 'Upgrade anytime to unlock premium features' : 'Thank you for your support!'}
                    </p>
                  </>
                )}
              </div>
              {!isLifetime && subscriptionType !== 'free' && subscriptionType !== 'free_trial' && (
                <Button variant="outline" onClick={handleManageSubscription} data-testid="button-manage">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Manage Billing
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Available Plans - Hidden on native iOS app */}
        {isNativeApp() ? (
          <Card>
            <CardHeader>
              <CardTitle>Manage Subscription</CardTitle>
              <CardDescription>
                Subscription management is available on the web
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                To upgrade, change, or manage your subscription, please visit bjjos.app in your browser.
              </p>
              <div className="flex items-center gap-2 text-primary font-medium">
                <ExternalLink className="w-4 h-4" />
                <span>bjjos.app</span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Available Plans</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <Card 
                  key={plan.id} 
                  className={plan.isCurrent ? 'border-primary' : ''}
                  data-testid={`card-plan-${plan.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between mb-2">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      {plan.badge && (
                        <Badge variant="default" className="text-xs">
                          {plan.badge}
                        </Badge>
                      )}
                      {plan.isCurrent && (
                        <Badge variant="secondary" className="text-xs">
                          Current
                        </Badge>
                      )}
                    </div>
                    <div>
                      <span className="text-3xl font-bold">{plan.price}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {plan.period}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 mb-4">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {plan.isCurrent ? (
                      <Button className="w-full" disabled data-testid={`button-current-${plan.id}`}>
                        Current Plan
                      </Button>
                    ) : plan.id === 'free' ? (
                      <Button 
                        variant="outline" 
                        className="w-full" 
                        disabled
                        data-testid={`button-downgrade-${plan.id}`}
                      >
                        Downgrade
                      </Button>
                    ) : (
                      <Link href="/pricing">
                        <Button className="w-full" data-testid={`button-upgrade-${plan.id}`}>
                          {subscriptionType === 'free' ? 'Upgrade' : 'Switch Plan'}
                        </Button>
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}
