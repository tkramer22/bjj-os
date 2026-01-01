import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { VideoPlayer } from "@/components/VideoPlayer";
import { VideoAnalysisModal } from "@/components/VideoAnalysisModal";
import { Search, Play, BookmarkCheck, Bookmark, Loader2, ChevronDown, RefreshCw, Brain, Share2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { shareVideo } from "@/lib/share";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { decodeHTML } from "@/lib/htmlDecode";

console.log('✅ iOS LIBRARY loaded');

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
  const [selectedTechnique, setSelectedTechnique] = useState<string>("All");
  const [selectedProfessor, setSelectedProfessor] = useState<string>("All");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<{ videoId: string; title: string; instructor: string } | null>(null);
  const [analysisVideoId, setAnalysisVideoId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: videosData, isLoading } = useQuery<{ count: number; videos: VideoApiResponse[] }>({
    queryKey: ["/api/ai/videos"],
  });

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    triggerHaptic('medium');
    await queryClient.invalidateQueries({ queryKey: ["/api/ai/videos"] });
    await queryClient.invalidateQueries({ queryKey: [`/api/ai/saved-videos/${user?.id}`] });
    setTimeout(() => setIsRefreshing(false), 500);
  }, [queryClient, user?.id]);

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

  const { data: savedVideosData } = useQuery<{ videos: { id: string | number }[] }>({
    queryKey: [`/api/ai/saved-videos/${user?.id}`],
    enabled: !!user?.id,
  });

  const savedVideoIds = savedVideosData?.videos?.map(v => String(v.id)) || [];

  // Save/unsave video mutations
  const saveVideoMutation = useMutation({
    mutationFn: async ({ videoId }: { videoId: number }) => {
      return apiRequest('POST', '/api/ai/saved-videos', { userId: user?.id, videoId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/ai/saved-videos/${user?.id}`] });
      toast({ title: "Saved!", description: "Video added to your library" });
      triggerHaptic('success');
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save video", variant: "destructive" });
      triggerHaptic('error');
    }
  });

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

  const handleToggleSave = (videoId: number) => {
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in to save videos", variant: "destructive" });
      return;
    }
    
    if (isVideoSaved(videoId)) {
      unsaveVideoMutation.mutate({ videoId });
    } else {
      saveVideoMutation.mutate({ videoId });
    }
  };

  // CASCADING FILTERS: Filter videos by one selection to compute the other dropdown's options
  
  // Videos filtered by current professor selection (for technique dropdown)
  const videosFilteredByProfessor = useMemo(() => {
    if (selectedProfessor === "All") return videos;
    return videos.filter(v => v.instructor === selectedProfessor);
  }, [videos, selectedProfessor]);

  // Videos filtered by current technique selection (for professor dropdown)
  const videosFilteredByTechnique = useMemo(() => {
    if (selectedTechnique === "All") return videos;
    return videos.filter(v => (v.technique || 'Other') === selectedTechnique);
  }, [videos, selectedTechnique]);

  // Build techniques dropdown - shows only techniques available for selected professor
  const techniquesWithCounts = useMemo(() => {
    const sourceVideos = videosFilteredByProfessor;
    const counts: Record<string, number> = {};
    sourceVideos.forEach(v => {
      const tech = v.technique || 'Other';
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

  const filteredVideos = videos?.filter((video) => {
    const matchesSearch = !searchQuery || 
      video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.instructor.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTechnique = selectedTechnique === "All" ||
      (video.technique || 'Other') === selectedTechnique;
    
    const matchesProfessor = selectedProfessor === "All" ||
      video.instructor === selectedProfessor;
    
    return matchesSearch && matchesTechnique && matchesProfessor;
  });

  const handleVideoPress = (video: Video) => {
    triggerHaptic('light');
    setCurrentVideo({
      videoId: video.youtubeId,
      title: video.title,
      instructor: video.instructor
    });
  };

  const isVideoSaved = (videoId: number) => {
    return savedVideoIds.includes(String(videoId));
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: 700,
            margin: 0,
          }}>
            Technique Library
          </h1>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh-library"
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
              Try a different search or filter
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
                onClick={() => handleVideoPress(video)}
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
                    {decodeHTML(video.title)}
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSave(video.id);
                      }}
                      data-testid={`button-save-video-${video.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: isVideoSaved(video.id) ? '#22C55E' : '#71717A',
                        background: isVideoSaved(video.id) ? 'rgba(34, 197, 94, 0.15)' : 'rgba(39, 39, 42, 0.5)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {isVideoSaved(video.id) ? (
                        <BookmarkCheck size={12} />
                      ) : (
                        <Bookmark size={12} />
                      )}
                      {isVideoSaved(video.id) ? 'Saved' : 'Save'}
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        triggerHaptic('light');
                        await shareVideo(decodeHTML(video.title), video.instructor, video.youtubeId);
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
            ))}
          </div>
        )}
      </div>

      <IOSBottomNav />

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
