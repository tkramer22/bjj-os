import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { Search, Play, BookmarkCheck, Loader2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface VideoApiResponse {
  id: number;
  videoId: string;
  thumbnailUrl?: string;
  title: string;
  instructorName: string;
  techniqueType?: string;
  positionCategory?: string;
  duration?: string;
}

interface Video {
  id: number;
  title: string;
  instructor: string;
  youtubeId: string;
  thumbnail?: string;
  duration?: string;
  technique?: string;
  position?: string;
}

export default function IOSLibraryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);

  const { data: user } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: videosData, isLoading } = useQuery<{ count: number; videos: VideoApiResponse[] }>({
    queryKey: ["/api/ai/videos"],
  });

  // Transform API response to component format
  const videos: Video[] = (videosData?.videos || []).map(v => ({
    id: v.id,
    title: v.title,
    instructor: v.instructorName,
    youtubeId: v.videoId,
    thumbnail: v.thumbnailUrl || (v.videoId ? `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg` : undefined),
    duration: v.duration,
    technique: v.techniqueType,
    position: v.positionCategory,
  }));

  const { data: savedVideosData } = useQuery<{ videos: { id: string }[] }>({
    queryKey: [`/api/ai/saved-videos/${user?.id}`],
    enabled: !!user?.id,
  });

  const savedVideoIds = savedVideosData?.videos?.map(v => parseInt(v.id)) || [];

  const positions = [
    "All", "Guard", "Half Guard", "Mount", "Side Control", 
    "Back", "Turtle", "Standing"
  ];

  const filteredVideos = videos?.filter((video) => {
    const matchesSearch = !searchQuery || 
      video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.instructor.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesPosition = !selectedPosition || selectedPosition === "All" ||
      video.position?.toLowerCase().includes(selectedPosition.toLowerCase());
    
    return matchesSearch && matchesPosition;
  });

  const handleVideoPress = (videoId: string) => {
    triggerHaptic('light');
    window.open(`https://youtube.com/watch?v=${videoId}`, '_blank');
  };

  const isVideoSaved = (videoId: number) => {
    return savedVideoIds.includes(videoId);
  };

  return (
    <div 
      className="ios-page"
      style={{
        minHeight: '100vh',
        background: '#0A0A0B',
        color: '#FFFFFF',
        paddingBottom: '100px',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: '1px solid #2A2A2E',
        position: 'sticky',
        top: 0,
        background: '#0A0A0B',
        zIndex: 10,
      }}>
        <h1 style={{ 
          fontSize: '28px', 
          fontWeight: 700,
          margin: 0,
          marginBottom: '16px',
        }}>
          Technique Library
        </h1>

        {/* Search Bar */}
        <div style={{
          position: 'relative',
          marginBottom: '12px',
        }}>
          <Search 
            size={20} 
            color="#71717A"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
          <input
            type="text"
            placeholder="Search techniques or instructors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-library"
            style={{
              width: '100%',
              background: '#1A1A1D',
              border: '1px solid #2A2A2E',
              borderRadius: '12px',
              padding: '12px 12px 12px 44px',
              color: '#FFFFFF',
              fontSize: '15px',
              outline: 'none',
            }}
          />
        </div>

        {/* Position Filters */}
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          WebkitOverflowScrolling: 'touch',
        }}>
          {positions.map((position) => (
            <button
              key={position}
              onClick={() => {
                triggerHaptic('light');
                setSelectedPosition(position === "All" ? null : position);
              }}
              data-testid={`filter-${position.toLowerCase().replace(' ', '-')}`}
              style={{
                background: (selectedPosition === position || (!selectedPosition && position === "All")) 
                  ? '#8B5CF6' 
                  : '#1A1A1D',
                border: '1px solid #2A2A2E',
                borderRadius: '20px',
                padding: '8px 16px',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {position}
            </button>
          ))}
        </div>
      </div>

      {/* Video List */}
      <div style={{ padding: '16px 20px' }}>
        {isLoading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '40px',
          }}>
            <Loader2 className="animate-spin" size={32} color="#8B5CF6" />
          </div>
        ) : filteredVideos?.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#71717A',
          }}>
            <p>No videos found</p>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>
              Try a different search term
            </p>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {filteredVideos?.map((video) => (
              <button
                key={video.id}
                onClick={() => handleVideoPress(video.youtubeId)}
                onTouchEnd={() => handleVideoPress(video.youtubeId)}
                data-testid={`video-card-${video.id}`}
                style={{
                  background: '#1A1A1D',
                  border: '1px solid #2A2A2E',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'flex',
                  gap: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                {/* Thumbnail */}
                <div style={{
                  width: '120px',
                  height: '68px',
                  borderRadius: '8px',
                  background: '#2A2A2E',
                  flexShrink: 0,
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {video.thumbnail || video.youtubeId ? (
                    <img
                      src={video.thumbnail || `https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
                      alt={video.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : null}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.3)',
                  }}>
                    <Play size={24} color="#FFFFFF" fill="#FFFFFF" />
                  </div>
                  {video.duration && (
                    <div style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '4px',
                      background: 'rgba(0,0,0,0.8)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#FFFFFF',
                    }}>
                      {video.duration}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {video.title}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: '#8B5CF6',
                    marginTop: '4px',
                  }}>
                    {video.instructor}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '8px',
                  }}>
                    {video.technique && (
                      <span style={{
                        fontSize: '11px',
                        color: '#71717A',
                        background: '#2A2A2E',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}>
                        {video.technique}
                      </span>
                    )}
                    {isVideoSaved(video.id) && (
                      <BookmarkCheck size={14} color="#22C55E" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <IOSBottomNav />
    </div>
  );
}
