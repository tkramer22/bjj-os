import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SettingsLayout } from "./layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type BeltLevel = 'white' | 'blue' | 'purple' | 'brown' | 'black';
type Style = 'gi' | 'nogi' | 'both';

type StruggleArea = 'guard_passing' | 'guard_retention' | 'submissions' | 'escapes' | 'takedowns' | 'transitions' | 'other';

interface UserProfile {
  id: number;
  email?: string;
  phoneNumber?: string;
  username?: string;
  displayName?: string;
  name?: string;
  beltLevel?: BeltLevel;
  style?: Style;
  trainingFrequency?: number;
  struggleAreaCategory?: StruggleArea;
  height?: string;
  weight?: string;
  age?: string;
  onboardingCompleted: boolean;
}

export default function ProfileSettings() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    displayName: "",
    username: "",
    beltLevel: "white" as BeltLevel,
    style: "gi" as Style,
    trainingFrequency: 2,
    struggleAreaCategory: "guard_passing" as StruggleArea,
    heightFeet: "",
    heightInches: "",
    weight: "",
    age: "",
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
  
  const getHeightInInches = (): string | undefined => {
    const feet = parseInt(formData.heightFeet) || 0;
    const inches = parseInt(formData.heightInches) || 0;
    if (feet === 0 && inches === 0) return undefined;
    return String(feet * 12 + inches);
  };
  
  const formatHeightDisplay = (heightStr: string | undefined) => {
    if (!heightStr) return "Not set";
    const totalInches = parseInt(heightStr);
    if (isNaN(totalInches)) return heightStr;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
  };

  const { data, isLoading } = useQuery<{ user: UserProfile }>({
    queryKey: ["/api/auth/me"],
    refetchOnMount: true,
  });

  // Populate formData when user data loads
  useEffect(() => {
    if (data?.user) {
      const parsedHeight = parseHeightToFeetInches(data.user.height);
      setFormData({
        displayName: data.user.displayName || "",
        username: data.user.username || "",
        beltLevel: data.user.beltLevel || "white",
        style: data.user.style || "gi",
        trainingFrequency: data.user.trainingFrequency || 2,
        struggleAreaCategory: data.user.struggleAreaCategory || "guard_passing",
        heightFeet: parsedHeight.feet,
        heightInches: parsedHeight.inches,
        weight: data.user.weight || "",
        age: data.user.age || "",
      });
    }
  }, [data?.user]);

  // Debug logging
  console.log('[ProfileSettings] Query data:', data);
  console.log('[ProfileSettings] User:', data?.user);
  console.log('[ProfileSettings] Belt level:', data?.user?.beltLevel);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<UserProfile>) => {
      return await apiRequest("PATCH", "/api/auth/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated",
      });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = () => {
    console.log('[ProfileSettings] Edit button clicked');
    console.log('[ProfileSettings] User data:', data?.user);
    
    // Always enable edit mode, use defaults if no user data
    const currentUser = data?.user;
    const parsedHeight = parseHeightToFeetInches(currentUser?.height);
    setFormData({
      displayName: currentUser?.displayName || "",
      username: currentUser?.username || "",
      beltLevel: currentUser?.beltLevel || "white",
      style: currentUser?.style || "gi",
      trainingFrequency: currentUser?.trainingFrequency || 2,
      struggleAreaCategory: currentUser?.struggleAreaCategory || "guard_passing",
      heightFeet: parsedHeight.feet,
      heightInches: parsedHeight.inches,
      weight: currentUser?.weight || "",
      age: currentUser?.age || "",
    });
    setIsEditing(true);
    console.log('[ProfileSettings] Edit mode enabled');
  };

  const handleSave = () => {
    const dataToSave = {
      ...formData,
      height: getHeightInInches()
    };
    updateProfileMutation.mutate(dataToSave);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <SettingsLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </SettingsLayout>
    );
  }

  const user = data?.user;

  return (
    <SettingsLayout>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold mb-2">Profile Settings</h1>
        <p className="text-muted-foreground mb-6">
          Manage your personal information and training preferences
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Your profile helps us personalize your training experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label>Name</Label>
              {isEditing ? (
                <Input
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Enter your name"
                  data-testid="input-name"
                />
              ) : (
                <Input 
                  value={user?.displayName || "Not set"} 
                  disabled 
                  data-testid="text-name"
                />
              )}
            </div>

            {/* Email (Read-only) */}
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                value={user?.email || user?.phoneNumber || ""} 
                disabled 
                data-testid="input-email"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>

            {/* Belt Level */}
            <div className="space-y-2">
              <Label>Belt Level</Label>
              {isEditing ? (
                <Select
                  value={formData.beltLevel}
                  onValueChange={(value) => setFormData({ ...formData, beltLevel: value as BeltLevel })}
                >
                  <SelectTrigger data-testid="select-belt">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="white">White Belt</SelectItem>
                    <SelectItem value="blue">Blue Belt</SelectItem>
                    <SelectItem value="purple">Purple Belt</SelectItem>
                    <SelectItem value="brown">Brown Belt</SelectItem>
                    <SelectItem value="black">Black Belt</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input 
                  value={user?.beltLevel ? `${user.beltLevel.charAt(0).toUpperCase() + user.beltLevel.slice(1)} Belt` : "Not set"} 
                  disabled 
                  data-testid="text-belt"
                />
              )}
            </div>

            {/* Training Style */}
            <div className="space-y-2">
              <Label>Training Style</Label>
              {isEditing ? (
                <Select
                  value={formData.style}
                  onValueChange={(value) => setFormData({ ...formData, style: value as Style })}
                >
                  <SelectTrigger data-testid="select-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gi">Gi</SelectItem>
                    <SelectItem value="nogi">No-Gi</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input 
                  value={user?.style ? (user.style === 'both' ? 'Gi & No-Gi' : user.style === 'nogi' ? 'No-Gi' : 'Gi') : "Not set"} 
                  disabled 
                  data-testid="text-style"
                />
              )}
            </div>

            {/* Biggest Struggle */}
            <div className="space-y-2">
              <Label>Biggest Struggle</Label>
              {isEditing ? (
                <Select
                  value={formData.struggleAreaCategory}
                  onValueChange={(value) => setFormData({ ...formData, struggleAreaCategory: value as StruggleArea })}
                >
                  <SelectTrigger data-testid="select-struggle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="guard_passing">Guard Passing</SelectItem>
                    <SelectItem value="guard_retention">Guard Retention</SelectItem>
                    <SelectItem value="submissions">Submissions from Top</SelectItem>
                    <SelectItem value="escapes">Escapes from Bottom</SelectItem>
                    <SelectItem value="takedowns">Takedowns</SelectItem>
                    <SelectItem value="transitions">Position Transitions</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input 
                  value={
                    user?.struggleAreaCategory 
                      ? user.struggleAreaCategory.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                      : "Not set"
                  } 
                  disabled 
                  data-testid="text-struggle"
                />
              )}
            </div>

            {/* Optional Physical Stats */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-muted-foreground">Optional Information</h3>
              
              {/* Height */}
              <div className="space-y-2">
                <Label>Height</Label>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input
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
                ) : (
                  <Input 
                    value={formatHeightDisplay(user?.height)} 
                    disabled 
                    data-testid="text-height"
                  />
                )}
              </div>

              {/* Weight */}
              <div className="space-y-2">
                <Label>Weight</Label>
                {isEditing ? (
                  <Input
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    placeholder="e.g., 170 lbs or 77kg"
                    data-testid="input-weight"
                  />
                ) : (
                  <Input 
                    value={user?.weight || "Not set"} 
                    disabled 
                    data-testid="text-weight"
                  />
                )}
              </div>

              {/* Age */}
              <div className="space-y-2">
                <Label>Age</Label>
                {isEditing ? (
                  <Input
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    placeholder="e.g., 32"
                    data-testid="input-age"
                  />
                ) : (
                  <Input 
                    value={user?.age || "Not set"} 
                    disabled 
                    data-testid="text-age"
                  />
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              {isEditing ? (
                <>
                  <Button 
                    onClick={handleSave} 
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-save"
                  >
                    {updateProfileMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Save Changes
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleCancel}
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button onClick={handleEdit} data-testid="button-edit">
                  Edit Profile
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}
