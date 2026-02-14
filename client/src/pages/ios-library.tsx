import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { VideoPlayer } from "@/components/VideoPlayer";
import { VideoAnalysisModal } from "@/components/VideoAnalysisModal";
import { Search, Play, BookmarkCheck, Bookmark, Loader2, ChevronDown, RefreshCw, Brain, Share2, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { shareVideo } from "@/lib/share";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { decodeHTML } from "@/lib/htmlDecode";
import { reviewManager } from "@/services/reviewManager";

console.log('iOS LIBRARY loaded');

interface VideoApiResponse {
  id: number;
  videoId: string;
  thumbnailUrl?: string;
  title: string;
  instructorName: string;
  techniqueType?: string;
  positionCategory?: string;
  duration?: string;
  hasAnalysis?: boolean;
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
  hasAnalysis?: boolean;
  createdAt?: string;
}

interface TaxonomyNode {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  level: number;
  displayOrder: number;
  description: string | null;
  videoCount: number;
}

type ViewMode = 'browse' | 'categories' | 'children' | 'taxonomy-videos';

export default function IOSLibraryPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [selectedCategory, setSelectedCategory] = useState<TaxonomyNode | null>(null);
  const [selectedChild, setSelectedChild] = useState<TaxonomyNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTechnique, setSelectedTechnique] = useState<string>("All");
  const [selectedProfessor, setSelectedProfessor] = useState<string>("All");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<{ videoId: string; title: string; instructor: string } | null>(null);
  const [analysisVideoId, setAnalysisVideoId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: categoriesData } = useQuery<{ categories: TaxonomyNode[] }>({
    queryKey: ['/api/taxonomy/categories'],
  });
  const hasTaxonomy = (categoriesData?.categories?.length || 0) > 0;

  const { data: childrenData, isLoading: isChildrenLoading } = useQuery<{ parent: TaxonomyNode; children: TaxonomyNode[] }>({
    queryKey: [`/api/taxonomy/children/${selectedCategory?.id}`],
    enabled: !!selectedCategory?.id && viewMode === 'children',
  });

  const taxonomyIdForVideos = viewMode === 'taxonomy-videos' ? (selectedChild?.id || selectedCategory?.id) : null;
  const { data: taxonomyVideosData, isLoading: isTaxonomyVideosLoading } = useQuery<{ videos: any[]; count: number }>({
    queryKey: [`/api/taxonomy/videos/${taxonomyIdForVideos}?includeChildren=true`],
    enabled: !!taxonomyIdForVideos,
  });

  const { data: techniquesData } = useQuery<{ techniques: { name: string; count: number }[] }>({
    queryKey: ["/api/ai/techniques"],
    enabled: viewMode === 'browse',
  });

  const videosQueryKey = "/api/ai/videos";
  const { data: videosData, isLoading } = useQuery<{ count: number; videos: VideoApiResponse[] }>({
    queryKey: [videosQueryKey],
    enabled: viewMode === 'browse',
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    triggerHaptic('medium');
    await queryClient.invalidateQueries({ queryKey: ["/api/ai/videos"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/ai/techniques"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/taxonomy/categories"] });
    await queryClient.invalidateQueries({ queryKey: [`/api/ai/saved-videos/${user?.id}`] });
    setTimeout(() => setIsRefreshing(false), 500);
  }, [queryClient, user?.id]);

  const videos: Video[] = (videosData?.videos || []).map(v => ({
    id: v.id,
    title: v.title,
    instructor: v.instructorName,
    youtubeId: v.videoId,
    thumbnail: v.thumbnailUrl || (v.videoId ? `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg` : undefined),
    duration: v.duration,
    technique: v.techniqueType,
    position: v.positionCategory,
    hasAnalysis: v.hasAnalysis,
    createdAt: (v as any).createdAt,
  }));

  const { data: savedVideosData } = useQuery<{ videos: { id: string | number }[] }>({
    queryKey: [`/api/ai/saved-videos/${user?.id}`],
    enabled: !!user?.id,
  });

  const savedVideoIds = savedVideosData?.videos?.map(v => String(v.id)) || [];

  const saveVideoMutation = useMutation({
    mutationFn: async ({ videoId }: { videoId: number }) => {
      return apiRequest('POST', '/api/ai/saved-videos', { userId: user?.id, videoId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/ai/saved-videos/${user?.id}`] });
      toast({ title: "Saved!", description: "Video added to your library" });
      triggerHaptic('success');
      reviewManager.trackVideoSaved().catch(console.error);
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
    if (saveVideoMutation.isPending || unsaveVideoMutation.isPending) return;
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

  const videosFilteredByProfessor = useMemo(() => {
    if (selectedProfessor === "All") return videos;
    return videos.filter(v => v.instructor === selectedProfessor);
  }, [videos, selectedProfessor]);

  const videosFilteredByTechnique = useMemo(() => {
    if (selectedTechnique === "All") return videos;
    if (selectedTechnique === "Recently Added") return videos;
    return videos.filter(v => (v.technique || 'Other') === selectedTechnique);
  }, [videos, selectedTechnique]);

  const techniquesWithCounts = useMemo(() => {
    if (techniquesData?.techniques && selectedProfessor === "All") {
      const allCount = videos.length;
      return [{ name: 'All', count: allCount }, ...techniquesData.techniques];
    }
    const sourceVideos = videosFilteredByProfessor;
    const counts: Record<string, number> = {};
    sourceVideos.forEach(v => {
      const tech = v.technique || 'Other';
      counts[tech] = (counts[tech] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return [
      { name: 'All', count: sourceVideos.length },
      { name: 'Recently Added', count: 100 },
      ...sorted.map(([name, count]) => ({ name, count }))
    ];
  }, [videosFilteredByProfessor, techniquesData, selectedProfessor, videos.length]);

  const professorsWithCounts = useMemo(() => {
    const sourceVideos = videosFilteredByTechnique;
    const counts: Record<string, number> = {};
    sourceVideos.forEach(v => {
      const prof = v.instructor || 'Unknown';
      counts[prof] = (counts[prof] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const uniqueProfessorCount = Object.keys(counts).length;
    return [{ name: 'All', count: uniqueProfessorCount }, ...sorted.map(([name, count]) => ({ name, count }))];
  }, [videosFilteredByTechnique]);

  const filteredVideos = useMemo(() => {
    const filtered = videos?.filter((video) => {
      const matchesSearch = !searchQuery || 
        video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.instructor.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTechnique = selectedTechnique === "All" ||
        selectedTechnique === "Recently Added" ||
        (video.technique || 'Other') === selectedTechnique;
      const matchesProfessor = selectedProfessor === "All" ||
        video.instructor === selectedProfessor;
      return matchesSearch && matchesTechnique && matchesProfessor;
    }) || [];
    if (selectedTechnique === "Recently Added") {
      return [...filtered].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    }
    return filtered;
  }, [videos, searchQuery, selectedTechnique, selectedProfessor]);

  useEffect(() => {
    setVisibleCount(50);
  }, [searchQuery, selectedTechnique, selectedProfessor]);

  const displayedVideos = useMemo(() => {
    return filteredVideos.slice(0, visibleCount);
  }, [filteredVideos, visibleCount]);

  const hasMoreVideos = filteredVideos.length > visibleCount;
  const remainingCount = filteredVideos.length - visibleCount;

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

  const navigateToCategory = (cat: TaxonomyNode) => {
    triggerHaptic('light');
    setSelectedCategory(cat);
    setSelectedChild(null);
    setViewMode('children');
  };

  const navigateToChild = (child: TaxonomyNode) => {
    triggerHaptic('light');
    setSelectedChild(child);
    setViewMode('taxonomy-videos');
  };

  const navigateBack = () => {
    triggerHaptic('light');
    if (viewMode === 'taxonomy-videos' && selectedChild) {
      setSelectedChild(null);
      setViewMode('children');
    } else if (viewMode === 'children' || viewMode === 'taxonomy-videos') {
      setSelectedCategory(null);
      setSelectedChild(null);
      setViewMode('categories');
    } else if (viewMode === 'browse') {
      setViewMode('categories');
    }
  };

  const headerTitle = viewMode === 'categories' ? 'Technique Library'
    : viewMode === 'browse' ? 'All Videos'
    : viewMode === 'children' ? selectedCategory?.name || 'Category'
    : selectedChild?.name || selectedCategory?.name || 'Videos';

  const taxonomyVideosList: Video[] = (taxonomyVideosData?.videos || []).map((v: any) => ({
    id: v.id,
    title: v.title || v.techniqueName,
    instructor: v.instructorName || 'Unknown Instructor',
    youtubeId: v.videoId,
    thumbnail: v.thumbnailUrl || (v.videoId ? `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg` : undefined),
    duration: v.duration,
    technique: v.techniqueType,
    position: v.positionCategory,
    hasAnalysis: !!v.hasAnalysis,
  }));

  const renderVideoItem = (video: Video) => (
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
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
        <div style={{ fontSize: '13px', color: '#8B5CF6', marginTop: '4px' }}>
          {video.instructor}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          {video.hasAnalysis && (
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
              handleToggleSave(video.id);
            }}
            disabled={saveVideoMutation.isPending || unsaveVideoMutation.isPending}
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
              cursor: (saveVideoMutation.isPending || unsaveVideoMutation.isPending) ? 'not-allowed' : 'pointer',
              opacity: (saveVideoMutation.isPending || unsaveVideoMutation.isPending) ? 0.5 : 1,
            }}
          >
            {(saveVideoMutation.isPending || unsaveVideoMutation.isPending) ? (
              <Loader2 size={12} className="animate-spin" />
            ) : isVideoSaved(video.id) ? (
              <BookmarkCheck size={12} />
            ) : (
              <Bookmark size={12} />
            )}
            {isVideoSaved(video.id) ? 'Saved' : 'Save'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic('light');
              shareVideo(video.youtubeId, video.title, video.instructor);
            }}
            data-testid={`button-share-video-${video.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: '#71717A',
              background: 'rgba(39, 39, 42, 0.5)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {viewMode !== 'categories' && (
              <button
                onClick={navigateBack}
                data-testid="button-back"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '4px',
                  cursor: 'pointer',
                  color: '#8B5CF6',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronLeft size={24} />
              </button>
            )}
            <h1 style={{ 
              fontSize: viewMode === 'browse' ? '28px' : '22px', 
              fontWeight: 700,
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {headerTitle}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            
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
              <RefreshCw size={22} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {(viewMode === 'categories' || viewMode === 'browse') && (
          <>
            <div style={{ position: 'relative', marginBottom: viewMode === 'browse' ? '12px' : '0' }}>
              <Search size={20} color="#71717A" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search techniques, videos, instructors..."
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

            {viewMode === 'browse' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#71717A', marginBottom: '6px', fontWeight: 600 }}>
                    Techniques
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={selectedTechnique}
                      onChange={(e) => { triggerHaptic('light'); setSelectedTechnique(e.target.value); }}
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
                        <option key={name} value={name}>{name} ({count})</option>
                      ))}
                    </select>
                    <ChevronDown size={16} color="#71717A" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>

                <div style={{ position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#71717A', marginBottom: '6px', fontWeight: 600 }}>
                    Professors
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={selectedProfessor}
                      onChange={(e) => { triggerHaptic('light'); setSelectedProfessor(e.target.value); }}
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
                        <option key={name} value={name}>{name} ({count})</option>
                      ))}
                    </select>
                    <ChevronDown size={16} color="#71717A" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ padding: '16px 20px' }}>
        {viewMode === 'categories' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={() => { triggerHaptic('light'); setViewMode('browse'); }}
              data-testid="button-all-videos"
              style={{
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                position: 'relative',
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#A78BFA', paddingRight: '20px' }}>
                All Videos
              </div>
              <div style={{ fontSize: '13px', color: '#71717A', fontWeight: 500 }}>
                Browse everything
              </div>
              <ChevronRight size={16} color="#6D28D9" style={{ position: 'absolute', top: '16px', right: '12px' }} />
            </button>
            <button
              onClick={() => { triggerHaptic('light'); setSelectedTechnique('Recently Added'); setViewMode('browse'); }}
              data-testid="button-recently-added"
              style={{
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                position: 'relative',
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#A78BFA', paddingRight: '20px' }}>
                Recently Added
              </div>
              <div style={{ fontSize: '13px', color: '#71717A', fontWeight: 500 }}>
                Latest videos
              </div>
              <ChevronRight size={16} color="#6D28D9" style={{ position: 'absolute', top: '16px', right: '12px' }} />
            </button>

            {categoriesData?.categories?.map(cat => (
              <button
                key={cat.id}
                onClick={() => navigateToCategory(cat)}
                data-testid={`category-card-${cat.id}`}
                style={{
                  background: '#1A1A1D',
                  border: '1px solid #2A2A2E',
                  borderRadius: '12px',
                  padding: '16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  position: 'relative',
                }}
              >
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF', paddingRight: '20px' }}>
                  {cat.name}
                </div>
                <div style={{ fontSize: '13px', color: '#8B5CF6', fontWeight: 500 }}>
                  {cat.videoCount || 0} videos
                </div>
                {cat.description && (
                  <div style={{
                    fontSize: '12px',
                    color: '#71717A',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {cat.description}
                  </div>
                )}
                <ChevronRight size={16} color="#3F3F46" style={{ position: 'absolute', top: '16px', right: '12px' }} />
              </button>
            ))}
          </div>
        )}

        {viewMode === 'children' && selectedCategory && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {selectedCategory.description && (
              <div style={{ padding: '0 0 12px', color: '#A1A1AA', fontSize: '13px' }}>
                {selectedCategory.description}
              </div>
            )}

            <button
              onClick={() => { setSelectedChild(null); setViewMode('taxonomy-videos'); }}
              data-testid="button-view-all-category"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '14px 0',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer',
                textAlign: 'left',
                color: '#A78BFA',
              }}
            >
              <div style={{ flex: 1, fontSize: '15px', fontWeight: 600 }}>
                All {selectedCategory.name}
              </div>
              <div style={{ fontSize: '13px', color: '#71717A' }}>{selectedCategory.videoCount || 0}</div>
              <ChevronRight size={16} color="#3F3F46" />
            </button>

            {isChildrenLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <Loader2 className="animate-spin" size={32} color="#8B5CF6" />
              </div>
            ) : childrenData?.children?.map(child => (
              <button
                key={child.id}
                onClick={() => navigateToChild(child)}
                data-testid={`child-item-${child.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '14px 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: '#FFFFFF',
                }}
              >
                <div style={{ flex: 1, fontSize: '15px', fontWeight: 500 }}>
                  {child.name}
                </div>
                <div style={{ fontSize: '13px', color: '#71717A' }}>{child.videoCount || 0}</div>
                <ChevronRight size={16} color="#3F3F46" />
              </button>
            ))}
          </div>
        )}

        {viewMode === 'taxonomy-videos' && (
          <>
            {isTaxonomyVideosLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <Loader2 className="animate-spin" size={32} color="#8B5CF6" />
              </div>
            ) : taxonomyVideosList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#71717A' }}>
                <p>No videos in this category yet</p>
                <p style={{ fontSize: '14px', marginTop: '8px' }}>Videos will appear here once mapped</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '14px', color: '#71717A', textAlign: 'center' }}>
                  {taxonomyVideosList.length} videos
                </div>
                {taxonomyVideosList.map(renderVideoItem)}
              </div>
            )}
          </>
        )}

        {viewMode === 'browse' && (
          <>
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <Loader2 className="animate-spin" size={32} color="#8B5CF6" />
              </div>
            ) : filteredVideos?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#71717A' }}>
                <p>No videos found</p>
                <p style={{ fontSize: '14px', marginTop: '8px' }}>Try a different search or filter</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {displayedVideos.map(renderVideoItem)}

                {hasMoreVideos && (
                  <button
                    onClick={() => setVisibleCount(prev => prev + 50)}
                    data-testid="button-load-more"
                    style={{
                      background: 'rgba(139, 92, 246, 0.15)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '12px',
                      padding: '16px',
                      cursor: 'pointer',
                      color: '#A78BFA',
                      fontSize: '15px',
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  >
                    Load More ({remainingCount} remaining)
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <IOSBottomNav />

      {currentVideo && (
        <VideoPlayer
          videoId={currentVideo.videoId}
          title={currentVideo.title}
          instructor={currentVideo.instructor}
          onClose={() => setCurrentVideo(null)}
        />
      )}

      {analysisVideoId && (
        <VideoAnalysisModal
          videoId={analysisVideoId}
          onClose={() => setAnalysisVideoId(null)}
        />
      )}
    </div>
  );
}
