import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User, LogOut, ExternalLink, Trash2, RefreshCw, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AdaptiveLayout from "@/components/adaptive-layout";
import { clearAuth, isNativeApp } from "@/lib/capacitorAuth";
import { Browser } from '@capacitor/browser';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const beltColors = {
  white: '#FFFFFF',
  blue: '#2563EB',
  purple: '#7C3AED',
  brown: '#92400E',
  black: '#000000',
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [isResettingProfile, setIsResettingProfile] = useState(false);

  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    beltLevel: 'white',
    style: 'both',
    struggleTechnique: '',
    heightFeet: '',
    heightInches: '',
    weight: '',
    trainingFrequency: '',
    age: '',
    injuries: '',
  });
  
  const parseHeightToFeetInches = (heightVal: number | string | undefined) => {
    if (!heightVal) return { feet: '', inches: '' };
    const totalInches = typeof heightVal === 'string' ? parseInt(heightVal) : heightVal;
    if (isNaN(totalInches)) return { feet: '', inches: '' };
    return {
      feet: String(Math.floor(totalInches / 12)),
      inches: String(totalInches % 12)
    };
  };
  
  const getHeightInInches = () => {
    const feet = parseInt(formData.heightFeet) || 0;
    const inches = parseInt(formData.heightInches) || 0;
    if (feet === 0 && inches === 0) return null;
    return feet * 12 + inches;
  };

  // Update form when user data loads
  useEffect(() => {
    if (user) {
      const parsedHeight = parseHeightToFeetInches(user.height);
      setFormData({
        name: user.name || '',
        email: user.email || '',
        beltLevel: user.beltLevel || 'white',
        style: user.style || 'both',
        struggleTechnique: user.struggleTechnique || '',
        heightFeet: parsedHeight.feet,
        heightInches: parsedHeight.inches,
        weight: user.weight?.toString() || '',
        trainingFrequency: user.trainingFrequency?.toString() || '',
        age: user.age?.toString() || '',
        injuries: Array.isArray(user.injuries) ? user.injuries.join(', ') : '',
      });
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PATCH', '/api/auth/profile', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your changes have been saved",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setIsSaving(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
      setIsSaving(false);
    },
  });

  const handleSave = () => {
    setIsSaving(true);
    
    // Convert form data to proper types
    const profileData = {
      name: formData.name,
      beltLevel: formData.beltLevel,
      style: formData.style,
      struggleTechnique: formData.struggleTechnique,
      height: getHeightInInches(),
      weight: formData.weight ? parseInt(formData.weight) : null,
      trainingFrequency: formData.trainingFrequency ? parseInt(formData.trainingFrequency) : null,
      age: formData.age,
      injuries: formData.injuries ? formData.injuries.split(',').map(i => i.trim()).filter(Boolean) : [],
    };
    
    updateProfileMutation.mutate(profileData);
  };

  const handleLogout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
      await clearAuth();
      navigate('/email-login');
      toast({
        title: "Logged out",
        description: "See you on the mat!",
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleDeleteChatHistory = async () => {
    setIsDeletingChat(true);
    try {
      await apiRequest('/api/user/chat-history', 'DELETE');
      queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history'] });
      toast({
        title: "Chat History Deleted",
        description: "All your conversations have been removed.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete chat history",
        variant: "destructive",
      });
    } finally {
      setIsDeletingChat(false);
    }
  };

  const handleResetProfile = async () => {
    setIsResettingProfile(true);
    try {
      await apiRequest('/api/user/reset-profile', 'DELETE');
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history'] });
      toast({
        title: "Profile Reset Complete",
        description: "Redirecting to onboarding...",
      });
      setTimeout(() => {
        navigate('/onboarding');
      }, 1000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reset profile",
        variant: "destructive",
      });
      setIsResettingProfile(false);
    }
  };

  const beltColor = beltColors[formData.beltLevel as keyof typeof beltColors];

  return (
    <AdaptiveLayout>
      <div className="settings-page">
        {/* Header */}
        <header className="page-header">
          <h1 className="page-title">Settings</h1>
        </header>

        {/* Profile Section */}
        <div className="settings-content">
          <Card className="settings-card">
            <div className="card-header">
              <User className="section-icon" />
              <h2 className="section-title">Profile</h2>
            </div>

            <div className="form-group">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Your name"
                data-testid="input-name"
              />
            </div>

            <div className="form-group">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                disabled
                className="disabled-input"
                data-testid="input-email"
              />
              <p className="field-hint">Email cannot be changed</p>
            </div>

            <div className="form-group">
              <Label htmlFor="belt">Belt Level</Label>
              <Select
                value={formData.beltLevel}
                onValueChange={(value) => setFormData({ ...formData, beltLevel: value })}
              >
                <SelectTrigger id="belt" data-testid="select-belt">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Badge 
                      style={{ 
                        backgroundColor: beltColor,
                        color: formData.beltLevel === 'white' ? '#000' : '#fff',
                      }}
                    >
                      {formData.beltLevel.toUpperCase()}
                    </Badge>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="white">White Belt</SelectItem>
                  <SelectItem value="blue">Blue Belt</SelectItem>
                  <SelectItem value="purple">Purple Belt</SelectItem>
                  <SelectItem value="brown">Brown Belt</SelectItem>
                  <SelectItem value="black">Black Belt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="form-group">
              <Label htmlFor="style">Training Style</Label>
              <Select
                value={formData.style}
                onValueChange={(value) => setFormData({ ...formData, style: value })}
              >
                <SelectTrigger id="style" data-testid="select-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gi">Gi Only</SelectItem>
                  <SelectItem value="nogi">No-Gi Only</SelectItem>
                  <SelectItem value="both">Both Gi & No-Gi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="form-group">
              <Label htmlFor="struggle">Biggest Struggle</Label>
              <textarea
                id="struggle"
                value={formData.struggleTechnique}
                onChange={(e) => setFormData({ ...formData, struggleTechnique: e.target.value })}
                placeholder="What technique do you struggle with most?"
                rows={3}
                className="struggle-textarea"
                data-testid="input-struggle"
              />
              <p className="field-hint">This helps Professor OS personalize recommendations</p>
            </div>

            <div className="form-group">
              <Label>Height</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    id="height-feet"
                    type="number"
                    min="0"
                    max="8"
                    placeholder="5"
                    value={formData.heightFeet}
                    onChange={(e) => setFormData({ ...formData, heightFeet: e.target.value })}
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
                    value={formData.heightInches}
                    onChange={(e) => setFormData({ ...formData, heightInches: e.target.value })}
                    data-testid="input-height-inches"
                  />
                </div>
                <span className="text-muted-foreground font-medium">in</span>
              </div>
            </div>

            <div className="form-group">
              <Label htmlFor="weight">Weight (pounds)</Label>
              <Input
                id="weight"
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                placeholder="e.g. 180"
                data-testid="input-weight"
              />
            </div>

            <div className="form-group">
              <Label htmlFor="frequency">Training Frequency</Label>
              <Select
                value={formData.trainingFrequency}
                onValueChange={(value) => setFormData({ ...formData, trainingFrequency: value })}
              >
                <SelectTrigger id="frequency" data-testid="select-frequency">
                  <SelectValue placeholder="How many days per week?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1x per week</SelectItem>
                  <SelectItem value="2">2x per week</SelectItem>
                  <SelectItem value="3">3x per week</SelectItem>
                  <SelectItem value="4">4x per week</SelectItem>
                  <SelectItem value="5">5x per week</SelectItem>
                  <SelectItem value="6">6x per week</SelectItem>
                  <SelectItem value="7">7x per week</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="form-group">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="text"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                placeholder="e.g. 35"
                data-testid="input-age"
              />
              <p className="field-hint">Used for personalized training advice</p>
            </div>

            <div className="form-group">
              <Label htmlFor="injuries">Injuries (comma-separated)</Label>
              <Input
                id="injuries"
                value={formData.injuries}
                onChange={(e) => setFormData({ ...formData, injuries: e.target.value })}
                placeholder="e.g. knee, shoulder, lower back"
                data-testid="input-injuries"
              />
              <p className="field-hint">Helps avoid problematic techniques</p>
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="save-button"
              data-testid="button-save"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </Card>

          {/* Subscription Section */}
          <Card className="settings-card">
            <div className="card-header">
              <h2 className="section-title">Subscription</h2>
            </div>
            <div className="subscription-info">
              <p className="subscription-type">
                Plan: <strong>{user?.subscriptionType || 'Free'}</strong>
              </p>
              <p className="subscription-status">
                Status: <strong>{user?.subscriptionStatus || 'Inactive'}</strong>
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  if (isNativeApp()) {
                    await Browser.open({ url: 'https://bjjos.app/settings/subscription' });
                  } else {
                    navigate('/settings/subscription');
                  }
                }}
                className="manage-button"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Manage Subscription
              </Button>
            </div>
          </Card>

          {/* Data & Privacy Section */}
          <Card className="settings-card">
            <div className="card-header">
              <Shield className="section-icon" />
              <h2 className="section-title">Data & Privacy</h2>
            </div>

            <div className="data-action-row">
              <div className="data-action-info">
                <div className="data-action-label">
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Chat History</span>
                </div>
                <p className="field-hint">Removes all messages. Your profile stays intact.</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isDeletingChat}
                    data-testid="button-delete-chat"
                  >
                    {isDeletingChat ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Delete"
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#1A1A1A] border-white/10">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Delete Chat History?</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/70">
                      This will permanently delete all your conversations with Professor OS. Your profile (belt rank, goals, preferences) will not be affected. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-white/10 text-white border-white/10">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteChatHistory}
                      className="bg-red-500 text-white hover:bg-red-600"
                      data-testid="button-confirm-delete-chat"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="data-action-divider" />

            <div className="data-action-row">
              <div className="data-action-info">
                <div className="data-action-label">
                  <RefreshCw className="w-4 h-4" />
                  <span>Reset Professor OS Memory</span>
                </div>
                <p className="field-hint">Start fresh. Removes all conversations AND your profile.</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isResettingProfile}
                    data-testid="button-reset-profile"
                  >
                    {isResettingProfile ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Reset"
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#1A1A1A] border-white/10">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Reset Everything?</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/70">
                      This will delete ALL your data including conversations, your belt rank, goals, training preferences, and everything Professor OS has learned about you. You will need to set up your profile again. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-white/10 text-white border-white/10">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleResetProfile}
                      className="bg-red-500 text-white hover:bg-red-600"
                      data-testid="button-confirm-reset-profile"
                    >
                      Reset Everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Card>

          {/* Logout */}
          <Button
            variant="destructive"
            onClick={handleLogout}
            className="logout-button"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Log Out
          </Button>
        </div>

        <style>{`
          /* ==================== PAGE LAYOUT ==================== */
          .settings-page {
            min-height: 100vh;
            background: #000;
            color: #fff;
          }

          .page-header {
            padding: 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .page-title {
            font-size: 24px;
            font-weight: 700;
            margin: 0;
          }

          /* ==================== CONTENT ==================== */
          .settings-content {
            padding: 16px;
            max-width: 600px;
            margin: 0 auto;
          }

          @media (min-width: 768px) {
            .settings-content {
              padding: 24px;
            }
          }

          .settings-card {
            background: #0F0F0F;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
          }

          .card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
          }

          .section-icon {
            width: 24px;
            height: 24px;
            color: #7C3AED;
          }

          .section-title {
            font-size: 20px;
            font-weight: 700;
            margin: 0;
          }

          /* ==================== FORM ==================== */
          .form-group {
            margin-bottom: 20px;
          }

          .form-group label {
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
            font-weight: 600;
            color: #A0A0A0;
          }

          .form-group input,
          .form-group select {
            background: #000;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            width: 100%;
          }

          .disabled-input {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .struggle-textarea {
            width: 100%;
            background: #000;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 12px;
            color: #fff;
            font-size: 15px;
            font-family: inherit;
            resize: vertical;
            outline: none;
          }

          .struggle-textarea:focus {
            border-color: #7C3AED;
          }

          .struggle-textarea::placeholder {
            color: #71717A;
          }

          .field-hint {
            font-size: 12px;
            color: #71717A;
            margin-top: 4px;
          }

          .save-button {
            width: 100%;
            background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
            color: #fff;
            font-weight: 600;
            margin-top: 8px;
          }

          .save-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          /* ==================== SUBSCRIPTION ==================== */
          .subscription-info {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .subscription-type,
          .subscription-status {
            font-size: 15px;
            color: #A0A0A0;
            margin: 0;
          }

          .subscription-type strong,
          .subscription-status strong {
            color: #fff;
          }

          .manage-button {
            margin-top: 8px;
          }

          /* ==================== DATA & PRIVACY ==================== */
          .data-action-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 8px 0;
          }

          .data-action-info {
            flex: 1;
          }

          .data-action-label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            color: #fff;
            margin-bottom: 4px;
          }

          .data-action-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
            margin: 12px 0;
          }

          /* ==================== LOGOUT ==================== */
          .logout-button {
            width: 100%;
            margin-top: 8px;
          }
        `}</style>
      </div>
    </AdaptiveLayout>
  );
}
