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
// Supports TWO formats:
// 1. Enriched: [VIDEO: title | instructor | duration | videoId | id | startTime]
// 2. Unenriched: [VIDEO: Title by Instructor | START: MM:SS] or [VIDEO: Title (Instructor)]
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
        const tokenContent = match[1];
        const videoData = tokenContent.split('|').map(s => s.trim());
        
        // FORMAT 1: Enriched format with 5+ pipe-separated fields
        // [VIDEO: title | instructor | duration | videoId | id | startTime]
        if (videoData.length >= 5) {
          const videoObj = {
            title: videoData[0],
            instructor: videoData[1],
            duration: videoData[2],
            videoId: videoData[3],
            id: parseInt(videoData[4], 10),
            startTime: videoData[5] || undefined
          };
          
          if (videoObj.title && videoObj.instructor && videoObj.videoId && !isNaN(videoObj.id)) {
            segments.push({ text: '', video: videoObj });
            lastIndex = match.index + match[0].length;
            continue;
          }
        }
        
        // FORMAT 2: Unenriched format - parse title/instructor from various patterns
        // Patterns: "Title by Instructor | START: MM:SS" or "Title (Instructor)" or "Title by Instructor"
        let title = '';
        let instructor = '';
        let startTime: string | undefined;
        
        // Check for START: timestamp
        const startMatch = tokenContent.match(/\|\s*START:\s*(\d{1,2}:\d{2})/i);
        if (startMatch) {
          startTime = startMatch[1];
        }
        
        // Remove START: portion for parsing
        const cleanContent = tokenContent.replace(/\|\s*START:\s*\d{1,2}:\d{2}/i, '').trim();
        
        // Try "Title by Instructor" pattern
        const byMatch = cleanContent.match(/^(.+?)\s+by\s+(.+)$/i);
        if (byMatch) {
          title = byMatch[1].trim();
          instructor = byMatch[2].trim();
        } else {
          // Try "Title (Instructor)" pattern
          const parenMatch = cleanContent.match(/^(.+?)\s*\(([^)]+)\)$/);
          if (parenMatch) {
            title = parenMatch[1].trim();
            instructor = parenMatch[2].trim();
          } else {
            // Fallback: use entire content as title
            title = cleanContent;
            instructor = 'BJJ Instructor';
          }
        }
        
        // Create a video object for unenriched tokens (with placeholder videoId)
        // These will show a search prompt instead of thumbnail since we don't have the videoId
        // Use stable hash-based ID from title+instructor to prevent re-renders
        if (title) {
          const stableId = Math.abs((title + instructor).split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
          }, 0));
          segments.push({
            text: '',
            video: {
              id: stableId, // Stable ID based on content hash
              title: title,
              instructor: instructor,
              duration: startTime || 'Watch',
              videoId: '', // Empty - will trigger search fallback
              startTime: startTime
            }
          });
        } else {
          segments.push({ text: match[0] });
        }
        
        lastIndex = match.index + match[0].length;
      } catch (parseError) {
        console.error('❌ Error parsing individual video token:', parseError);
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
                {/* Show thumbnail for enriched videos, search prompt for unenriched */}
                {segment.video.videoId ? (
                  <div style={{ position: "relative" }}>
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
                      <ThumbnailImage
                        videoId={segment.video.videoId}
                        title={segment.video.title}
                      />
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
                ) : (
                  /* Unenriched video - show search on YouTube button */
                  <button
                    onClick={() => {
                      const searchQuery = encodeURIComponent(`${segment.video!.title} ${segment.video!.instructor} BJJ`);
                      window.open(`https://www.youtube.com/results?search_query=${searchQuery}`, '_blank');
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      cursor: "pointer",
                      padding: "1.5rem 1rem",
                      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem"
                    }}
                    data-testid={`button-search-video-${segment.video.id}`}
                    title="Search on YouTube"
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="#FF0000">
                      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 3.993L9 16z"/>
                    </svg>
                    <span style={{ fontSize: "0.75rem", color: "#A78BFA" }}>
                      Search on YouTube
                    </span>
                  </button>
                )}
                <div style={{ padding: "0.75rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <div 
                    onClick={() => {
                      if (segment.video!.videoId) {
                        setCurrentVideo({ 
                          videoId: segment.video!.videoId, 
                          title: segment.video!.title, 
                          instructor: segment.video!.instructor,
                          startTime: segment.video!.startTime 
                        });
                      } else {
                        const searchQuery = encodeURIComponent(`${segment.video!.title} ${segment.video!.instructor} BJJ`);
                        window.open(`https://www.youtube.com/results?search_query=${searchQuery}`, '_blank');
                      }
                    }}
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
                      {segment.video.instructor}
                      {segment.video.videoId && ` • ${segment.video.duration}`}
                      {segment.video.startTime && (
                        <span style={{ 
                          marginLeft: "0.5rem", 
                          color: "#667eea",
                          fontWeight: "600"
                        }}>
                          @ {segment.video.startTime}
                        </span>
                      )}
                    </p>
                  </div>
                  {/* Only show bookmark for enriched videos */}
                  {segment.video.videoId && (
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
                  )}
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
