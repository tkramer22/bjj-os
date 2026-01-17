import { useLocation } from 'wouter';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";

export default function WelcomeLifetime() {
  const [, navigate] = useLocation();
  
  const benefits = [
    "Unlimited Professor OS conversations",
    "Complete curated video library (4,500+ techniques)",
    "Personalized recommendations for your game",
    "Training session tracking & progress",
    "All future features & updates",
    "Priority support"
  ];
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <Card className="w-full max-w-2xl border-primary/20 shadow-2xl">
        <CardContent className="p-8 md:p-12">
          {/* Header */}
          <div className="text-center space-y-6 mb-8">
            <div className="flex justify-center">
              <Sparkles className="h-16 w-16 text-primary animate-pulse" />
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Welcome to BJJ OS! 🎉
            </h1>
            
            <div className="flex justify-center">
              <Badge 
                variant="default" 
                className="px-6 py-2 text-sm font-semibold tracking-wider bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
              >
                LIFETIME ACCESS
              </Badge>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-semibold text-center mb-6">
              Your lifetime membership includes:
            </h2>
            
            <div className="space-y-3">
              {benefits.map((benefit, index) => (
                <div 
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg hover-elevate border border-border/50"
                  data-testid={`benefit-item-${index}`}
                >
                  <div className="mt-0.5 shrink-0">
                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-primary" />
                    </div>
                  </div>
                  <p className="text-base text-foreground">{benefit}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-center text-lg font-semibold text-primary">
                No expiration. No monthly fees. Ever.
              </p>
            </div>
          </div>

          {/* CTA Button */}
          <div className="flex justify-center pt-4">
            <Button
              size="lg"
              onClick={() => navigate('/onboarding')}
              className="px-12 py-6 text-lg font-semibold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
              data-testid="button-start-training"
            >
              Continue →
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
