import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Circle } from "lucide-react";
import { isNativeApp } from "@/lib/capacitorAuth";
import { Preferences } from '@capacitor/preferences';
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function MobileOnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    beltLevel: "",
    style: "",
    heightFeet: 5,
    heightInches: 9,
    heightCm: 175,
    weight: 170,
    useMetric: false,
  });

  const beltLevels = [
    { value: "white", label: "White Belt", color: "#ffffff" },
    { value: "blue", label: "Blue Belt", color: "#3b82f6" },
    { value: "purple", label: "Purple Belt", color: "#a855f7" },
    { value: "brown", label: "Brown Belt", color: "#92400e" },
    { value: "black", label: "Black Belt", color: "#000000" },
  ];

  const styles = [
    { value: "gi", label: "Gi" },
    { value: "nogi", label: "No-Gi" },
    { value: "both", label: "Both" },
  ];

  const handleComplete = async () => {
    setIsLoading(true);
    
    const heightString = formData.useMetric 
      ? `${formData.heightCm}cm` 
      : `${formData.heightFeet}'${formData.heightInches}"`;

    try {
      await apiRequest("PATCH", "/api/auth/profile", {
        displayName: formData.name.trim(),
        beltLevel: formData.beltLevel,
        style: formData.style,
        height: heightString,
        weight: formData.weight,
        unitPreference: formData.useMetric ? 'metric' : 'imperial',
        onboardingCompleted: true,
      });

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      
      if (isNativeApp()) {
        const userId = localStorage.getItem('mobileUserId') || '1';
        await Preferences.set({ key: 'mobileUserId', value: userId });
        setLocation('/ios-chat');
      } else {
        window.location.href = '/chat';
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save profile",
        variant: "destructive",
      });
      setIsLoading(false);
    }
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
            {[1, 2, 3, 4].map((s) => (
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
            Step {step} of 4
          </p>
        </div>

        {/* Step 1: Name */}
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
              What's your name?
            </p>

            <input
              type="text"
              placeholder="Enter your first name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              autoFocus
              style={{
                width: "100%",
                padding: "1rem",
                fontSize: "1rem",
                background: "var(--mobile-dark-gray)",
                border: "1px solid var(--mobile-border-gray)",
                borderRadius: "var(--mobile-radius-lg)",
                color: "white",
                marginBottom: "1.5rem",
              }}
              data-testid="input-name"
            />

            <button
              onClick={() => formData.name.trim() && setStep(2)}
              disabled={!formData.name.trim()}
              style={{
                width: "100%",
                padding: "1rem",
                background: formData.name.trim() 
                  ? "var(--mobile-primary-gradient)" 
                  : "var(--mobile-dark-gray)",
                borderRadius: "var(--mobile-radius-lg)",
                fontSize: "1rem",
                fontWeight: 600,
                opacity: formData.name.trim() ? 1 : 0.5,
              }}
              data-testid="button-next"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Belt Level */}
        {step === 2 && (
          <div className="mobile-animate-slide-in">
            <h1 style={{ 
              fontSize: "2rem", 
              marginBottom: "0.5rem" 
            }}>
              What's your belt?
            </h1>
            <p style={{ 
              fontSize: "1rem", 
              color: "var(--mobile-text-secondary)",
              marginBottom: "2rem"
            }}>
              Select your current rank
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
                    setStep(3);
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

            <button
              onClick={() => setStep(1)}
              style={{
                marginTop: "1.5rem",
                padding: "0.75rem",
                background: "transparent",
                color: "var(--mobile-text-secondary)",
                fontSize: "0.875rem",
              }}
              data-testid="button-back"
            >
              Back
            </button>
          </div>
        )}

        {/* Step 3: Training Style */}
        {step === 3 && (
          <div className="mobile-animate-slide-in">
            <h1 style={{ 
              fontSize: "2rem", 
              marginBottom: "0.5rem" 
            }}>
              What do you train?
            </h1>
            <p style={{ 
              fontSize: "1rem", 
              color: "var(--mobile-text-secondary)",
              marginBottom: "2rem"
            }}>
              Choose your training focus
            </p>

            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "0.75rem" 
            }}>
              {styles.map((style) => (
                <button
                  key={style.value}
                  onClick={() => {
                    setFormData({ ...formData, style: style.value });
                    setStep(4);
                  }}
                  style={{
                    padding: "1.25rem",
                    background: formData.style === style.value
                      ? "var(--mobile-primary-gradient)"
                      : "var(--mobile-dark-gray)",
                    borderRadius: "var(--mobile-radius-lg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "1rem"
                  }}
                  data-testid={`style-${style.value}`}
                >
                  <span>{style.label}</span>
                  <ChevronRight />
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              style={{
                marginTop: "1.5rem",
                padding: "0.75rem",
                background: "transparent",
                color: "var(--mobile-text-secondary)",
                fontSize: "0.875rem",
              }}
              data-testid="button-back"
            >
              Back
            </button>
          </div>
        )}

        {/* Step 4: Height & Weight */}
        {step === 4 && (
          <div className="mobile-animate-slide-in">
            <h1 style={{ 
              fontSize: "2rem", 
              marginBottom: "0.5rem" 
            }}>
              Height & Weight
            </h1>
            <p style={{ 
              fontSize: "1rem", 
              color: "var(--mobile-text-secondary)",
              marginBottom: "2rem"
            }}>
              Helps with technique recommendations
            </p>

            {/* Unit toggle */}
            <div style={{ 
              display: "flex", 
              justifyContent: "center", 
              gap: "0.5rem", 
              marginBottom: "1.5rem" 
            }}>
              <button
                onClick={() => setFormData({ ...formData, useMetric: false })}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  background: !formData.useMetric ? "var(--mobile-primary-purple)" : "var(--mobile-dark-gray)",
                  color: !formData.useMetric ? "white" : "var(--mobile-text-secondary)",
                }}
                data-testid="button-imperial"
              >
                Imperial
              </button>
              <button
                onClick={() => setFormData({ ...formData, useMetric: true })}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  background: formData.useMetric ? "var(--mobile-primary-purple)" : "var(--mobile-dark-gray)",
                  color: formData.useMetric ? "white" : "var(--mobile-text-secondary)",
                }}
                data-testid="button-metric"
              >
                Metric
              </button>
            </div>

            {/* Height */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ 
                display: "block", 
                marginBottom: "0.5rem", 
                color: "var(--mobile-text-secondary)",
                fontSize: "0.875rem"
              }}>
                Height
              </label>
              {formData.useMetric ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="number"
                    value={formData.heightCm}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      heightCm: parseInt(e.target.value) || 0
                    })}
                    style={{
                      width: "5rem",
                      padding: "0.75rem",
                      background: "var(--mobile-dark-gray)",
                      border: "1px solid var(--mobile-border-gray)",
                      borderRadius: "0.5rem",
                      color: "white",
                      textAlign: "center",
                    }}
                    min={100}
                    max={250}
                    data-testid="input-height-cm"
                  />
                  <span style={{ color: "var(--mobile-text-secondary)" }}>cm</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="number"
                    value={formData.heightFeet}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      heightFeet: parseInt(e.target.value) || 0
                    })}
                    style={{
                      width: "4rem",
                      padding: "0.75rem",
                      background: "var(--mobile-dark-gray)",
                      border: "1px solid var(--mobile-border-gray)",
                      borderRadius: "0.5rem",
                      color: "white",
                      textAlign: "center",
                    }}
                    min={4}
                    max={7}
                    data-testid="input-height-feet"
                  />
                  <span style={{ color: "var(--mobile-text-secondary)" }}>ft</span>
                  <input
                    type="number"
                    value={formData.heightInches}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      heightInches: parseInt(e.target.value) || 0
                    })}
                    style={{
                      width: "4rem",
                      padding: "0.75rem",
                      background: "var(--mobile-dark-gray)",
                      border: "1px solid var(--mobile-border-gray)",
                      borderRadius: "0.5rem",
                      color: "white",
                      textAlign: "center",
                    }}
                    min={0}
                    max={11}
                    data-testid="input-height-inches"
                  />
                  <span style={{ color: "var(--mobile-text-secondary)" }}>in</span>
                </div>
              )}
            </div>

            {/* Weight */}
            <div style={{ marginBottom: "2rem" }}>
              <label style={{ 
                display: "block", 
                marginBottom: "0.5rem", 
                color: "var(--mobile-text-secondary)",
                fontSize: "0.875rem"
              }}>
                Weight
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) || 0 })}
                  style={{
                    width: "5rem",
                    padding: "0.75rem",
                    background: "var(--mobile-dark-gray)",
                    border: "1px solid var(--mobile-border-gray)",
                    borderRadius: "0.5rem",
                    color: "white",
                    textAlign: "center",
                  }}
                  min={formData.useMetric ? 40 : 90}
                  max={formData.useMetric ? 200 : 400}
                  data-testid="input-weight"
                />
                <span style={{ color: "var(--mobile-text-secondary)" }}>
                  {formData.useMetric ? "kg" : "lbs"}
                </span>
              </div>
            </div>

            <button
              onClick={handleComplete}
              disabled={isLoading}
              style={{
                width: "100%",
                padding: "1rem",
                background: "var(--mobile-primary-gradient)",
                borderRadius: "var(--mobile-radius-lg)",
                fontSize: "1rem",
                fontWeight: 600,
                opacity: isLoading ? 0.7 : 1,
              }}
              data-testid="button-complete"
            >
              {isLoading ? "Saving..." : "Get Started"}
            </button>

            <button
              onClick={() => setStep(3)}
              disabled={isLoading}
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                background: "transparent",
                color: "var(--mobile-text-secondary)",
                fontSize: "0.875rem",
              }}
              data-testid="button-back"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
