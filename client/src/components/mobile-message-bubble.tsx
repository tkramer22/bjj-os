import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ThumbnailImage } from "@/components/ThumbnailImage";
import { formatMessageTimestamp } from "@/lib/timestamps";

interface MessageBubbleProps {
  message: string;
  sender: "user" | "assistant";
  timestamp: Date;
  videos?: any[];
}

// Helper function to parse [VIDEO:...] tokens from message content
// CRITICAL: This function MUST NOT throw errors - graceful degradation only
function parseVideoTokens(content: string): { text: string; video?: { id: number; title: string; instructor: string; duration: string; videoId: string; startTime?: string } }[] {
  try {
    const segments: { text: string; video?: { id: number; title: string; instructor: string; duration: string; videoId: string; startTime?: string } }[] = [];
    const videoRegex = /\[VIDEO:\s*([^\]]+)\]/g;
    
    let lastIndex = 0;
    let match;
    
    while ((match = videoRegex.exec(content)) !== null) {
      try {
        // Add text before the video token
        if (match.index > lastIndex) {
          segments.push({ text: content.slice(lastIndex, match.index) });
        }
        
        // Parse video data from token
        // Format: [VIDEO: title | instructor | duration | videoId | id | startTime]
        const videoData = match[1].split('|').map(s => s.trim());
        
        if (videoData.length >= 5) {
          const videoObj = {
            title: videoData[0],
            instructor: videoData[1],
            duration: videoData[2],
            videoId: videoData[3],
            id: parseInt(videoData[4], 10),
            startTime: videoData[5] || undefined // Optional timestamp (MM:SS)
          };
          
          // Validate parsed data
          if (videoObj.title && videoObj.instructor && videoObj.videoId && !isNaN(videoObj.id)) {
            segments.push({
              text: '',
              video: videoObj
            });
          } else {
            console.warn('⚠️ Video token data incomplete, skipping');
            // Add as plain text instead of crashing
            segments.push({ text: match[0] });
          }
        } else {
          console.warn(`⚠️ Video token has insufficient data parts: ${videoData.length}, expected >= 5`);
          // Add as plain text instead of crashing
          segments.push({ text: match[0] });
        }
        
        lastIndex = match.index + match[0].length;
      } catch (parseError) {
        console.error('❌ Error parsing individual video token:', parseError);
        // Don't crash - just add the token as plain text
        segments.push({ text: match[0] });
        lastIndex = match.index + match[0].length;
      }
    }
    
    // Add remaining text
    if (lastIndex < content.length) {
      segments.push({ text: content.slice(lastIndex) });
    }
    
    return segments.length > 0 ? segments : [{ text: content }];
  } catch (error) {
    console.error('❌ CRITICAL: Video parsing failed completely, returning plain text:', error);
    // Ultimate fallback - return message as plain text
    return [{ text: content }];
  }
}

