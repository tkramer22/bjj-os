import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { BeltIcon } from "@/components/BeltIcon";
import { BJJButton } from "@/components/ui/bjj-button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Check, Loader2 } from "lucide-react";

type OnboardingStep = "name" | "username" | "belt" | "years" | "frequency" | "struggle" | "style";
type BeltLevel = "white" | "blue" | "purple" | "brown" | "black";
type TrainingStyle = "gi" | "nogi" | "both";
type YearsTraining = "<6mo" | "6mo-1yr" | "1-2yr" | "2-5yr" | "5-10yr" | "10+yr";
type TrainingFrequency = "1-2x" | "3-4x" | "5+x";
type StruggleArea = "guard_passing" | "guard_retention" | "takedowns" | "submissions" | "escapes" | "transitions" | "other";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<OnboardingStep>("name");
  const [isLoading, setIsLoading] = useState(false);

  // Check if user already completed onboarding
  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  // Redirect to chat if onboarding already completed
  useEffect(() => {
    if (user && user.onboardingCompleted) {
      console.log('[ONBOARDING] User already completed onboarding, redirecting to /chat');
      setLocation("/chat");
    }
  }, [user, setLocation]);

  // Onboarding data
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [beltLevel, setBeltLevel] = useState<BeltLevel | null>(null);
  const [yearsTraining, setYearsTraining] = useState<YearsTraining | null>(null);
  const [trainingFrequency, setTrainingFrequency] = useState<TrainingFrequency | null>(null);
  const [struggleArea, setStruggleArea] = useState<StruggleArea | null>(null);
  const [trainingStyle, setTrainingStyle] = useState<TrainingStyle | null>(null);

  const getStepNumber = () => {
    switch (step) {
      case "name": return 1;
      case "username": return 2;
      case "belt": return 3;
      case "years": return 4;
      case "frequency": return 5;
      case "struggle": return 6;
      case "style": return 7;
      default: return 1;
    }
  };

  // Check username availability
  const checkUsername = async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    setCheckingUsername(true);
    try {
      const response = await apiRequest("GET", `/api/auth/check-username?username=${encodeURIComponent(value)}`);
      const data = await response.json();
      setUsernameAvailable(data.available);
    } catch {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  };

  // Debounced username check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (username) {
        checkUsername(username);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [username]);

  const handleNameSubmit = () => {
    if (!name.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter your first name",
        variant: "destructive",
      });
      return;
    }
    setStep("username");
  };

  const handleUsernameSubmit = () => {
    if (!username.trim()) {
      toast({
        title: "Username Required",
        description: "Please enter a username",
        variant: "destructive",
      });
      return;
    }
    if (username.length < 3) {
      toast({
        title: "Username Too Short",
        description: "Username must be at least 3 characters",
        variant: "destructive",
      });
      return;
    }
    if (!usernameAvailable) {
      toast({
        title: "Username Unavailable",
        description: "This username is already taken",
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
    setStep("years");
  };

  const handleYearsSubmit = () => {
    if (!yearsTraining) {
      toast({
        title: "Selection Required",
        description: "Please select how long you've been training",
        variant: "destructive",
      });
      return;
    }
    setStep("frequency");
  };

  const handleFrequencySubmit = () => {
    if (!trainingFrequency) {
      toast({
        title: "Selection Required",
        description: "Please select how often you train",
        variant: "destructive",
      });
      return;
    }
    setStep("struggle");
  };

  const handleStruggleSubmit = () => {
    if (!struggleArea) {
      toast({
        title: "Selection Required",
        description: "Please select what you struggle with most",
        variant: "destructive",
      });
      return;
    }
    setStep("style");
  };

  const handleStyleSubmit = async () => {
    if (!trainingStyle) {
      toast({
        title: "Selection Required",
        description: "Please select your training style",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log('[ONBOARDING] Submitting data:', {
        displayName: name.trim(),
        username: username.trim(),
        beltLevel,
        yearsTrainingRange: yearsTraining,
        trainingFrequencyText: trainingFrequency,
        struggleAreaCategory: struggleArea,
        style: trainingStyle,
      });

      await apiRequest("PATCH", "/api/auth/profile", {
        displayName: name.trim(),
        username: username.trim(),
        beltLevel,
        yearsTrainingRange: yearsTraining,
        trainingFrequencyText: trainingFrequency,
        struggleAreaCategory: struggleArea,
        style: trainingStyle,
        onboardingCompleted: true,
      });

      console.log('[ONBOARDING] Profile updated, invalidating cache and refetching...');
      
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
      
      console.log('[ONBOARDING] Cache refreshed, user data now has onboardingCompleted=true');

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
    if (step === "username") setStep("name");
    else if (step === "belt") setStep("username");
    else if (step === "years") setStep("belt");
    else if (step === "frequency") setStep("years");
    else if (step === "struggle") setStep("frequency");
    else if (step === "style") setStep("struggle");
  };

  const struggleOptions: { value: StruggleArea; label: string }[] = [
    { value: "guard_passing", label: "Guard Passing" },
    { value: "guard_retention", label: "Guard Retention" },
    { value: "takedowns", label: "Takedowns" },
    { value: "submissions", label: "Submissions" },
    { value: "escapes", label: "Escapes" },
    { value: "transitions", label: "Transitions" },
    { value: "other", label: "Other" },
  ];

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
            Let's personalize your training experience
          </p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[hsl(var(--bjj-text-secondary))]">
              Step {getStepNumber()} of 7
            </span>
            <span className="text-sm text-[hsl(var(--bjj-text-secondary))]">
              {Math.round((getStepNumber() / 7) * 100)}% complete
            </span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden" data-testid="progress-bar">
            <div
              className="h-full bg-gradient-to-r from-[hsl(var(--bjj-primary-purple))] to-[hsl(var(--bjj-primary-blue))] transition-all duration-300"
              style={{ width: `${(getStepNumber() / 7) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1: First Name */}
        {step === "name" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              What's your first name?
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

        {/* Step 2: Username */}
        {step === "username" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              Choose a username
            </h2>
            <p className="text-[hsl(var(--bjj-text-secondary))] mb-6">
              Lowercase letters, numbers, and underscores only
            </p>
            <div className="relative mb-6">
              <Input
                type="text"
                placeholder="e.g., blackbelt123"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                onKeyPress={(e) => e.key === 'Enter' && handleUsernameSubmit()}
                autoFocus
                className="bg-black/50 border-white/10 text-white placeholder:text-white/40 pr-10"
                data-testid="input-username"
              />
              {checkingUsername && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 animate-spin" />
              )}
              {!checkingUsername && usernameAvailable === true && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" data-testid="icon-username-available" />
              )}
              {!checkingUsername && usernameAvailable === false && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 font-bold" data-testid="icon-username-taken">✕</span>
              )}
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
                onClick={handleUsernameSubmit}
                disabled={!username.trim() || !usernameAvailable}
                className="flex-1"
                data-testid="button-next-username"
              >
                Continue
              </BJJButton>
            </div>
          </div>
        )}

        {/* Step 3: Belt Level */}
        {step === "belt" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              What belt are you?
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

        {/* Step 4: Years Training */}
        {step === "years" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              How long have you been training?
            </h2>
            <p className="text-[hsl(var(--bjj-text-secondary))] mb-6">
              Select your training experience
            </p>
            <div className="grid grid-cols-1 gap-3 mb-6">
              {(["<6mo", "6mo-1yr", "1-2yr", "2-5yr", "5-10yr", "10+yr"] as YearsTraining[]).map((years) => (
                <button
                  key={years}
                  onClick={() => setYearsTraining(years)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    yearsTraining === years
                      ? "border-[hsl(var(--bjj-primary-purple))] bg-[hsl(var(--bjj-primary-purple))]/10"
                      : "border-white/10 bg-black/30 hover:border-white/20"
                  }`}
                  data-testid={`button-years-${years}`}
                >
                  <span className="text-white font-medium">{years}</span>
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
                onClick={handleYearsSubmit}
                disabled={!yearsTraining}
                className="flex-1"
                data-testid="button-next-years"
              >
                Continue
              </BJJButton>
            </div>
          </div>
        )}

        {/* Step 5: Training Frequency */}
        {step === "frequency" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              How often do you train?
            </h2>
            <p className="text-[hsl(var(--bjj-text-secondary))] mb-6">
              Times per week
            </p>
            <div className="grid grid-cols-1 gap-3 mb-6">
              {(["1-2x", "3-4x", "5+x"] as TrainingFrequency[]).map((freq) => (
                <button
                  key={freq}
                  onClick={() => setTrainingFrequency(freq)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    trainingFrequency === freq
                      ? "border-[hsl(var(--bjj-primary-purple))] bg-[hsl(var(--bjj-primary-purple))]/10"
                      : "border-white/10 bg-black/30 hover:border-white/20"
                  }`}
                  data-testid={`button-frequency-${freq}`}
                >
                  <span className="text-white font-medium">{freq} per week</span>
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
                onClick={handleFrequencySubmit}
                disabled={!trainingFrequency}
                className="flex-1"
                data-testid="button-next-frequency"
              >
                Continue
              </BJJButton>
            </div>
          </div>
        )}

        {/* Step 6: Struggle Area */}
        {step === "struggle" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              What technique do you struggle with most?
            </h2>
            <p className="text-[hsl(var(--bjj-text-secondary))] mb-6">
              This helps Professor OS give you personalized guidance
            </p>
            <div className="grid grid-cols-1 gap-3 mb-6">
              {struggleOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setStruggleArea(option.value)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    struggleArea === option.value
                      ? "border-[hsl(var(--bjj-primary-purple))] bg-[hsl(var(--bjj-primary-purple))]/10"
                      : "border-white/10 bg-black/30 hover:border-white/20"
                  }`}
                  data-testid={`button-struggle-${option.value}`}
                >
                  <span className="text-white font-medium">{option.label}</span>
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
                onClick={handleStruggleSubmit}
                disabled={!struggleArea}
                className="flex-1"
                data-testid="button-next-struggle"
              >
                Continue
              </BJJButton>
            </div>
          </div>
        )}

        {/* Step 7: Training Style */}
        {step === "style" && (
          <div className="onboarding-step">
            <h2 className="text-2xl font-bold mb-2 text-white">
              What do you primarily train?
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
                  <span className="text-white font-medium capitalize">
                    {style === "gi" ? "Gi" : style === "nogi" ? "No-Gi" : "Both"}
                  </span>
                </button>
              ))}
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
                onClick={handleStyleSubmit}
                disabled={!trainingStyle || isLoading}
                className="flex-1"
                data-testid="button-complete"
              >
                {isLoading ? "Saving..." : "Complete Setup"}
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
