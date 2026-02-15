import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { VideoPlayer } from "@/components/VideoPlayer";
import { VideoAnalysisModal } from "@/components/VideoAnalysisModal";
import { Bookmark, BookmarkCheck, Search, Loader2, Play, X, ChevronDown, RefreshCw, Brain, Share2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { shareVideo } from "@/lib/share";
import { decodeHTML } from "@/lib/htmlDecode";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

console.log('✅ iOS SAVED loaded');

interface SavedVideo {
  id: number;
  title: string;
  instructor: string;
  videoUrl: string;
  youtubeId?: string;
  thumbnailUrl?: string;
  duration?: string;
  category?: string;
  techniqueType?: string;
  hasGeminiAnalysis?: boolean;
}

export default function IOSSavedPage({ hideBottomNav }: { hideBottomNav?: boolean } = {}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTechnique, setSelectedTechnique] = useState<string>("All");
  const [selectedProfessor, setSelectedProfessor] = useState<string>("All");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<{ videoId: string; title: string; instructor: string } | null>(null);
  const [analysisVideoId, setAnalysisVideoId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: number }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: savedData, isLoading, refetch } = useQuery<{ videos: SavedVideo[] }>({
    queryKey: [`/api/ai/saved-videos/${user?.id}`],
    enabled: !!user?.id,
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache (prevent stale duplicates)
  });

  const savedVideos = savedData?.videos || [];
  
  // Force refresh on mount to ensure no cached duplicates
  useEffect(() => {
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: [`/api/ai/saved-videos/${user?.id}`] });
    }
  }, [user?.id, queryClient]);

  // Unsave video mutation
  const unsaveVideoMutation = useMutation({
    mutationFn: async ({ videoId }: { videoId: number }) => {
      return apiRequest('DELETE', `/api/ai/saved-videos/${videoId}`, { userId: user?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/ai/saved-videos/${user?.id}`] });
      toast({ title: "Removed", description: "Video removed from saved" });
      triggerHaptic('light');
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove video", variant: "destructive" });
      triggerHaptic('error');
    }
  });

  const handleUnsave = (videoId: number) => {
    // Prevent double-clicks while mutation is pending
    if (unsaveVideoMutation.isPending) return;
    if (!user?.id) return;
    unsaveVideoMutation.mutate({ videoId });
  };

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    triggerHaptic('medium');
    await queryClient.invalidateQueries({ queryKey: [`/api/ai/saved-videos/${user?.id}`] });
    setTimeout(() => setIsRefreshing(false), 500);
  }, [queryClient, user?.id]);

  const extractVideoId = (url: string) => {
    if (!url) return '';
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    return match ? match[1] : '';
  };

  // CASCADING FILTERS: Filter videos by one selection to compute the other dropdown's options
  
  // Videos filtered by current professor selection (for technique dropdown)
  const videosFilteredByProfessor = useMemo(() => {
    if (selectedProfessor === "All") return savedVideos;
    return savedVideos.filter(v => v.instructor === selectedProfessor);
  }, [savedVideos, selectedProfessor]);

  // Videos filtered by current technique selection (for professor dropdown)
  const videosFilteredByTechnique = useMemo(() => {
    if (selectedTechnique === "All") return savedVideos;
    return savedVideos.filter(v => (v.techniqueType || v.category || 'Other') === selectedTechnique);
  }, [savedVideos, selectedTechnique]);

  // Build techniques dropdown - shows only techniques available for selected professor
  const techniquesWithCounts = useMemo(() => {
    const sourceVideos = videosFilteredByProfessor;
    const counts: Record<string, number> = {};
    sourceVideos.forEach(v => {
      const tech = v.techniqueType || v.category || 'Other';
      counts[tech] = (counts[tech] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return [{ name: 'All', count: sourceVideos.length }, ...sorted.map(([name, count]) => ({ name, count }))];
  }, [videosFilteredByProfessor]);

  // Build professors dropdown - shows only professors who teach selected technique
  const professorsWithCounts = useMemo(() => {
    const sourceVideos = videosFilteredByTechnique;
    const counts: Record<string, number> = {};
    sourceVideos.forEach(v => {
      const prof = v.instructor || 'Unknown';
      counts[prof] = (counts[prof] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return [{ name: 'All', count: sourceVideos.length }, ...sorted.map(([name, count]) => ({ name, count }))];
  }, [videosFilteredByTechnique]);

  const filteredVideos = savedVideos.filter(video => {
    const matchesSearch = !searchQuery || 
      video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.instructor?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTechnique = selectedTechnique === "All" ||
      (video.techniqueType || video.category || 'Other') === selectedTechnique;
    
    const matchesProfessor = selectedProfessor === "All" ||
      video.instructor === selectedProfessor;
    
    return matchesSearch && matchesTechnique && matchesProfessor;
  });

  const handleVideoPress = (video: SavedVideo) => {
    triggerHaptic('light');
    const videoId = video.youtubeId || extractVideoId(video.videoUrl);
    if (videoId) {
      setCurrentVideo({
        videoId,
        title: video.title,
        instructor: video.instructor
      });
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
        {!hideBottomNav && <IOSBottomNav />}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: 700,
            margin: 0,
          }}>
            Saved Videos
          </h1>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh-saved"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '8px',
              cursor: 'pointer',
              color: isRefreshing ? '#8B5CF6' : '#71717A',
            }}
          >
            <RefreshCw 
              size={22} 
              className={isRefreshing ? 'animate-spin' : ''}
            />
          </button>
        </div>
        <p style={{ 
          color: '#71717A', 
          fontSize: '14px',
          marginTop: '4px',
          marginBottom: '16px',
        }}>
          {savedVideos.length} videos saved
        </p>

        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#1A1A1D',
          borderRadius: '12px',
          padding: '12px 16px',
          border: '1px solid #2A2A2E',
          marginBottom: '12px',
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

        {/* Dropdown Filters */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
        }}>
          {/* Techniques Dropdown */}
          <div style={{ position: 'relative' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              color: '#71717A',
              marginBottom: '6px',
              fontWeight: 600,
            }}>
              Techniques
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={selectedTechnique}
                onChange={(e) => {
                  triggerHaptic('light');
                  setSelectedTechnique(e.target.value);
                }}
                data-testid="select-technique-filter"
                style={{
                  width: '100%',
                  background: '#1A1A1D',
                  border: '1px solid #2A2A2E',
                  borderRadius: '10px',
                  padding: '12px 36px 12px 12px',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                {techniquesWithCounts.map(({ name, count }) => (
                  <option key={name} value={name} data-testid={`option-technique-${name.toLowerCase().replace(/\s+/g, '-')}`}>
                    {name} ({count})
                  </option>
                ))}
              </select>
              <ChevronDown 
                size={16} 
                color="#71717A"
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>

          {/* Professors Dropdown */}
          <div style={{ position: 'relative' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              color: '#71717A',
              marginBottom: '6px',
              fontWeight: 600,
            }}>
              Professors
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={selectedProfessor}
                onChange={(e) => {
                  triggerHaptic('light');
                  setSelectedProfessor(e.target.value);
                }}
                data-testid="select-professor-filter"
                style={{
                  width: '100%',
                  background: '#1A1A1D',
                  border: '1px solid #2A2A2E',
                  borderRadius: '10px',
                  padding: '12px 36px 12px 12px',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                {professorsWithCounts.map(({ name, count }) => (
                  <option key={name} value={name} data-testid={`option-professor-${name.toLowerCase().replace(/\s+/g, '-')}`}>
                    {name} ({count})
                  </option>
                ))}
              </select>
              <ChevronDown 
                size={16} 
                color="#71717A"
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Videos */}
      <div style={{ padding: '16px 20px' }}>
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
              {searchQuery || selectedTechnique !== 'All' || selectedProfessor !== 'All' 
                ? 'No videos found' 
                : 'No saved videos yet'}
            </h3>
            <p style={{ 
              color: '#52525B', 
              fontSize: '14px',
              marginTop: '8px',
            }}>
              {searchQuery || selectedTechnique !== 'All' || selectedProfessor !== 'All'
                ? 'Try a different search or filter' 
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
                  onClick={() => handleVideoPress(video)}
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
                      {decodeHTML(video.title)}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#8B5CF6',
                    }}>
                      {video.instructor}
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '4px',
                    }}>
                      {video.hasGeminiAnalysis === true && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('light');
                          setAnalysisVideoId(video.id);
                        }}
                        data-testid={`button-view-analysis-${video.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: '#8B5CF6',
                          background: 'rgba(139, 92, 246, 0.15)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <Brain size={12} />
                        Analysis
                      </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnsave(video.id);
                        }}
                        disabled={unsaveVideoMutation.isPending}
                        data-testid={`button-unsave-video-${video.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: '#22C55E',
                          background: 'rgba(34, 197, 94, 0.15)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: unsaveVideoMutation.isPending ? 'not-allowed' : 'pointer',
                          opacity: unsaveVideoMutation.isPending ? 0.5 : 1,
                        }}
                      >
                        {unsaveVideoMutation.isPending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <BookmarkCheck size={12} />
                        )}
                        {unsaveVideoMutation.isPending ? 'Removing...' : 'Saved'}
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          triggerHaptic('light');
                          const videoId = extractVideoId(video.videoUrl);
                          if (videoId) {
                            await shareVideo(decodeHTML(video.title), video.instructor, videoId);
                          }
                        }}
                        data-testid={`button-share-video-${video.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: '#10B981',
                          background: 'rgba(16, 185, 129, 0.15)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <Share2 size={12} />
                        Share
                      </button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!hideBottomNav && <IOSBottomNav />}

      {/* In-app Video Player Modal */}
      {currentVideo && (
        <VideoPlayer
          videoId={currentVideo.videoId}
          title={currentVideo.title}
          instructor={currentVideo.instructor}
          onClose={() => setCurrentVideo(null)}
        />
      )}

      {/* Video Analysis Modal */}
      {analysisVideoId && (
        <VideoAnalysisModal
          videoId={analysisVideoId}
          onClose={() => setAnalysisVideoId(null)}
        />
      )}
    </div>
  );
}
