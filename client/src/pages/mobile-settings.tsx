import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { User, Dumbbell, Save, Loader2, ChevronLeft } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

console.log('❌ MOBILE settings loaded - WRONG if you see this in iOS app');

export default function MobileSettingsPage() {
  const [, navigate] = useLocation();
  const [saveStatus, setSaveStatus] = useState<string>('');
  
  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/auth/profile"],
    enabled: !!user,
  });

  const [formData, setFormData] = useState({
    username: '',
    displayName: '',
    name: '',
    beltLevel: 'white',
    style: 'both',
    age: '',
    weight: '',
    gym: '',
    timezone: 'America/New_York',
    weeklyRecapEnabled: true,
  });

  // Update form when profile loads
  useEffect(() => {
    if (profile) {
      setFormData({
        username: profile.username || '',
        displayName: profile.displayName || '',
        name: profile.name || '',
        beltLevel: profile.beltLevel || 'white',
        style: profile.style || 'both',
        age: profile.age || '',
        weight: profile.weight || '',
        gym: profile.gym || '',
        timezone: profile.timezone || 'America/New_York',
        weeklyRecapEnabled: profile.weeklyRecapEnabled ?? true,
      });
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("PATCH", `/api/auth/profile`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
    },
    onError: (error: any) => {
      setSaveStatus('error');
      console.error('Update error:', error);
      setTimeout(() => setSaveStatus(''), 3000);
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="mobile-app">
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--mobile-dark-bg)"
        }}>
          <Loader2 className="w-8 h-8 animate-spin" color="var(--mobile-text-primary)" />
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-app">
      <div style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--mobile-dark-bg)",
        color: "var(--mobile-text-primary)",
        paddingBottom: "var(--mobile-bottom-nav-height)",
        overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--mobile-dark-bg)",
          borderBottom: "1px solid var(--mobile-border-gray)",
          padding: "1rem"
        }}>
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between" 
          }}>
            <h1 style={{ 
              fontSize: "1.5rem", 
              fontWeight: "700",
              color: "var(--mobile-text-primary)"
            }}>
              Settings
            </h1>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                background: saveStatus === 'saved' ? "var(--mobile-success)" : "var(--mobile-primary)",
                color: "white",
                border: "none",
                borderRadius: "var(--mobile-radius-md)",
                fontSize: "0.875rem",
                fontWeight: "var(--mobile-font-medium)",
                cursor: updateMutation.isPending ? "not-allowed" : "pointer",
                opacity: updateMutation.isPending ? 0.6 : 1
              }}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : saveStatus === 'saved' ? (
                '✓ Saved'
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Profile Section */}
            <div style={{
              background: "var(--mobile-medium-gray)",
              borderRadius: "var(--mobile-radius-lg)",
              padding: "1rem"
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1rem"
              }}>
                <User size={20} color="var(--mobile-primary)" />
                <h2 style={{ 
                  fontSize: "1.125rem", 
                  fontWeight: "var(--mobile-font-semibold)",
                  color: "var(--mobile-text-primary)"
                }}>
                  Profile
                </h2>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: "var(--mobile-font-medium)",
                    color: "var(--mobile-text-secondary)",
                    marginBottom: "0.5rem"
                  }}>
                    Username *
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    data-testid="input-username"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      background: "var(--mobile-dark-bg)",
                      border: "1px solid var(--mobile-border-gray)",
                      borderRadius: "var(--mobile-radius-md)",
                      color: "var(--mobile-text-primary)",
                      fontSize: "0.875rem",
                      outline: "none"
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: "var(--mobile-font-medium)",
                    color: "var(--mobile-text-secondary)",
                    marginBottom: "0.5rem"
                  }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    data-testid="input-display-name"
                    placeholder="John Smith"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      background: "var(--mobile-dark-bg)",
                      border: "1px solid var(--mobile-border-gray)",
                      borderRadius: "var(--mobile-radius-md)",
                      color: "var(--mobile-text-primary)",
                      fontSize: "0.875rem",
                      outline: "none"
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: "var(--mobile-font-medium)",
                    color: "var(--mobile-text-secondary)",
                    marginBottom: "0.5rem"
                  }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="input-name"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      background: "var(--mobile-dark-bg)",
                      border: "1px solid var(--mobile-border-gray)",
                      borderRadius: "var(--mobile-radius-md)",
                      color: "var(--mobile-text-primary)",
                      fontSize: "0.875rem",
                      outline: "none"
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Training Profile */}
            <div style={{
              background: "var(--mobile-medium-gray)",
              borderRadius: "var(--mobile-radius-lg)",
              padding: "1rem"
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1rem"
              }}>
                <Dumbbell size={20} color="var(--mobile-primary)" />
                <h2 style={{ 
                  fontSize: "1.125rem", 
                  fontWeight: "var(--mobile-font-semibold)",
                  color: "var(--mobile-text-primary)"
                }}>
                  Training
                </h2>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: "var(--mobile-font-medium)",
                    color: "var(--mobile-text-secondary)",
                    marginBottom: "0.5rem"
                  }}>
                    Belt Level *
                  </label>
                  <select
                    value={formData.beltLevel}
                    onChange={(e) => setFormData({ ...formData, beltLevel: e.target.value })}
                    data-testid="select-belt-level"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      background: "var(--mobile-dark-bg)",
                      border: "1px solid var(--mobile-border-gray)",
                      borderRadius: "var(--mobile-radius-md)",
                      color: "var(--mobile-text-primary)",
                      fontSize: "0.875rem",
                      outline: "none"
                    }}
                  >
                    {["white", "blue", "purple", "brown", "black"].map(belt => (
                      <option key={belt} value={belt}>{belt.charAt(0).toUpperCase() + belt.slice(1)} Belt</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: "var(--mobile-font-medium)",
                    color: "var(--mobile-text-secondary)",
                    marginBottom: "0.5rem"
                  }}>
                    Training Style *
                  </label>
                  <select
                    value={formData.style}
                    onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                    data-testid="select-style"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      background: "var(--mobile-dark-bg)",
                      border: "1px solid var(--mobile-border-gray)",
                      borderRadius: "var(--mobile-radius-md)",
                      color: "var(--mobile-text-primary)",
                      fontSize: "0.875rem",
                      outline: "none"
                    }}
                  >
                    <option value="gi">Gi Only</option>
                    <option value="nogi">No-Gi Only</option>
                    <option value="both">Both Gi & No-Gi</option>
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: "var(--mobile-font-medium)",
                      color: "var(--mobile-text-secondary)",
                      marginBottom: "0.5rem"
                    }}>
                      Age
                    </label>
                    <input
                      type="text"
                      value={formData.age}
                      onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      data-testid="input-age"
                      placeholder="25"
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        background: "var(--mobile-dark-bg)",
                        border: "1px solid var(--mobile-border-gray)",
                        borderRadius: "var(--mobile-radius-md)",
                        color: "var(--mobile-text-primary)",
                        fontSize: "0.875rem",
                        outline: "none"
                      }}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: "var(--mobile-font-medium)",
                      color: "var(--mobile-text-secondary)",
                      marginBottom: "0.5rem"
                    }}>
                      Weight (lbs)
                    </label>
                    <input
                      type="text"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                      data-testid="input-weight"
                      placeholder="170"
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        background: "var(--mobile-dark-bg)",
                        border: "1px solid var(--mobile-border-gray)",
                        borderRadius: "var(--mobile-radius-md)",
                        color: "var(--mobile-text-primary)",
                        fontSize: "0.875rem",
                        outline: "none"
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: "var(--mobile-font-medium)",
                    color: "var(--mobile-text-secondary)",
                    marginBottom: "0.5rem"
                  }}>
                    Gym/Academy
                  </label>
                  <input
                    type="text"
                    value={formData.gym}
                    onChange={(e) => setFormData({ ...formData, gym: e.target.value })}
                    data-testid="input-gym"
                    placeholder="Gracie Barra"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      background: "var(--mobile-dark-bg)",
                      border: "1px solid var(--mobile-border-gray)",
                      borderRadius: "var(--mobile-radius-md)",
                      color: "var(--mobile-text-primary)",
                      fontSize: "0.875rem",
                      outline: "none"
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div style={{
              background: "var(--mobile-medium-gray)",
              borderRadius: "var(--mobile-radius-lg)",
              padding: "1rem"
            }}>
              <h2 style={{ 
                fontSize: "1.125rem", 
                fontWeight: "var(--mobile-font-semibold)",
                color: "var(--mobile-text-primary)",
                marginBottom: "1rem"
              }}>
                Preferences
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: "var(--mobile-font-medium)",
                    color: "var(--mobile-text-secondary)",
                    marginBottom: "0.5rem"
                  }}>
                    Timezone
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    data-testid="select-timezone"
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      background: "var(--mobile-dark-bg)",
                      border: "1px solid var(--mobile-border-gray)",
                      borderRadius: "var(--mobile-radius-md)",
                      color: "var(--mobile-text-primary)",
                      fontSize: "0.875rem",
                      outline: "none"
                    }}
                  >
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                  </select>
                </div>

                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}>
                  <div>
                    <div style={{
                      fontSize: "0.875rem",
                      fontWeight: "var(--mobile-font-medium)",
                      color: "var(--mobile-text-primary)"
                    }}>
                      Weekly Recap Emails
                    </div>
                    <div style={{
                      fontSize: "0.75rem",
                      color: "var(--mobile-text-tertiary)",
                      marginTop: "0.25rem"
                    }}>
                      Receive weekly progress summaries
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.weeklyRecapEnabled}
                    onChange={(e) => setFormData({ ...formData, weeklyRecapEnabled: e.target.checked })}
                    data-testid="toggle-weekly-recap"
                    style={{
                      width: "3rem",
                      height: "1.5rem",
                      cursor: "pointer"
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </div>
  );
}
