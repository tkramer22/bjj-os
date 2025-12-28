import { useState, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface VoiceToggleProps {
  userId: string;
  onToggle?: (enabled: boolean) => void;
}

export function VoiceToggle({ userId, onToggle }: VoiceToggleProps) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Load voice settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch(`/api/user/${userId}/voice-settings`);
        if (response.ok) {
          const data = await response.json();
          setVoiceEnabled(data.voiceEnabled || false);
        }
      } catch (error) {
        console.error('Failed to load voice settings:', error);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadSettings();
    }
  }, [userId]);

  const handleToggle = async () => {
    const newValue = !voiceEnabled;
    setVoiceEnabled(newValue);

    try {
      await apiRequest('POST', `/api/user/${userId}/voice-settings`, {
        voiceEnabled: newValue,
      });

      toast({
        title: newValue ? "Voice Mode Enabled 🎤" : "Voice Mode Disabled",
        description: newValue 
          ? "Prof. OS will speak responses. Tap video to watch." 
          : "Back to text-only mode.",
      });

      onToggle?.(newValue);
    } catch (error) {
      console.error('Failed to toggle voice:', error);
      setVoiceEnabled(!newValue); // Revert on error
      
      toast({
        title: "Error",
        description: "Failed to update voice settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="w-10 h-9" />; // Placeholder while loading
  }

  return (
    <Button
      variant={voiceEnabled ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      className="gap-2"
      data-testid="button-voice-toggle"
    >
      {voiceEnabled ? (
        <>
          <Volume2 className="w-4 h-4" />
          <span className="hidden sm:inline">Voice: ON</span>
        </>
      ) : (
        <>
          <VolumeX className="w-4 h-4" />
          <span className="hidden sm:inline">Voice: OFF</span>
        </>
      )}
    </Button>
  );
}
