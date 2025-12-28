import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LifetimeSignupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Parse URL params for token
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  
  // Token validation state
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenChecking, setTokenChecking] = useState(true);
  const [invitationEmail, setInvitationEmail] = useState("");
  
  // Form state
  const [firstName, setFirstName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [struggleArea, setStruggleArea] = useState("");
  const [trainingFocus, setTrainingFocus] = useState("");
  
  // Validation state
  const [firstNameError, setFirstNameError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isValidatingUsername, setIsValidatingUsername] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    validateToken();
  }, []);

  const validateToken = async () => {
    if (!token) {
      setTokenChecking(false);
      toast({
        variant: "destructive",
        title: "Invalid Link",
        description: "No invitation token found. Please use the link from your invitation email.",
      });
      return;
    }

    try {
      const response = await apiRequest("GET", `/api/auth/validate-lifetime-invite?token=${token}`);
      const data = await response.json();
      
      if (data.success && data.email) {
        setTokenValid(true);
        setInvitationEmail(data.email);
      } else {
        toast({
          variant: "destructive",
          title: "Invalid Invitation",
          description: data.error || "This invitation link is invalid or has expired.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to validate invitation link",
      });
    } finally {
      setTokenChecking(false);
    }
  };

  // Username validation with debouncing
  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsValidatingUsername(true);
      try {
        const response = await apiRequest("POST", "/api/auth/check-username", { username });
        const data = await response.json();
        
        if (data.available) {
          setUsernameAvailable(true);
          setUsernameError("");
        } else {
          setUsernameAvailable(false);
          setUsernameError(data.message || "Username is already taken");
        }
      } catch (error) {
        console.error('Username check error:', error);
      } finally {
        setIsValidatingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  const validateForm = () => {
    let isValid = true;

    // First name validation
    if (!firstName.trim()) {
      setFirstNameError("First name is required");
      isValid = false;
    } else {
      setFirstNameError("");
    }

    // Username validation
    if (!username || username.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      isValid = false;
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setUsernameError("Username can only contain letters, numbers, and underscores");
      isValid = false;
    } else if (usernameAvailable !== true) {
      if (usernameAvailable === false) {
        setUsernameError("Username is already taken");
      } else {
        setUsernameError("Please wait while we check username availability");
      }
      isValid = false;
    }

    // Struggle area validation
    if (!struggleArea) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please select what technique you struggle with most",
      });
      isValid = false;
    }

    // Training focus validation
    if (!trainingFocus) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please select your primary training style",
      });
      isValid = false;
    }

    // Password validation
    if (!password || password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      isValid = false;
    } else {
      setPasswordError("");
    }

    // Confirm password validation
    if (password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match");
      isValid = false;
    } else {
      setConfirmPasswordError("");
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (usernameAvailable === false) {
      toast({
        variant: "destructive",
        title: "Username Taken",
        description: "Please choose a different username",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest("POST", "/api/auth/signup-with-lifetime-invite", {
        token,
        firstName: firstName.trim(),
        username: username.trim(),
        password,
        struggleArea,
        trainingFocus,
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Welcome to BJJ OS!",
          description: "Your lifetime access account has been created successfully.",
        });
        
        // Store the token
        localStorage.setItem('sessionToken', data.token);
        
        // Redirect to lifetime welcome page
        setTimeout(() => {
          setLocation('/welcome/lifetime');
        }, 1000);
      } else {
        toast({
          variant: "destructive",
          title: "Signup Failed",
          description: data.error || "Failed to create your account. Please try again.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create account",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (tokenChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Validating your invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid token state
  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid or has expired. Please contact support if you believe this is an error.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => setLocation('/')}
              data-testid="button-back-home"
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Signup form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Activate Lifetime Access</CardTitle>
          <CardDescription>
            Complete your signup to get lifetime access to BJJ OS - free forever.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" data-testid="label-email">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={invitationEmail}
                disabled
                readOnly
                className="bg-muted"
                data-testid="input-email"
              />
              <p className="text-xs text-muted-foreground">
                This email is from your invitation
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="firstName" data-testid="label-first-name">
                First Name *
              </Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                required
                data-testid="input-first-name"
              />
              {firstNameError && (
                <p className="text-sm text-destructive">{firstNameError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" data-testid="label-username">
                Username *
              </Label>
              <div className="relative">
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value.toLowerCase());
                    setUsernameAvailable(null); // Reset availability while checking
                    setUsernameError("");
                  }}
                  placeholder="johndoe"
                  required
                  data-testid="input-username"
                />
                {isValidatingUsername && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {!isValidatingUsername && usernameAvailable === true && username.length >= 3 && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                )}
                {!isValidatingUsername && usernameAvailable === false && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                )}
              </div>
              {usernameError && (
                <p className="text-sm text-destructive">{usernameError}</p>
              )}
              {!usernameError && username.length >= 3 && usernameAvailable === true && (
                <p className="text-sm text-green-600">Username is available</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                What technique do you struggle with most? *
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                This helps Professor OS give you personalized guidance
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={struggleArea === "guard_passing" ? "default" : "outline"}
                  className="h-auto py-3"
                  onClick={() => setStruggleArea("guard_passing")}
                  data-testid="button-struggle-guard-passing"
                >
                  Guard Passing
                </Button>
                <Button
                  type="button"
                  variant={struggleArea === "guard_retention" ? "default" : "outline"}
                  className="h-auto py-3"
                  onClick={() => setStruggleArea("guard_retention")}
                  data-testid="button-struggle-guard-retention"
                >
                  Guard Retention
                </Button>
                <Button
                  type="button"
                  variant={struggleArea === "takedowns" ? "default" : "outline"}
                  className="h-auto py-3"
                  onClick={() => setStruggleArea("takedowns")}
                  data-testid="button-struggle-takedowns"
                >
                  Takedowns
                </Button>
                <Button
                  type="button"
                  variant={struggleArea === "submissions" ? "default" : "outline"}
                  className="h-auto py-3"
                  onClick={() => setStruggleArea("submissions")}
                  data-testid="button-struggle-submissions"
                >
                  Submissions
                </Button>
                <Button
                  type="button"
                  variant={struggleArea === "escapes" ? "default" : "outline"}
                  className="h-auto py-3"
                  onClick={() => setStruggleArea("escapes")}
                  data-testid="button-struggle-escapes"
                >
                  Escapes
                </Button>
                <Button
                  type="button"
                  variant={struggleArea === "transitions" ? "default" : "outline"}
                  className="h-auto py-3"
                  onClick={() => setStruggleArea("transitions")}
                  data-testid="button-struggle-transitions"
                >
                  Transitions
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                What do you primarily train? *
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={trainingFocus === "gi" ? "default" : "outline"}
                  className="h-auto py-3"
                  onClick={() => setTrainingFocus("gi")}
                  data-testid="button-training-gi"
                >
                  Gi
                </Button>
                <Button
                  type="button"
                  variant={trainingFocus === "nogi" ? "default" : "outline"}
                  className="h-auto py-3"
                  onClick={() => setTrainingFocus("nogi")}
                  data-testid="button-training-nogi"
                >
                  No-Gi
                </Button>
                <Button
                  type="button"
                  variant={trainingFocus === "both" ? "default" : "outline"}
                  className="h-auto py-3"
                  onClick={() => setTrainingFocus("both")}
                  data-testid="button-training-both"
                >
                  Both
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" data-testid="label-password">
                Password *
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                data-testid="input-password"
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" data-testid="label-confirm-password">
                Confirm Password *
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                data-testid="input-confirm-password"
              />
              {confirmPasswordError && (
                <p className="text-sm text-destructive">{confirmPasswordError}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || usernameAvailable !== true || isValidatingUsername || !struggleArea || !trainingFocus}
              data-testid="button-activate-lifetime-access"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Your Account...
                </>
              ) : (
                'Activate Lifetime Access'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
