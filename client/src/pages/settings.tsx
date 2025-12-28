import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, User, Dumbbell, Target, Bell, Trash2, RefreshCw, Shield } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { BeltIcon } from "@/components/BeltIcon";
import UserLayout from "@/components/layouts/UserLayout";
import { useLocation } from "wouter";
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

const settingsSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be less than 20 characters")
    .regex(/^[a-z0-9_]+$/, "Username must be lowercase letters, numbers, and underscores only"),
  displayName: z.string().max(50).optional(),
  name: z.string().max(100).optional(),
  beltLevel: z.enum(["white", "blue", "purple", "brown", "black"]),
  style: z.enum(["gi", "nogi", "both"]),
  age: z.string().optional(),
  heightFeet: z.string().optional(),
  heightInches: z.string().optional(),
  weight: z.string().optional(),
  birthYear: z.string().optional(),
  trainingFrequency: z.string().optional(),
  gym: z.string().max(100).optional(),
  yearsTraining: z.string().optional(),
  goals: z.string().max(500).optional(),
  injuries: z.string().max(500).optional(),
  timezone: z.string(),
  weeklyRecapEnabled: z.boolean(),
  // weakestArea is intentionally excluded - it's read-only from onboarding
});

const parseHeightToFeetInches = (heightStr: string | undefined) => {
  if (!heightStr) return { feet: '', inches: '' };
  const totalInches = parseInt(heightStr);
  if (isNaN(totalInches)) return { feet: '', inches: '' };
  return {
    feet: String(Math.floor(totalInches / 12)),
    inches: String(totalInches % 12)
  };
};

