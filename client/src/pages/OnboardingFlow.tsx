import { useState } from 'react';
import { useLocation } from 'wouter';
import { isNativeApp } from "@/lib/capacitorAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function OnboardingFlow() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [data, setData] = useState({
    displayName: '',
    beltLevel: '',
    style: '',
    struggleAreaCategory: '',
    heightFeet: '',
    heightInches: '',
    weight: '',
    age: ''
  });
  
  const getHeightInInches = (): string | undefined => {
    const feet = parseInt(data.heightFeet) || 0;
    const inches = parseInt(data.heightInches) || 0;
    if (feet === 0 && inches === 0) return undefined;
    return String(feet * 12 + inches);
  };

  const struggles = [
    { value: 'guard_passing', label: 'Guard Passing' },
    { value: 'guard_retention', label: 'Guard Retention' },
    { value: 'submissions', label: 'Submissions from Top' },
    { value: 'escapes', label: 'Escapes from Bottom' },
    { value: 'takedowns', label: 'Takedowns' },
    { value: 'transitions', label: 'Position Transitions' },
    { value: 'other', label: 'Other' }
  ];

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      // Use existing profile endpoint with onboarding data
      await apiRequest('PATCH', '/api/auth/profile', {
        displayName: data.displayName,
        beltLevel: data.beltLevel,
        style: data.style,
        struggleAreaCategory: data.struggleAreaCategory,
        height: getHeightInInches(),
        weight: data.weight,
        age: data.age,
        onboardingCompleted: true  // Mark onboarding as complete
      });
      
      // Invalidate user profile cache (use /api/auth/me which is what the app uses)
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      
      toast({
        title: "Profile Complete!",
        description: "Professor OS is ready to coach you."
      });
      
      navigate(isNativeApp() ? '/ios-home' : '/chat');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save profile. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return data.displayName.trim().length > 0;
      case 2: return data.beltLevel.length > 0;
      case 3: return data.style.length > 0;
      case 4: return data.struggleAreaCategory.length > 0;
      case 5: return true; // Optional step
      default: return false;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <Card className="w-full max-w-xl border-primary/20 shadow-2xl">
        <CardContent className="p-8 md:p-12">
          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Step {step} of 5</span>
              <span className="text-sm text-muted-foreground">{Math.round((step / 5) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-purple-600 transition-all duration-300"
                style={{ width: `${(step / 5) * 100}%` }}
              />
            </div>
          </div>

          {/* Step 1: Name */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold">What's your name?</h1>
                <p className="text-muted-foreground">This helps Professor OS address you personally</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name">First Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your first name"
                  value={data.displayName}
                  onChange={(e) => setData({...data, displayName: e.target.value})}
                  onKeyPress={(e) => e.key === 'Enter' && canProceed() && setStep(2)}
                  autoFocus
                  className="text-lg h-12"
                  data-testid="input-name"
                />
              </div>

              <Button
                size="lg"
                onClick={() => setStep(2)}
                disabled={!canProceed()}
                className="w-full"
                data-testid="button-next-step-1"
              >
                Next <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

          {/* Step 2: Belt Level */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold">What's your belt level?</h1>
                <p className="text-muted-foreground">Helps us match techniques to your skill level</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'white', label: 'White', color: 'bg-white text-black hover:bg-gray-100' },
                  { value: 'blue', label: 'Blue', color: 'bg-blue-600 text-white hover:bg-blue-700' },
                  { value: 'purple', label: 'Purple', color: 'bg-purple-600 text-white hover:bg-purple-700' },
                  { value: 'brown', label: 'Brown', color: 'bg-amber-800 text-white hover:bg-amber-900' },
                  { value: 'black', label: 'Black', color: 'bg-black text-white hover:bg-gray-900 border-2 border-white/20' }
                ].map((belt) => (
                  <Button
                    key={belt.value}
                    variant={data.beltLevel === belt.value ? "default" : "outline"}
                    size="lg"
                    onClick={() => {
                      setData({...data, beltLevel: belt.value});
                      setTimeout(() => setStep(3), 200);
                    }}
                    className={`h-20 text-lg font-bold ${
                      data.beltLevel === belt.value 
                        ? 'ring-2 ring-primary ring-offset-2' 
                        : belt.color
                    }`}
                    data-testid={`button-belt-${belt.value}`}
                  >
                    {belt.label}
                  </Button>
                ))}
              </div>

              <Button
                variant="ghost"
                onClick={() => setStep(1)}
                className="w-full"
                data-testid="button-back-step-2"
              >
                <ArrowLeft className="mr-2 h-5 w-5" /> Back
              </Button>
            </div>
          )}

          {/* Step 3: Training Style */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold">How do you train?</h1>
                <p className="text-muted-foreground">We'll prioritize relevant content for you</p>
              </div>
              
              <div className="space-y-3">
                {[
                  { value: 'gi', label: 'Gi Only', desc: 'Traditional BJJ with the kimono' },
                  { value: 'nogi', label: 'No-Gi Only', desc: 'Grappling without the gi' },
                  { value: 'both', label: 'Both Gi & No-Gi', desc: 'I train in both styles' }
                ].map((style) => (
                  <Button
                    key={style.value}
                    variant={data.style === style.value ? "default" : "outline"}
                    size="lg"
                    onClick={() => {
                      setData({...data, style: style.value});
                      setTimeout(() => setStep(4), 200);
                    }}
                    className={`w-full h-auto py-4 flex flex-col items-start ${
                      data.style === style.value ? 'ring-2 ring-primary ring-offset-2' : ''
                    }`}
                    data-testid={`button-style-${style.value}`}
                  >
                    <span className="text-lg font-semibold">{style.label}</span>
                    <span className="text-sm text-muted-foreground">{style.desc}</span>
                  </Button>
                ))}
              </div>

              <Button
                variant="ghost"
                onClick={() => setStep(2)}
                className="w-full"
                data-testid="button-back-step-3"
              >
                <ArrowLeft className="mr-2 h-5 w-5" /> Back
              </Button>
            </div>
          )}

          {/* Step 4: Biggest Struggle */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold">What's your biggest struggle?</h1>
                <p className="text-muted-foreground">Professor OS will focus on helping you improve here</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="struggle">Select your main challenge</Label>
                <Select 
                  value={data.struggleAreaCategory} 
                  onValueChange={(value) => setData({...data, struggleAreaCategory: value})}
                >
                  <SelectTrigger className="h-12 text-lg" data-testid="select-struggle">
                    <SelectValue placeholder="Choose your biggest struggle..." />
                  </SelectTrigger>
                  <SelectContent>
                    {struggles.map((struggle) => (
                      <SelectItem 
                        key={struggle.value} 
                        value={struggle.value}
                        data-testid={`option-struggle-${struggle.value}`}
                      >
                        {struggle.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Button
                  size="lg"
                  onClick={() => setStep(5)}
                  disabled={!canProceed()}
                  className="w-full"
                  data-testid="button-next-step-4"
                >
                  Next <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                
                <Button
                  variant="ghost"
                  onClick={() => setStep(3)}
                  className="w-full"
                  data-testid="button-back-step-4"
                >
                  <ArrowLeft className="mr-2 h-5 w-5" /> Back
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Optional Details */}
          {step === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold">Help us personalize more</h1>
                <p className="text-muted-foreground">Optional - but helps Professor OS give better advice</p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Height (optional)</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input
                        id="height-feet"
                        type="number"
                        min="0"
                        max="8"
                        placeholder="5"
                        value={data.heightFeet}
                        onChange={(e) => setData({...data, heightFeet: e.target.value})}
                        className="h-11"
                        data-testid="input-height-feet"
                      />
                    </div>
                    <span className="text-muted-foreground font-medium">ft</span>
                    <div className="flex-1">
                      <Input
                        id="height-inches"
                        type="number"
                        min="0"
                        max="11"
                        placeholder="10"
                        value={data.heightInches}
                        onChange={(e) => setData({...data, heightInches: e.target.value})}
                        className="h-11"
                        data-testid="input-height-inches"
                      />
                    </div>
                    <span className="text-muted-foreground font-medium">in</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (optional)</Label>
                  <Input
                    id="weight"
                    type="text"
                    placeholder="e.g., 170 lbs or 77kg"
                    value={data.weight}
                    onChange={(e) => setData({...data, weight: e.target.value})}
                    className="h-11"
                    data-testid="input-weight"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="age">Age (optional)</Label>
                  <Input
                    id="age"
                    type="text"
                    placeholder="e.g., 32"
                    value={data.age}
                    onChange={(e) => setData({...data, age: e.target.value})}
                    className="h-11"
                    data-testid="input-age"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  size="lg"
                  onClick={handleComplete}
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                  data-testid="button-complete-onboarding"
                >
                  {isSubmitting ? 'Saving...' : 'Complete Setup'} <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                
                <Button
                  variant="ghost"
                  onClick={handleComplete}
                  disabled={isSubmitting}
                  className="w-full"
                  data-testid="button-skip-optional"
                >
                  Skip optional details
                </Button>
                
                <Button
                  variant="ghost"
                  onClick={() => setStep(4)}
                  disabled={isSubmitting}
                  className="w-full"
                  data-testid="button-back-step-5"
                >
                  <ArrowLeft className="mr-2 h-5 w-5" /> Back
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
