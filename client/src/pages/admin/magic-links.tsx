import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { adminApiRequest } from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";
import { Copy, Link as LinkIcon, CheckCircle2, Send } from "lucide-react";
import { Label } from "@/components/ui/label";

export default function AdminMagicLinks() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async (phone: string) => {
      const response = await adminApiRequest('/api/admin/magic-link/generate', {
        method: 'POST',
        body: { phoneNumber: phone }
      });
      return response;
    },
    onSuccess: (data) => {
      setGeneratedLink(data.magicLink);
      toast({
        title: "Magic Link Generated!",
        description: `Link created for ${data.phoneNumber}. Expires in 7 days.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate magic link",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Phone Required",
        description: "Please enter a phone number",
        variant: "destructive",
      });
      return;
    }
    setGeneratedLink("");
    setCopied(false);
    generateMutation.mutate(phoneNumber);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast({
      title: "Copied!",
      description: "Magic link copied to clipboard",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">Magic Link Generator</h2>
          <p className="text-muted-foreground mt-1">Generate beta access links for testing</p>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone-input">Phone Number</Label>
              <div className="flex gap-2">
                <Input
                  id="phone-input"
                  type="tel"
                  placeholder="(914) 837-3750 or 9148373750"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  disabled={generateMutation.isPending}
                  data-testid="input-phone-number"
                  className="flex-1"
                />
                <Button 
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  data-testid="button-generate-link"
                >
                  {generateMutation.isPending ? (
                    <>Generating...</>
                  ) : (
                    <>
                      <LinkIcon className="w-4 h-4 mr-2" />
                      Generate Link
                    </>
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Accepts formats: (914) 837-3750, 9148373750, +19148373750
              </p>
            </div>

            {generatedLink && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Link Generated Successfully!</span>
                </div>

                <div className="space-y-2">
                  <Label>Magic Link</Label>
                  <div className="flex gap-2">
                    <Input
                      value={generatedLink}
                      readOnly
                      data-testid="text-magic-link"
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopy}
                      data-testid="button-copy-link"
                    >
                      {copied ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Next Steps
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Copy the link above</li>
                    <li>Text it to the beta tester at {phoneNumber}</li>
                    <li>They click the link → instant access + auto-login</li>
                    <li>Link expires after first use or 7 days</li>
                    <li>Grants lifetime access to the platform</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
          <div className="space-y-3">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100">How Magic Links Work</h3>
            <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
              <p><strong>For Beta Launch:</strong> No SMS verification needed - just magic links!</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Generate a unique link for each beta tester</li>
                <li>Text them the link personally</li>
                <li>They click → auto-login with lifetime access</li>
                <li>No phone verification codes needed</li>
                <li>Full control over who gets access</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
