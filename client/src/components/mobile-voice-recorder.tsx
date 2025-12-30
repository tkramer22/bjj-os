import { Mic, Square, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { getApiUrl, getAuthToken } from "@/lib/capacitorAuth";

interface MobileVoiceRecorderProps {
  onTranscriptionComplete?: (transcript: string) => void;
  disabled?: boolean;
}

export function MobileVoiceRecorder({ onTranscriptionComplete, disabled }: MobileVoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const cleanupResources = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevels([0, 0, 0, 0, 0, 0, 0, 0]);
  };

  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];
      setRecordingDuration(0);

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 32;
      source.connect(analyser);
      analyserRef.current = analyser;

      const visualize = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const levels = Array.from(dataArray.slice(0, 8)).map(v => (v / 255) * 100);
        setAudioLevels(levels);
        animationFrameRef.current = requestAnimationFrame(visualize);
      };
      visualize();

      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const chunks = [...audioChunksRef.current];
        cleanupResources();

        if (chunks.length > 0) {
          const audioBlob = new Blob(chunks, { type: mimeType });
          await transcribeAudio(audioBlob);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);

    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const transcribeUrl = getApiUrl('/api/voice/transcribe');
      const authToken = await getAuthToken();
      
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(transcribeUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.text && result.text.trim()) {
        onTranscriptionComplete?.(result.text.trim());
      }

    } catch (error) {
      console.error('Transcription error:', error);
    } finally {
      setIsTranscribing(false);
      setRecordingDuration(0);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isTranscribing) {
    return (
      <div className="mobile-voice-recorder" data-testid="voice-transcribing">
        <div className="flex items-center gap-3 px-3 py-2">
          <Loader2 className="animate-spin" size={20} color="var(--mobile-primary)" />
          <span style={{ 
            fontSize: "0.875rem", 
            color: "var(--mobile-text-secondary)",
          }}>
            Transcribing...
          </span>
        </div>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="mobile-voice-recorder" data-testid="voice-recorder">
        <div className="flex items-center gap-3 w-full">
          <button
            onClick={stopRecording}
            className="mobile-btn-icon recording-pulse"
            style={{ 
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--mobile-error-red)',
            }}
            data-testid="button-stop-recording"
          >
            <Square size={18} fill="currentColor" />
          </button>
          
          <div className="mobile-voice-wave flex-1">
            {audioLevels.map((level, index) => (
              <div
                key={index}
                className="mobile-voice-bar"
                style={{ height: `${Math.max(15, level)}%` }}
              />
            ))}
          </div>
          
          <span style={{ 
            fontSize: "0.875rem", 
            color: "var(--mobile-error-red)",
            fontFamily: "monospace",
            minWidth: "40px",
          }}>
            {formatDuration(recordingDuration)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={startRecording}
      disabled={disabled}
      className="mobile-btn-icon"
      style={{ opacity: disabled ? 0.5 : 1 }}
      data-testid="button-start-recording"
    >
      <Mic size={20} />
    </button>
  );
}
