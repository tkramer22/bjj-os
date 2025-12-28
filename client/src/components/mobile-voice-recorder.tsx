import { Mic, StopCircle, Send } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface MobileVoiceRecorderProps {
  onRecordingComplete?: (transcript: string) => void;
}

export function MobileVoiceRecorder({ onRecordingComplete }: MobileVoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioLevels, setAudioLevels] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>("");

  useEffect(() => {
    // Initialize Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const result = event.results[event.results.length - 1];
        const transcriptText = result[0].transcript;
        transcriptRef.current = transcriptText;
        setTranscript(transcriptText);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
        const currentTranscript = transcriptRef.current;
        if (currentTranscript.trim()) {
          onRecordingComplete?.(currentTranscript);
        }
        transcriptRef.current = "";
        setTranscript("");
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        transcriptRef.current = "";
        setTranscript("");
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []); // Empty dependency array - only initialize once

  useEffect(() => {
    if (isRecording) {
      // Simulate audio levels for visual feedback
      const levelInterval = setInterval(() => {
        setAudioLevels(prev => 
          prev.map(() => Math.random() * 100)
        );
      }, 100);

      return () => {
        clearInterval(levelInterval);
      };
    } else {
      setAudioLevels([0, 0, 0, 0, 0, 0, 0, 0]);
    }
  }, [isRecording]);

  const startRecording = async () => {
    if (recognitionRef.current) {
      try {
        setTranscript("");
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    } else {
      console.error('Speech recognition not supported');
      alert('Speech recognition is not supported in this browser. Please use Chrome or Safari.');
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  };

  if (!isRecording) {
    return (
      <button
        onClick={startRecording}
        className="mobile-btn-icon"
        data-testid="button-start-recording"
      >
        <Mic />
      </button>
    );
  }

  return (
    <div className="mobile-voice-recorder" data-testid="voice-recorder">
      <button
        onClick={stopRecording}
        className="mobile-btn-icon"
        data-testid="button-stop-recording"
      >
        <StopCircle color="var(--mobile-error-red)" />
      </button>
      
      <div className="mobile-voice-wave">
        {audioLevels.map((level, index) => (
          <div
            key={index}
            className="mobile-voice-bar"
            style={{ height: `${Math.max(20, level)}%` }}
          />
        ))}
      </div>
      
      <span style={{ 
        fontSize: "0.875rem", 
        color: "var(--mobile-text-secondary)",
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }}>
        {transcript || "Listening..."}
      </span>
      
      <button
        onClick={stopRecording}
        className="mobile-btn-primary"
        style={{ padding: "0.5rem 1rem", fontSize: "0.875rem" }}
        data-testid="button-send-recording"
      >
        <Send size={16} />
      </button>
    </div>
  );
}
