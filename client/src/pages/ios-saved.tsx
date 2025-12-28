import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { Bookmark, Search, Loader2, Play, X } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { Browser } from '@capacitor/browser';
import { isNativeApp } from "@/lib/capacitorAuth";

interface SavedVideo {
  id: number;
  title: string;
  instructor: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration?: string;
  category?: string;
}

export default function IOSSavedPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  const { data: savedData, isLoading } = useQuery<{ videos: SavedVideo[] }>({
    queryKey: [`/api/ai/saved-videos/${user?.id}`],
    enabled: !!user?.id,
  });

  const savedVideos = savedData?.videos || [];

  const extractVideoId = (url: string) => {
    if (!url) return '';
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    return match ? match[1] : '';
  };

  const filteredVideos = savedVideos.filter(video => {
    if (!searchQuery) return true;
    return video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
           video.instructor?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleVideoPress = async (videoUrl: string) => {
    triggerHaptic('light');
    if (isNativeApp()) {
      await Browser.open({ url: videoUrl });
    } else {
      window.open(videoUrl, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div 
        className="ios-page"
        style={{
          minHeight: '100vh',
          background: '#0A0A0B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Loader2 className="animate-spin" size={32} color="#8B5CF6" />
        <IOSBottomNav />
      </div>
    );
  }

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
        }}>
          Saved Videos
        </h1>
        <p style={{ 
          color: '#71717A', 
          fontSize: '14px',
          marginTop: '4px',
        }}>
          {savedVideos.length} videos saved
        </p>
      </div>

      {/* Search */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#1A1A1D',
          borderRadius: '12px',
          padding: '12px 16px',
          border: '1px solid #2A2A2E',
        }}>
          <Search size={20} color="#71717A" />
          <input
            type="text"
            placeholder="Search saved videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-saved"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '16px',
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              data-testid="button-clear-search"
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
              }}
            >
              <X size={20} color="#71717A" />
            </button>
          )}
        </div>
      </div>

      {/* Videos */}
      <div style={{ padding: '0 20px' }}>
        {filteredVideos.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            textAlign: 'center',
          }}>
            <Bookmark size={48} color="#3F3F46" />
            <h3 style={{ 
              color: '#71717A', 
              fontSize: '18px',
              fontWeight: 600,
              marginTop: '16px',
            }}>
              {searchQuery ? 'No videos found' : 'No saved videos yet'}
            </h3>
            <p style={{ 
              color: '#52525B', 
              fontSize: '14px',
              marginTop: '8px',
            }}>
              {searchQuery 
                ? 'Try a different search term' 
                : 'Save videos from Professor OS to watch later'}
            </p>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            {filteredVideos.map((video) => {
              const videoId = extractVideoId(video.videoUrl);
              const thumbnail = video.thumbnailUrl || (videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '');
              
              return (
                <button
                  key={video.id}
                  onClick={() => handleVideoPress(video.videoUrl)}
                  data-testid={`video-card-${video.id}`}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    background: '#1A1A1D',
                    borderRadius: '16px',
                    padding: '12px',
                    border: '1px solid #2A2A2E',
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
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: '#2A2A2E',
                    position: 'relative',
                  }}>
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={video.title}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Play size={24} color="#71717A" />
                      </div>
                    )}
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
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    minWidth: 0,
                  }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#FFFFFF',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {video.title}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#71717A',
                    }}>
                      {video.instructor}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <IOSBottomNav />
    </div>
  );
}