export function MobileMessageBubble({ message, sender, timestamp }: MessageBubbleProps) {
  const [savedVideoIds, setSavedVideoIds] = useState<Set<number>>(new Set());
  const [currentVideo, setCurrentVideo] = useState<{ videoId: string; title: string; instructor: string; startTime?: string } | null>(null);
  const { toast } = useToast();
  const userId = localStorage.getItem('mobileUserId') || '1';


  const toggleSaveVideo = async (videoId: number) => {
    const isSaved = savedVideoIds.has(videoId);
    
    try {
      if (isSaved) {
        await apiRequest("DELETE", `/api/ai/saved-videos/${videoId}`, { userId: parseInt(userId) });
        setSavedVideoIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(videoId);
          return newSet;
        });
        toast({
          title: "Video removed",
          description: "Video removed from saved videos",
        });
      } else {
        await apiRequest("POST", "/api/ai/saved-videos", {
          userId: parseInt(userId),
          videoId: String(videoId),
        });
        setSavedVideoIds(prev => new Set(prev).add(videoId));
        toast({
          title: "Video saved",
          description: "Video added to your saved videos",
        });
      }
    } catch (error) {
      console.error('Save video error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save video. Please try again.",
      });
    }
  };

  const segments = parseVideoTokens(message || '');

  return (
    <div className={`mobile-message-bubble ${sender}`} data-testid={`message-${sender}`}>
      {segments.map((segment, index) => (
        <div key={index}>
          {segment.text && <p style={{ marginBottom: "0.5rem", whiteSpace: "pre-line" }}>{segment.text}</p>}
          {segment.video && (
            <div style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ 
                backgroundColor: "var(--mobile-surface)", 
                borderRadius: "0.75rem", 
                overflow: "hidden",
                border: "1px solid var(--mobile-border)"
              }}>
                <div style={{ position: "relative" }}>
                  {/* YouTube Thumbnail */}
                  <button
                    onClick={() => setCurrentVideo({ 
                      videoId: segment.video!.videoId, 
                      title: segment.video!.title, 
                      instructor: segment.video!.instructor,
                      startTime: segment.video!.startTime 
                    })}
                    style={{
                      width: "100%",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      background: "#000",
                      overflow: "hidden",
                      position: "relative"
                    }}
                    data-testid={`button-play-video-${segment.video.id}`}
                    title="Play video"
                  >
                    {/* Thumbnail with robust fallback chain */}
                    <ThumbnailImage
                      videoId={segment.video.videoId}
                      title={segment.video.title}
                    />
                    {/* Play button overlay */}
                    <div style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      width: "3.5rem",
                      height: "3.5rem",
                      background: "rgba(102, 126, 234, 0.95)",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
                      zIndex: 10
                    }}>
                      <svg width="24" height="24" viewBox="0 0 16 16" fill="white">
                        <path d="M6.79 5.093A.5.5 0 0 0 6 5.5v5a.5.5 0 0 0 .79.407l3.5-2.5a.5.5 0 0 0 0-.814l-3.5-2.5z"/>
                      </svg>
                    </div>
                  </button>
                </div>
                <div style={{ padding: "0.75rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <div 
                    onClick={() => setCurrentVideo({ 
                      videoId: segment.video!.videoId, 
                      title: segment.video!.title, 
                      instructor: segment.video!.instructor,
                      startTime: segment.video!.startTime 
                    })}
                    style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                  >
                    <p style={{ 
                      fontWeight: "600", 
                      fontSize: "0.875rem",
                      marginBottom: "0.25rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {segment.video.title}
                    </p>
                    <p style={{ 
                      fontSize: "0.75rem", 
                      color: "var(--mobile-text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {segment.video.instructor} • {segment.video.duration}
                      {segment.video.startTime && (
                        <span style={{ 
                          marginLeft: "0.5rem", 
                          color: "#667eea",
                          fontWeight: "600"
                        }}>
                          ▶ {segment.video.startTime}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleSaveVideo(segment.video!.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "0.5rem",
                      cursor: "pointer",
                      color: savedVideoIds.has(segment.video.id) ? "#667eea" : "var(--mobile-text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                    data-testid={`button-save-video-${segment.video.id}`}
                    title={savedVideoIds.has(segment.video.id) ? "Remove from saved" : "Save video"}
                  >
                    {savedVideoIds.has(segment.video.id) ? (
                      <BookmarkCheck size={20} />
                    ) : (
                      <Bookmark size={20} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      <span 
        style={{ 
          fontSize: "0.75rem", 
          opacity: 0.85,
          display: "block",
          marginTop: "0.5rem"
        }}
      >
        {formatMessageTimestamp(timestamp)}
      </span>

      {/* Video Player Modal */}
      {currentVideo && (
        <VideoPlayer
          videoId={currentVideo.videoId}
          title={currentVideo.title}
          instructor={currentVideo.instructor}
          startTime={currentVideo.startTime}
          onClose={() => setCurrentVideo(null)}
        />
      )}
    </div>
  );
}
