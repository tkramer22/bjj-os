import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function AuthMagic() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyMagicLink = async () => {
      try {
        // Get token from URL
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');

        if (!token) {
          setStatus('error');
          setMessage('Invalid magic link - no token provided');
          return;
        }

        // Verify magic link with backend
        const response = await fetch(`/api/auth/magic/verify?token=${token}`);
        const data = await response.json();

        if (!response.ok) {
          setStatus('error');
          setMessage(data.error || 'Magic link verification failed');
          return;
        }

        // Store JWT token
        localStorage.setItem('token', data.token);
        
        // Success!
        setStatus('success');
        setMessage('Welcome! Redirecting to your dashboard...');

        // Redirect to chat page after 2 seconds
        setTimeout(() => {
          setLocation('/chat');
        }, 2000);

      } catch (error: any) {
        console.error('Magic link error:', error);
        setStatus('error');
        setMessage('Something went wrong. Please try again or contact support.');
      }
    };

    verifyMagicLink();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md p-8">
        <div className="text-center space-y-6">
          {status === 'loading' && (
            <>
              <Loader2 className="w-16 h-16 mx-auto animate-spin text-purple-600" />
              <h2 className="text-2xl font-bold">Verifying Your Access...</h2>
              <p className="text-muted-foreground">
                Please wait while we set up your account
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 className="w-16 h-16 mx-auto text-green-600" />
              <h2 className="text-2xl font-bold text-green-600">Access Granted!</h2>
              <p className="text-muted-foreground">{message}</p>
              <div className="animate-pulse text-sm text-muted-foreground">
                Redirecting to Prof. OS...
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="w-16 h-16 mx-auto text-red-600" />
              <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
              <p className="text-muted-foreground">{message}</p>
              <div className="space-y-2 pt-4">
                <p className="text-sm text-muted-foreground">
                  Possible reasons:
                </p>
                <ul className="text-sm text-muted-foreground text-left list-disc list-inside space-y-1">
                  <li>Link already used</li>
                  <li>Link expired (7 days max)</li>
                  <li>Invalid or corrupted link</li>
                </ul>
                <Button
                  onClick={() => setLocation('/')}
                  variant="outline"
                  className="mt-4"
                  data-testid="button-go-home"
                >
                  Go to Homepage
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
