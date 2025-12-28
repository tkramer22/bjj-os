import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Trophy, Dumbbell, Shield, Users, Circle } from "lucide-react";
import { isNativeApp } from "@/lib/capacitorAuth";
import { Preferences } from '@capacitor/preferences';

export default function MobileOnboardingPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    beltLevel: "",
    goals: [] as string[],
    experience: "",
  });

  const beltLevels = [
    { value: "white", label: "White Belt", color: "#ffffff" },
    { value: "blue", label: "Blue Belt", color: "#3b82f6" },
    { value: "purple", label: "Purple Belt", color: "#a855f7" },
    { value: "brown", label: "Brown Belt", color: "#92400e" },
    { value: "black", label: "Black Belt", color: "#000000" },
  ];

  const goals = [
    { value: "competition", label: "Competition", icon: "Trophy" },
    { value: "fitness", label: "Fitness", icon: "Dumbbell" },
    { value: "self-defense", label: "Self Defense", icon: "Shield" },
    { value: "fun", label: "Fun & Social", icon: "Users" },
  ];

  const handleComplete = async () => {
    const userId = localStorage.getItem('mobileUserId') || '1';
    localStorage.setItem('mobileUserId', userId);
    localStorage.setItem('mobileUserData', JSON.stringify(formData));
    
    // On native, save to Preferences for persistent auth
    if (isNativeApp()) {
      await Preferences.set({ key: 'mobileUserId', value: userId });
      // Navigate directly to iOS chat on native (no page reload needed)
      setLocation('/ios-chat');
    } else {
      // Force page reload to re-check authentication on web
      window.location.href = '/chat';
    }
  };

  const toggleGoal = (goal: string) => {
    setFormData(prev => ({
      ...prev,
      goals: prev.goals.includes(goal)
        ? prev.goals.filter(g => g !== goal)
        : [...prev.goals, goal]
    }));
  };

  return (
    <div className="mobile-app">
      <div 
        className="mobile-container" 
        style={{ 
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center"
        }}
      >
        {/* Progress */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ 
            display: "flex", 
            gap: "0.5rem",
            marginBottom: "1rem"
          }}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: "4px",
                  borderRadius: "2px",
                  background: s <= step 
                    ? "var(--mobile-primary-purple)" 
                    : "var(--mobile-border-gray)"
                }}
              />
            ))}
          </div>
          <p style={{ 
            fontSize: "0.875rem", 
            color: "var(--mobile-text-secondary)" 
          }}>
            Step {step} of 3
          </p>
        </div>

        {/* Step 1: Belt Level */}
        {step === 1 && (
          <div className="mobile-animate-slide-in">
            <h1 style={{ 
              fontSize: "2rem", 
              marginBottom: "0.5rem" 
            }}>
              Welcome to BJJ OS
            </h1>
            <p style={{ 
              fontSize: "1rem", 
              color: "var(--mobile-text-secondary)",
              marginBottom: "2rem"
            }}>
              What's your current belt level?
            </p>

            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "0.75rem" 
            }}>
              {beltLevels.map((belt) => (
                <button
                  key={belt.value}
                  onClick={() => {
                    setFormData({ ...formData, beltLevel: belt.value });
                    setStep(2);
                  }}
                  style={{
                    padding: "1.25rem",
                    background: formData.beltLevel === belt.value
                      ? "var(--mobile-primary-gradient)"
                      : "var(--mobile-dark-gray)",
                    borderRadius: "var(--mobile-radius-lg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "1rem"
                  }}
                  data-testid={`belt-${belt.value}`}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <Circle 
                      size={24} 
                      fill={belt.color} 
                      color={belt.color}
                      style={{ flexShrink: 0 }}
                    />
                    <span>{belt.label}</span>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Goals */}
        {step === 2 && (
          <div className="mobile-animate-slide-in">
            <h1 style={{ 
              fontSize: "2rem", 
              marginBottom: "0.5rem" 
            }}>
              What are your goals?
            </h1>
            <p style={{ 
              fontSize: "1rem", 
              color: "var(--mobile-text-secondary)",
              marginBottom: "2rem"
            }}>
              Select all that apply
            </p>

            <div style={{ 
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "0.75rem",
              marginBottom: "2rem"
            }}>
              {goals.map((goal) => {
                const iconMap = { Trophy, Dumbbell, Shield, Users };
                const IconComponent = iconMap[goal.icon as keyof typeof iconMap];
                return (
                  <button
                    key={goal.value}
                    onClick={() => toggleGoal(goal.value)}
                    style={{
                      padding: "1.25rem",
                      background: formData.goals.includes(goal.value)
                        ? "var(--mobile-primary-gradient)"
                        : "var(--mobile-dark-gray)",
                      borderRadius: "var(--mobile-radius-lg)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.875rem"
                    }}
                    data-testid={`goal-${goal.value}`}
                  >
                    <IconComponent size={32} />
                    <span>{goal.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setStep(3)}
              className="mobile-btn-primary"
              disabled={formData.goals.length === 0}
              style={{ width: "100%" }}
              data-testid="button-next-step"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 3: Experience */}
        {step === 3 && (
          <div className="mobile-animate-slide-in">
            <h1 style={{ 
              fontSize: "2rem", 
              marginBottom: "0.5rem" 
            }}>
              How long have you been training?
            </h1>
            <p style={{ 
              fontSize: "1rem", 
              color: "var(--mobile-text-secondary)",
              marginBottom: "2rem"
            }}>
              This helps us personalize your experience
            </p>

            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "0.75rem",
              marginBottom: "2rem"
            }}>
              {[
                { value: "beginner", label: "Less than 6 months" },
                { value: "intermediate", label: "6 months - 2 years" },
                { value: "advanced", label: "2-5 years" },
                { value: "expert", label: "5+ years" },
              ].map((exp) => (
                <button
                  key={exp.value}
                  onClick={() => setFormData({ ...formData, experience: exp.value })}
                  style={{
                    padding: "1.25rem",
                    background: formData.experience === exp.value
                      ? "var(--mobile-primary-gradient)"
                      : "var(--mobile-dark-gray)",
                    borderRadius: "var(--mobile-radius-lg)",
                    textAlign: "left",
                    fontSize: "1rem"
                  }}
                  data-testid={`experience-${exp.value}`}
                >
                  {exp.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleComplete}
              className="mobile-btn-primary"
              disabled={!formData.experience}
              style={{ width: "100%" }}
              data-testid="button-complete-onboarding"
            >
              Get Started
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
