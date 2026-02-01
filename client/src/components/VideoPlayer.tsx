import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

interface VideoPlayerProps {
  videoId: string;
  startTime?: number | string;
  title: string;
  instructor: string;
  onClose: () => void;
}

function parseTimeToSeconds(time: number | string | undefined): number {
  if (!time) return 0;
  if (typeof time === 'number') return time;
  
  const parts = time.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

export function VideoPlayer({
  videoId,
  startTime = 0,
  title,
  instructor,
  onClose
}: VideoPlayerProps) {
  const startSeconds = parseTimeToSeconds(startTime);
  const isNative = Capacitor.isNativePlatform();
  const [iframeError, setIframeError] = useState(false);
  
  // Validate YouTube ID (must be 11 alphanumeric chars)
  const isValidYoutubeId = videoId && videoId.length === 11 && /^[a-zA-Z0-9_-]+$/.test(videoId);
  
  // On iOS/native, use the proxy page to handle referrer headers properly
  // On web, use direct YouTube embed
  // CRITICAL: Only append start parameter if > 0 (0 can cause playback issues)
  const startParam = startSeconds > 0 ? `&start=${startSeconds}` : '';
  const embedUrl = isNative
    ? `/youtube-proxy.html?v=${videoId}${startSeconds > 0 ? `&start=${startSeconds}` : ''}`
    : `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1&playsinline=1${startParam}`;
  
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}${startSeconds > 0 ? `&t=${startSeconds}s` : ''}`;
  
  const openInBrowser = async () => {
    try {
      await Browser.open({ url: youtubeUrl });
      onClose();
    } catch (error) {
      console.error('Failed to open browser:', error);
      window.open(youtubeUrl, '_blank');
    }
  };
  
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  
  const handleBackdropClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };
  
  const handleIframeError = () => {
    // Auto-close modal when embedding fails - don't show "Open in YouTube"
    console.log(`[VIDEO] Embedding failed for ${videoId} - closing modal`);
    setIframeError(true);
    onClose(); // Close immediately - user never sees error state
  };

  return (
    <div 
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      data-testid="video-player-modal"
      onClick={handleBackdropClick}
      onTouchEnd={handleBackdropClick}
    >
      <div className="w-full max-w-4xl">
        <div className="bg-sidebar p-4 rounded-t-lg flex justify-between items-center gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-foreground font-semibold truncate" data-testid="video-player-title">{title}</h3>
            <p className="text-muted-foreground text-sm truncate" data-testid="video-player-instructor">{instructor}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-video"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
        
        <div className="relative bg-black" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute top-0 left-0 w-full h-full"
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onError={handleIframeError}
            data-testid="video-iframe"
          />
        </div>
      </div>
    </div>
  );
}
