import { useState, useRef, useEffect } from "react";
import { Volume2, Loader2 } from "lucide-react";

interface VoicePlayerProps {
  text: string;
  userId: string;
  voiceSpeed?: number;
  autoplay?: boolean;
}

export function VoicePlayer({ text, userId, voiceSpeed = 1.0, autoplay = true }: VoicePlayerProps) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasPlayed = useRef(false);

  useEffect(() => {
    if (!text || !autoplay || hasPlayed.current) return;

    // Generate and play audio
    const generateAndPlay = async () => {
      setLoading(true);
      setError(false);

      try {
        const response = await fetch('/api/voice/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, userId, speed: voiceSpeed }),
        });

        if (!response.ok) {
          throw new Error('Failed to generate voice');
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.playbackRate = voiceSpeed;
          
          await audioRef.current.play();
          setPlaying(true);
          hasPlayed.current = true;
        }
      } catch (err) {
        console.error('Voice playback error:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    generateAndPlay();
  }, [text, userId, voiceSpeed, autoplay]);

  const handleEnded = () => {
    setPlaying(false);
  };

  if (error) {
    return null; // Silently fail - text is still visible
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
      {loading && (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Generating voice...</span>
        </>
      )}
      {playing && (
        <>
          <Volume2 className="w-4 h-4 animate-pulse" />
          <span>Playing...</span>
        </>
      )}
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        className="hidden"
      />
    </div>
  );
}
