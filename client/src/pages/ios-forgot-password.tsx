import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/capacitorAuth";
import { triggerHaptic } from "@/lib/haptics";
import { Loader2, ArrowLeft } from "lucide-react";
import "@/styles/mobile.css";

export default function IOSForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    triggerHaptic('light');

    if (!email || !email.includes('@')) {
      setError("Please enter a valid email address");
      triggerHaptic('error');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send reset code");
        triggerHaptic('error');
        return;
      }

      triggerHaptic('success');
      
      toast({
        title: "Code sent!",
        description: "Check your email for the reset code",
      });

      setLocation(`/ios-verify-reset?email=${encodeURIComponent(email.toLowerCase().trim())}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      triggerHaptic('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-6 ios-safe-area">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src="/bjjos-logo.png" alt="BJJ OS" className="h-12 w-auto mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-2">Reset Password</h1>
          <p className="text-gray-400 text-sm">
            Enter your email and we'll send you a code to reset your password.
          </p>
        </div>

        <form onSubmit={handleSendCode} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 bg-[#1A1A1B] border-[#2A2A2B] text-white placeholder:text-gray-500 rounded-lg"
              autoComplete="email"
              autoCapitalize="none"
              data-testid="input-email"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center" data-testid="text-error">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-white text-black font-semibold hover:bg-gray-200 rounded-lg"
            data-testid="button-send-code"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Send Reset Code"
            )}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setLocation('/ios-login');
            }}
            className="text-gray-400 text-sm hover:text-white transition-colors inline-flex items-center gap-2"
            data-testid="link-back-to-login"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