type SettingsFormData = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [isResettingProfile, setIsResettingProfile] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/auth/profile"],
    enabled: !!user,
  });

  const getProfileValues = () => {
    if (!profile) return undefined;
    const parsedHeight = parseHeightToFeetInches(profile.height);
    return {
      username: profile.username || "",
      displayName: profile.displayName || "",
      name: profile.name || "",
      beltLevel: profile.beltLevel || "white",
      style: profile.style || "both",
      age: profile.age || "",
      heightFeet: parsedHeight.feet,
      heightInches: parsedHeight.inches,
      weight: profile.weight || "",
      birthYear: profile.birthYear ? String(profile.birthYear) : "",
      trainingFrequency: profile.trainingFrequency ? String(profile.trainingFrequency) : "",
      gym: profile.gym || "",
      yearsTraining: profile.yearsTraining ? String(profile.yearsTraining) : "",
      goals: profile.goals || "",
      injuries: Array.isArray(profile.injuries) ? profile.injuries.join(", ") : (profile.injuries || ""),
      timezone: profile.timezone || "America/New_York",
      weeklyRecapEnabled: profile.weeklyRecapEnabled ?? true,
    };
  };

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    values: getProfileValues(),
  });

  const watchedUsername = form.watch("username");

  // Check username availability
  const checkUsername = async (username: string) => {
    if (!username || username === profile?.username) {
      setUsernameAvailable(null);
      return;
    }

    setIsCheckingUsername(true);
    try {
      const response = await fetch("/api/validate-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
        credentials: "include",
      });
      const data = await response.json();
      setUsernameAvailable(data.available);
    } catch (error) {
      console.error("Username check error:", error);
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      // Convert height from feet/inches to total inches
      const feet = parseInt(data.heightFeet || '0') || 0;
      const inches = parseInt(data.heightInches || '0') || 0;
      const heightInInches = (feet === 0 && inches === 0) ? undefined : String(feet * 12 + inches);
      
      // Convert fields to appropriate types
      const payload = {
        ...data,
        height: heightInInches,
        yearsTraining: data.yearsTraining ? parseInt(data.yearsTraining) : undefined,
        birthYear: data.birthYear ? parseInt(data.birthYear) : undefined,
        trainingFrequency: data.trainingFrequency ? parseInt(data.trainingFrequency) : undefined,
        injuries: data.injuries ? data.injuries.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      return await apiRequest(`/api/auth/profile`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Settings Updated",
        description: "Your profile has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    updateMutation.mutate(data);
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

  if (isLoading) {
    return (
      <UserLayout>
        <div className="flex items-center justify-center w-full h-full">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </UserLayout>
    );
  }

  const currentBelt = form.watch("beltLevel");

  return (
    <UserLayout>
      <div className="w-full h-full overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your profile and training preferences
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="w-5 h-5" />
              <CardTitle>Profile Information</CardTitle>
            </div>
            <CardDescription>
              Your basic profile details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    id="username"
                    data-testid="input-username"
                    {...form.register("username")}
                    onBlur={(e) => checkUsername(e.target.value)}
                    className="pr-10"
                  />
                  {isCheckingUsername && (
                    <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-muted-foreground" />
                  )}
                  {!isCheckingUsername && usernameAvailable === true && (
                    <span className="absolute right-3 top-3 text-green-600">✓</span>
                  )}
                  {!isCheckingUsername && usernameAvailable === false && (
                    <span className="absolute right-3 top-3 text-destructive">✗</span>
                  )}
                </div>
              </div>
              {form.formState.errors.username && (
                <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>
              )}
              {usernameAvailable === false && (
                <p className="text-sm text-destructive">Username is already taken</p>
              )}
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and underscores only (3-20 characters)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="input-email"
                value={profile?.email || "Not set"}
                disabled
                className="bg-muted cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                data-testid="input-display-name"
                placeholder="John Smith"
                {...form.register("displayName")}
              />
              <p className="text-xs text-muted-foreground">
                How your name appears to others
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                data-testid="input-name"
                {...form.register("name")}
              />
            </div>
          </CardContent>
        </Card>

        {/* Training Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5" />
              <CardTitle>Training Profile</CardTitle>
            </div>
            <CardDescription>
              Your BJJ training information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="beltLevel">Belt Level *</Label>
              <Select
                value={form.watch("beltLevel")}
                onValueChange={(value) => form.setValue("beltLevel", value as any)}
              >
                <SelectTrigger id="beltLevel" data-testid="select-belt-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["white", "blue", "purple", "brown", "black"].map((belt) => (
                    <SelectItem key={belt} value={belt} data-testid={`option-belt-${belt}`}>
                      <div className="flex items-center gap-2">
                        <BeltIcon belt={belt as any} className="w-6 h-3" />
                        <span className="capitalize">{belt} Belt</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="style">Training Style *</Label>
              <Select
                value={form.watch("style")}
                onValueChange={(value) => form.setValue("style", value as any)}
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  data-testid="input-age"
                  placeholder="25"
                  {...form.register("age")}
                />
              </div>

              <div className="space-y-2">
                <Label>Height</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      max="8"
                      placeholder="5"
                      data-testid="input-height-feet"
                      {...form.register("heightFeet")}
                    />
                  </div>
                  <span className="text-muted-foreground font-medium text-sm">ft</span>
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      max="11"
                      placeholder="10"
                      data-testid="input-height-inches"
                      {...form.register("heightInches")}
                    />
                  </div>
                  <span className="text-muted-foreground font-medium text-sm">in</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weight">Weight</Label>
                <Input
                  id="weight"
                  data-testid="input-weight"
                  placeholder="170 lbs or 77kg"
                  {...form.register("weight")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trainingFrequency">Training Frequency (days/week)</Label>
                <Select
                  value={form.watch("trainingFrequency") || ""}
                  onValueChange={(value) => form.setValue("trainingFrequency", value)}
                >
                  <SelectTrigger id="trainingFrequency" data-testid="select-training-frequency">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1x per week</SelectItem>
                    <SelectItem value="2">2x per week</SelectItem>
                    <SelectItem value="3">3x per week</SelectItem>
                    <SelectItem value="4">4x per week</SelectItem>
                    <SelectItem value="5">5x per week</SelectItem>
                    <SelectItem value="6">6+ per week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="birthYear">Birth Year</Label>
                <Input
                  id="birthYear"
                  data-testid="input-birthyear"
                  type="number"
                  placeholder="1990"
                  {...form.register("birthYear")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gym">Gym/Academy</Label>
              <Input
                id="gym"
                data-testid="input-gym"
                placeholder="Gracie Barra"
                {...form.register("gym")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="yearsTraining">Years Training</Label>
              <Input
                id="yearsTraining"
                data-testid="input-years-training"
                type="number"
                placeholder="2"
                {...form.register("yearsTraining")}
              />
              <p className="text-xs text-muted-foreground">
                How many years have you been training BJJ?
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goals">Training Goals</Label>
              <Input
                id="goals"
                data-testid="input-goals"
                placeholder="Improve my guard passing, compete more"
                {...form.register("goals")}
              />
              <p className="text-xs text-muted-foreground">
                What are your current training goals?
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="injuries">Injuries or Limitations</Label>
              <Input
                id="injuries"
                data-testid="input-injuries"
                placeholder="Bad knee, shoulder impingement"
                {...form.register("injuries")}
              />
              <p className="text-xs text-muted-foreground">
                Any injuries Professor OS should know about? (Comma-separated)
              </p>
            </div>

            {profile?.weakestArea && (
              <div className="space-y-2 p-4 bg-muted/30 rounded-lg border">
                <Label className="text-sm font-medium">Primary Focus Area (from onboarding)</Label>
                <p className="text-sm capitalize text-muted-foreground">
                  {profile.weakestArea === 'all' ? 'Everything (beginner)' : 
                   profile.weakestArea === 'none' ? 'General improvement' :
                   profile.weakestArea === 'retention' ? 'Guard retention' :
                   profile.weakestArea}
                </p>
                <p className="text-xs text-muted-foreground italic">
                  This was set during onboarding and helps Professor OS focus your training
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              <CardTitle>Preferences</CardTitle>
            </div>
            <CardDescription>
              Customize your experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={form.watch("timezone")}
                onValueChange={(value) => form.setValue("timezone", value)}
              >
                <SelectTrigger id="timezone" data-testid="select-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                  <SelectItem value="America/Phoenix">Arizona Time (AZ)</SelectItem>
                  <SelectItem value="America/Anchorage">Alaska Time (AK)</SelectItem>
                  <SelectItem value="Pacific/Honolulu">Hawaii Time (HI)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="weeklyRecap">Weekly Recap Emails</Label>
                <p className="text-xs text-muted-foreground">
                  Receive weekly progress summaries
                </p>
              </div>
              <Switch
                id="weeklyRecap"
                data-testid="toggle-weekly-recap"
                checked={form.watch("weeklyRecapEnabled")}
                onCheckedChange={(checked) => form.setValue("weeklyRecapEnabled", checked)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={updateMutation.isPending}
            data-testid="button-reset"
          >
            Reset
          </Button>
          <Button
            type="submit"
            disabled={updateMutation.isPending || usernameAvailable === false}
            data-testid="button-save"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>

        {/* Data & Privacy Section - Outside form */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              <CardTitle>Data & Privacy</CardTitle>
            </div>
            <CardDescription>
              Manage your data and reset options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                  <Label>Delete Chat History</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Removes all messages. Your profile stays intact.
                </p>
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
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Chat History?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all your conversations with Professor OS. Your profile (belt rank, goals, preferences) will not be affected. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteChatHistory}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete-chat"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-muted-foreground" />
                    <Label>Reset Professor OS Memory</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Start completely fresh. Removes all conversations AND your profile.
                  </p>
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
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset Everything?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete ALL your data including conversations, your belt rank, goals, training preferences, and everything Professor OS has learned about you. You will need to set up your profile again. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleResetProfile}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-confirm-reset-profile"
                      >
                        Reset Everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </UserLayout>
  );
}
