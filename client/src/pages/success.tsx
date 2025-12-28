import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Success() {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState<string>("");
  const [isNewSignup, setIsNewSignup] = useState(false);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email');
    
    if (email) {
      setIsNewSignup(true);
      setMessage(`Your account for ${email} is being created. You can now log in!`);
    }
  }, []);

  const handleContinue = () => {
    if (isNewSignup) {
      setLocation('/login');
    } else {
      setLocation('/chat');
    }
  };

  if (isNewSignup) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="mb-8 flex justify-center">
            <CheckCircle className="w-20 h-20 text-green-500" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Payment Successful!
          </h1>
          <p className="text-white/70 text-lg mb-8">
            {message}
          </p>
          <Button
            onClick={handleContinue}
            className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 text-lg"
            data-testid="button-continue-login"
          >
            Continue to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-8xl mb-8">📱</div>
        <h1 className="text-4xl md:text-6xl font-bold text-white">Check your phone.</h1>
      </div>
    </div>
  );
}
