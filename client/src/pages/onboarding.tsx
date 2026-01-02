import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { BeltIcon } from "@/components/BeltIcon";
import { BJJButton } from "@/components/ui/bjj-button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

type OnboardingStep = "name" | "belt" | "style" | "body";
type BeltLevel = "white" | "blue" | "purple" | "brown" | "black";
type TrainingStyle = "gi" | "nogi" | "both";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<OnboardingStep>("name");
  const [isLoading, setIsLoading] = useState(false);

  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  useEffect(() => {
    if (user && user.onboardingCompleted) {
      console.log('[ONBOARDING] User already completed onboarding, redirecting to /chat');
      setLocation("/chat");
    }
  }, [user, setLocation]);

  const [name, setName] = useState("");
  const [beltLevel, setBeltLevel] = useState<BeltLevel | null>(null);
  const [trainingStyle, setTrainingStyle] = useState<TrainingStyle | null>(null);
  const [heightFeet, setHeightFeet] = useState(5);
  const [heightInches, setHeightInches] = useState(9);
  const [heightCm, setHeightCm] = useState(175);
  const [weight, setWeight] = useState(170);
  const [useMetric, setUseMetric] = useState(false);

  const getStepNumber = () => {
    switch (step) {
      case "name": return 1;
      case "belt": return 2;
      case "style": return 3;
      case "body": return 4;
      default: return 1;
    }
  };

  const handleNameSubmit = () => {
    if (!name.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter your first name",
        variant: "destructive",
      });
      return;
    }
    setStep("belt");
  };

  const handleBeltSubmit = () => {
    if (!beltLevel) {
      toast({
        title: "Selection Required",
        description: "Please select your current belt level",
        variant: "destructive",
      });
      return;
    }
    setStep("style");
  };

  const handleStyleSubmit = () => {
    if (!trainingStyle) {
      toast({
        title: "Selection Required",
        description: "Please select your training style",
        variant: "destructive",
      });
      return;
    }
    setStep("body");
  };

  const handleComplete = async () => {
    setIsLoading(true);

    const heightString = useMetric 
      ? `${heightCm}cm` 
      : `${heightFeet}'${heightInches}"`;

    try {
      console.log('[ONBOARDING] Submitting simplified data:', {
        displayName: name.trim(),
        beltLevel,
        style: trainingStyle,
        height: heightString,
        weight,
        unitPreference: useMetric ? 'metric' : 'imperial',
      });

      await apiRequest("PATCH", "/api/auth/profile", {
        displayName: name.trim(),
        beltLevel,
        style: trainingStyle,
        height: heightString,
        weight,
        unitPreference: useMetric ? 'metric' : 'imperial',
        onboardingCompleted: true,
      });

      console.log('[ONBOARDING] Profile updated, invalidating cache...');
      
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });

      toast({
        title: "Profile Complete!",
        description: "Moving to payment setup...",
      });

      setLocation("/payment");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save preferences",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "belt") setStep("name");
    else if (step === "style") setStep("belt");
    else if (step === "body") setStep("style");
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-container">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-6">
            <BeltIcon className="w-16 h-16" />
          </div>
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-[hsl(var(--bjj-primary-purple))] to-[hsl(var(--bjj-primary-blue))] bg-clip-text text-transparent">
            Welcome to BJJ OS
          </h1>
          <p className="text-[hsl(var(--bjj-text-secondary))] text-lg">
            Let's get you set up in under a minute
          </p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[hsl(var(--bjj-text-secondary))]">
              Step {getStepNumber()} of 4
            </span>
            <span className="text-sm text-[hsl(var(--bjj-text-secondary))]">
              {Math.round((getStepNumber() / 4) * 100)}% complete
            </span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden" data-testid="progress-bar">
            <div
              className="h-full bg-gradient-to-r from-[hsl(var(--bjj-primary-purple))] to-[hsl(var(--bjj-primary-blue))] transition-all duration-300"
              style={{ width: `${(getStepNumber() / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1: Name */}
        {step === "name" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              What's your name?
            </h2>
            <p className="text-[hsl(var(--bjj-text-secondary))] mb-6">
              How should Professor OS address you?
            </p>
            <Input
              type="text"
              placeholder="Enter your first name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit()}
              autoFocus
              className="mb-6 bg-black/50 border-white/10 text-white placeholder:text-white/40"
              data-testid="input-name"
            />
            <BJJButton
              onClick={handleNameSubmit}
              disabled={!name.trim()}
              className="w-full"
              data-testid="button-next-name"
            >
              Continue
            </BJJButton>
          </div>
        )}

        {/* Step 2: Belt Level */}
        {step === "belt" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              What's your belt?
            </h2>
            <p className="text-[hsl(var(--bjj-text-secondary))] mb-6">
              Select your current rank
            </p>
            <div className="grid grid-cols-1 gap-3 mb-6">
              {(["white", "blue", "purple", "brown", "black"] as BeltLevel[]).map((belt) => (
                <button
                  key={belt}
                  onClick={() => setBeltLevel(belt)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    beltLevel === belt
                      ? "border-[hsl(var(--bjj-primary-purple))] bg-[hsl(var(--bjj-primary-purple))]/10"
                      : "border-white/10 bg-black/30 hover:border-white/20"
                  }`}
                  data-testid={`button-belt-${belt}`}
                >
                  <span className="text-white font-medium capitalize">{belt} Belt</span>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <BJJButton
                variant="outline"
                onClick={handleBack}
                data-testid="button-back"
              >
                Back
              </BJJButton>
              <BJJButton
                onClick={handleBeltSubmit}
                disabled={!beltLevel}
                className="flex-1"
                data-testid="button-next-belt"
              >
                Continue
              </BJJButton>
            </div>
          </div>
        )}

        {/* Step 3: Training Style */}
        {step === "style" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              What do you train?
            </h2>
            <p className="text-[hsl(var(--bjj-text-secondary))] mb-6">
              Choose your training focus
            </p>
            <div className="grid grid-cols-1 gap-3 mb-6">
              {(["gi", "nogi", "both"] as TrainingStyle[]).map((style) => (
                <button
                  key={style}
                  onClick={() => setTrainingStyle(style)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    trainingStyle === style
                      ? "border-[hsl(var(--bjj-primary-purple))] bg-[hsl(var(--bjj-primary-purple))]/10"
                      : "border-white/10 bg-black/30 hover:border-white/20"
                  }`}
                  data-testid={`button-style-${style}`}
                >
                  <span className="text-white font-medium">
                    {style === "gi" ? "Gi" : style === "nogi" ? "No-Gi" : "Both"}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <BJJButton
                variant="outline"
                onClick={handleBack}
                data-testid="button-back"
              >
                Back
              </BJJButton>
              <BJJButton
                onClick={handleStyleSubmit}
                disabled={!trainingStyle}
                className="flex-1"
                data-testid="button-next-style"
              >
                Continue
              </BJJButton>
            </div>
          </div>
        )}

        {/* Step 4: Height & Weight */}
        {step === "body" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              Height & Weight
            </h2>
            <p className="text-[hsl(var(--bjj-text-secondary))] mb-6">
              Helps Professor OS recommend techniques for your body type
            </p>

            {/* Unit toggle */}
            <div className="flex justify-center gap-2 mb-6">
              <button
                onClick={() => setUseMetric(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  !useMetric
                    ? "bg-[hsl(var(--bjj-primary-purple))] text-white"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
                data-testid="button-imperial"
              >
                Imperial
              </button>
              <button
                onClick={() => setUseMetric(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  useMetric
                    ? "bg-[hsl(var(--bjj-primary-purple))] text-white"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
                data-testid="button-metric"
              >
                Metric
              </button>
            </div>

            {/* Height */}
            <div className="mb-6">
              <label className="block text-white/80 mb-2 text-sm">Height</label>
              {useMetric ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={heightCm}
                    onChange={(e) => setHeightCm(parseInt(e.target.value) || 0)}
                    className="w-24 bg-black/50 border-white/10 text-white text-center"
                    min={100}
                    max={250}
                    data-testid="input-height-cm"
                  />
                  <span className="text-white/60">cm</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={heightFeet}
                    onChange={(e) => setHeightFeet(parseInt(e.target.value) || 0)}
                    className="w-16 bg-black/50 border-white/10 text-white text-center"
                    min={4}
                    max={7}
                    data-testid="input-height-feet"
                  />
                  <span className="text-white/60">ft</span>
                  <Input
                    type="number"
                    value={heightInches}
                    onChange={(e) => setHeightInches(parseInt(e.target.value) || 0)}
                    className="w-16 bg-black/50 border-white/10 text-white text-center"
                    min={0}
                    max={11}
                    data-testid="input-height-inches"
                  />
                  <span className="text-white/60">in</span>
                </div>
              )}
            </div>

            {/* Weight */}
            <div className="mb-6">
              <label className="block text-white/80 mb-2 text-sm">Weight</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(parseInt(e.target.value) || 0)}
                  className="w-24 bg-black/50 border-white/10 text-white text-center"
                  min={useMetric ? 40 : 90}
                  max={useMetric ? 200 : 400}
                  data-testid="input-weight"
                />
                <span className="text-white/60">{useMetric ? "kg" : "lbs"}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <BJJButton
                variant="outline"
                onClick={handleBack}
                disabled={isLoading}
                data-testid="button-back"
              >
                Back
              </BJJButton>
              <BJJButton
                onClick={handleComplete}
                disabled={isLoading}
                className="flex-1"
                data-testid="button-complete"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Get Started"
                )}
              </BJJButton>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .onboarding-page {
          min-height: 100vh;
          background: radial-gradient(circle at 50% 0%, #0A0812 0%, #15111F 50%, #0A0812 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
        }

        .onboarding-container {
          width: 100%;
          max-width: 600px;
        }

        .onboarding-step {
          background: rgba(15, 15, 15, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 32px;
        }

        @media (max-width: 768px) {
          .onboarding-page {
            padding: 20px;
          }

          .onboarding-step {
            padding: 24px;
          }
        }
      `}</style>
    </div>
  );
}
