import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/capacitorAuth";
import { triggerHaptic } from "@/lib/haptics";
import { Loader2, ArrowLeft } from "lucide-react";
import "@/styles/mobile.css";

export default function IOSVerifyResetPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  
  const params = new URLSearchParams(search);
  const email = params.get('email') || '';
  
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) {
      setLocation('/ios-forgot-password');
    }
  }, [email, setLocation]);

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }
    
    if (!/^\d*$/.test(value)) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      setCode(pastedData.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    triggerHaptic('light');

    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setError("Please enter the 6-digit code");
      triggerHaptic('error');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl('/api/auth/verify-reset-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code: fullCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid or expired code");
        triggerHaptic('error');
        return;
      }

      triggerHaptic('success');
      setLocation(`/ios-reset-password?email=${encodeURIComponent(email)}&code=${fullCode}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      triggerHaptic('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsResending(true);
    triggerHaptic('light');
    
    try {
      const response = await fetch(getApiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        toast({
          title: "Code resent!",
          description: "Check your email for the new code",
        });
        triggerHaptic('success');
      }
    } catch (err) {
      toast({
        title: "Failed to resend",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-6 ios-safe-area">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src="/bjjos-logo.png" alt="BJJ OS" className="h-12 w-auto mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-2">Enter Code</h1>
          <p className="text-gray-400 text-sm">
            We sent a 6-digit code to your email.
          </p>
        </div>

        <form onSubmit={handleVerifyCode} className="space-y-6">
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 text-center text-2xl font-bold bg-[#1A1A1B] border border-[#2A2A2B] text-white rounded-lg focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                data-testid={`input-code-${index}`}
              />
            ))}
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
            data-testid="button-verify-code"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Verify Code"
            )}
          </Button>
        </form>

        <div className="text-center space-y-4">
          <button
            type="button"
            onClick={handleResendCode}
            disabled={isResending}
            className="text-gray-400 text-sm hover:text-white transition-colors"
            data-testid="button-resend-code"
          >
            {isResending ? "Sending..." : "Didn't receive it? Send again"}
          </button>

          <div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setLocation('/ios-forgot-password');
              }}
              className="text-gray-400 text-sm hover:text-white transition-colors inline-flex items-center gap-2"
              data-testid="link-back"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
