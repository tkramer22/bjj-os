import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VideoPlayer } from "@/components/VideoPlayer";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import UserLayout from "@/components/layouts/UserLayout";
import { ThumbnailImage } from "@/components/ThumbnailImage";
import { useLocation } from "wouter";
import { IOSSpinner } from "@/components/ios-spinner";
import { triggerHaptic } from "@/lib/haptics";

interface Video {
  id: number;
  title: string;
  techniqueName: string;
  instructorName: string;
  techniqueType: string;
  beltLevel: string;
  giOrNogi: string;
  qualityScore: number;
  viewCount?: number;
  duration?: string;
  videoId?: string;
  thumbnailUrl?: string;
  createdAt?: string;
}

export default function LibraryPage() {
  // Simple local state for filters (no URL sync complexity)
  const [searchQuery, setSearchQuery] = useState('');
  const [giFilter, setGiFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'instructor'>('newest');
  const [instructorFilter, setInstructorFilter] = useState('all');
  const [techniqueFilter, setTechniqueFilter] = useState('all');
  
  const [currentVideo, setCurrentVideo] = useState<{ videoId: string; title: string; instructor: string } | null>(null);
  const [savedVideoIds, setSavedVideoIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Fetch current user with auth check
  const { data: user, isLoading: isLoadingUser, error: userError } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (userError && !isLoadingUser) {
      toast({
        title: "Authentication Required",
        description: "Please log in to continue",
        variant: "destructive",
      });
      navigate('/login');
    }
  }, [userError, isLoadingUser, navigate, toast]);

  // Fetch saved videos to populate saved IDs
  const { data: savedVideosData } = useQuery<{ videos: { id: string }[] }>({
    queryKey: ["/api/ai/saved-videos", user?.id],
    enabled: !!user?.id,
  });

  // Update saved video IDs when data loads
  useEffect(() => {
    if (savedVideosData?.videos) {
      setSavedVideoIds(new Set(savedVideosData.videos.map(v => parseInt(v.id))));
    }
  }, [savedVideosData]);

  // Save video mutation
  const saveVideoMutation = useMutation({
    mutationFn: async (videoId: number) => {
      triggerHaptic('light');
      return await apiRequest('POST', '/api/ai/saved-videos', {
        userId: user?.id,
        videoId,
      });
    },
    onSuccess: (_, videoId) => {
      triggerHaptic('success');
      setSavedVideoIds(prev => new Set([...Array.from(prev), videoId]));
      toast({
        title: "Saved",
        description: "Video saved to your library",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/saved-videos', user?.id] });
    },
  });

  // Unsave video mutation
  const unsaveVideoMutation = useMutation({
    mutationFn: async (videoId: number) => {
      return await apiRequest('DELETE', `/api/ai/saved-videos/${videoId}`, {
        userId: user?.id,
      });
    },
    onSuccess: (_, videoId) => {
      setSavedVideoIds(prev => {
        const newSet = new Set(Array.from(prev));
        newSet.delete(videoId);
        return newSet;
      });
      toast({
        title: "Removed",
        description: "Video removed from your library",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/saved-videos', user?.id] });
    },
  });

  const toggleSaveVideo = (videoId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent video modal from opening
    if (savedVideoIds.has(videoId)) {
      unsaveVideoMutation.mutate(videoId);
    } else {
      saveVideoMutation.mutate(videoId);
    }
  };

  const playVideo = (videoId: string, title: string, instructor: string) => {
    setCurrentVideo({ videoId, title, instructor });
  };

  // Fetch all videos
  const { data: videosData, isLoading, error: videosError, isFetching } = useQuery<{ videos: Video[] }>({
    queryKey: ['/api/ai/videos'],
  });

  // Debug logging
  useEffect(() => {
    console.log('[LIBRARY DEBUG] Query state:', { 
      isLoading, 
      isFetching,
      hasData: !!videosData, 
      videosCount: videosData?.videos?.length || 0,
      error: videosError?.message || null
    });
  }, [isLoading, isFetching, videosData, videosError]);

  const videos = videosData?.videos || [];

  // Fetch unique techniques for dropdown WITH COUNTS
  const { data: techniquesData } = useQuery<{ techniques: { name: string; count: number }[]; totalCount: number }>({
    queryKey: ['/api/ai/techniques'],
  });

  const techniques = techniquesData?.techniques || [];

  // Fetch unique instructors for dropdown WITH COUNTS
  const { data: instructorsData } = useQuery<{ instructors: { name: string; count: number }[]; totalCount: number }>({
    queryKey: ['/api/ai/instructors'],
  });

  const instructors = instructorsData?.instructors || [];

  // Apply filters and sorting
  const sortedVideos = useMemo(() => {
    console.log('[LIBRARY FILTER] Running filter with:', { 
      searchQuery, 
      giFilter, 
      sortBy,
      instructorFilter,
      techniqueFilter,
      totalVideos: videos.length
    });
    
    let filtered = videos.filter(video => {
      // General search filter
      const matchesSearch = !searchQuery || 
        video.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.techniqueName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.instructorName?.toLowerCase().includes(searchQuery.toLowerCase());

      // Gi/No-Gi filter
      const matchesGi = giFilter === 'all' || 
        video.giOrNogi?.toLowerCase() === giFilter.toLowerCase();

      // Instructor filter
      const matchesInstructor = instructorFilter === 'all' ||
        video.instructorName?.toLowerCase() === instructorFilter.toLowerCase();

      // Technique filter - matches technique name
      const matchesTechnique = techniqueFilter === 'all' ||
        video.techniqueName?.toLowerCase() === techniqueFilter.toLowerCase();

      return matchesSearch && matchesGi && matchesInstructor && matchesTechnique;
    });
    
    console.log('[LIBRARY FILTER] Filtered to', filtered.length, 'videos');
    
    // Apply sorting
    if (sortBy === "newest") {
      return filtered.sort((a, b) => {
        const dateA = new Date(a.createdAt ?? 0).getTime();
        const dateB = new Date(b.createdAt ?? 0).getTime();
        return dateB - dateA;
      });
    } else if (sortBy === "popular") {
      return filtered.sort((a, b) => {
        const viewsA = a.viewCount ?? 0;
        const viewsB = b.viewCount ?? 0;
        return viewsB - viewsA;
      });
    } else if (sortBy === "instructor") {
      // Instructor mode: sort by name, then by newest
      return filtered.sort((a, b) => {
        const nameCompare = (a.instructorName || '').localeCompare(b.instructorName || '');
        if (nameCompare !== 0) return nameCompare;
        const dateA = new Date(a.createdAt ?? 0).getTime();
        const dateB = new Date(b.createdAt ?? 0).getTime();
        return dateB - dateA;
      });
    }
    
    // Default: newest first
    return filtered.sort((a, b) => {
      const dateA = new Date(a.createdAt ?? 0).getTime();
      const dateB = new Date(b.createdAt ?? 0).getTime();
      return dateB - dateA;
    });
  }, [videos, searchQuery, giFilter, sortBy, instructorFilter, techniqueFilter]);

  // Show loading while checking auth
  if (isLoadingUser) {
    return (
      <UserLayout>
        <div className="flex items-center justify-center h-screen">
          <IOSSpinner size="lg" className="text-purple-400" />
        </div>
      </UserLayout>
    );
  }

  // Don't render content if not authenticated (redirect is happening)
  if (userError || !user) {
    return (
      <UserLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-muted-foreground">Redirecting to login...</div>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout>
      <div className="library-page w-full h-full overflow-auto">
        {/* Header */}
        <header className="page-header">
          <div className="header-content">
            <h1 className="page-title">Video Library</h1>
            <Search className="search-icon-header" />
          </div>
        </header>

        {/* Search & Filters */}
        <div className="filters-section">
          <div className="search-bar">
            <Search className="search-icon" />
            <Input
              type="text"
              placeholder="Search techniques..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              data-testid="input-search"
            />
          </div>

          <div className="filter-row">
            <Select value={sortBy} onValueChange={(value: "newest" | "popular" | "instructor") => setSortBy(value)}>
              <SelectTrigger className="filter-select" data-testid="select-sort">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="popular">Most Watched</SelectItem>
                <SelectItem value="instructor">By Instructor</SelectItem>
              </SelectContent>
            </Select>

            <Select value={giFilter} onValueChange={setGiFilter}>
              <SelectTrigger className="filter-select" data-testid="select-gi">
                <SelectValue placeholder="Gi/No-Gi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="gi">Gi</SelectItem>
                <SelectItem value="nogi">No-Gi</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>

            <Select value={techniqueFilter} onValueChange={setTechniqueFilter}>
              <SelectTrigger className="filter-select" data-testid="select-technique">
                <SelectValue placeholder="All Techniques" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Techniques ({techniquesData?.totalCount || 0})</SelectItem>
                {techniques.map((technique) => (
                  <SelectItem key={technique.name} value={technique.name.toLowerCase()}>
                    {technique.name} ({technique.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={instructorFilter} onValueChange={setInstructorFilter}>
              <SelectTrigger className="filter-select" data-testid="select-instructor">
                <SelectValue placeholder="All Instructors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Instructors ({instructorsData?.totalCount || 0})</SelectItem>
                {instructors.map((instructor) => (
                  <SelectItem key={instructor.name} value={instructor.name.toLowerCase()}>
                    {instructor.name} ({instructor.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="result-count" data-testid="video-count">
            {isLoading ? 'Loading...' : `${sortedVideos.length} videos`}
          </div>
        </div>

        {/* Video Grid */}
        <div className="video-grid">
          {isLoading ? (
            <div className="loading-state">Loading videos...</div>
          ) : sortedVideos.length === 0 ? (
            <div className="empty-state">
              <p>No videos found</p>
              <p className="empty-hint">
                {sortBy === 'instructor' && instructorFilter
                  ? `No videos found for instructor "${instructorFilter}"`
                  : 'Try adjusting your filters'}
              </p>
            </div>
          ) : (
            sortedVideos.map((video) => (
              <div 
                key={video.id} 
                className="video-card" 
                data-testid={`video-card-${video.id}`}
                onClick={() => video.videoId && playVideo(video.videoId, video.techniqueName || video.title, video.instructorName)}
              >
                <div className="video-thumbnail">
                  <ThumbnailImage
                    thumbnailUrl={video.thumbnailUrl}
                    videoId={video.videoId}
                    title={video.techniqueName || video.title}
                  />
                  <div className="play-overlay">
                    <div className="play-button-circle">▶</div>
                  </div>
                  <button 
                    className="save-button" 
                    data-testid={`button-save-${video.id}`}
                    onClick={(e) => toggleSaveVideo(video.id, e)}
                  >
                    <Heart 
                      className="heart-icon" 
                      fill={savedVideoIds.has(video.id) ? "#ff4444" : "none"}
                      stroke={savedVideoIds.has(video.id) ? "#ff4444" : "#fff"}
                    />
                  </button>
                  {video.qualityScore && (
                    <div className="quality-badge">
                      ⭐ {video.qualityScore.toFixed(1)}
                    </div>
                  )}
                </div>
                <div className="video-info">
                  <h3 className="video-title">{video.techniqueName || video.title}</h3>
                  <p className="video-instructor">{video.instructorName}</p>
                  
                  {/* Metadata badges - Only Gi/No-Gi */}
                  <div className="video-metadata">
                    {video.giOrNogi && (
                      <span className="metadata-badge gi-badge" data-testid={`badge-gi-${video.id}`}>
                        {video.giOrNogi === 'gi' ? 'Gi' : video.giOrNogi === 'nogi' ? 'No-Gi' : 'Both'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <style>{`
          /* ==================== PAGE LAYOUT ==================== */
          .library-page {
            min-height: 100vh;
            background: #000;
            color: #fff;
          }

          .page-header {
            padding: 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .header-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .page-title {
            font-size: 24px;
            font-weight: 700;
            margin: 0;
          }

          .search-icon-header {
            width: 24px;
            height: 24px;
            color: #71717A;
          }

          /* ==================== FILTERS ==================== */
          .filters-section {
            padding: 16px;
            background: #000;
          }

          .search-bar {
            position: relative;
            margin-bottom: 12px;
          }

          .search-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            width: 18px;
            height: 18px;
            color: #71717A;
            pointer-events: none;
          }

          .search-input {
            padding-left: 40px;
            background: #0F0F0F;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            width: 100%;
          }

          .search-input::placeholder {
            color: #71717A;
          }

          .filter-row {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-bottom: 12px;
          }
          
          .instructor-search-bar {
            margin-bottom: 12px;
          }
          
          .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border-width: 0;
          }

          .filter-select {
            background: #0F0F0F;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
          }

          .result-count {
            font-size: 14px;
            color: #71717A;
            text-align: center;
          }

          /* ==================== VIDEO GRID ==================== */
          .video-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            padding: 16px;
          }

          @media (min-width: 768px) {
            .video-grid {
              grid-template-columns: repeat(4, 1fr);
              gap: 16px;
            }
          }

          .video-card {
            background: #0F0F0F;
            border-radius: 12px;
            overflow: hidden;
            cursor: pointer;
            transition: transform 150ms ease;
          }

          .video-card:hover {
            transform: scale(1.02);
          }

          .video-thumbnail {
            position: relative;
            width: 100%;
            aspect-ratio: 16/9;
            background: #1A1A1A;
          }

          .video-thumbnail img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .save-button {
            position: absolute;
            top: 8px;
            right: 8px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(10px);
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 150ms ease;
          }

          .save-button:hover {
            background: rgba(0, 0, 0, 0.8);
            transform: scale(1.1);
          }

          .heart-icon {
            width: 18px;
            height: 18px;
            color: #fff;
          }

          .quality-badge {
            position: absolute;
            bottom: 8px;
            right: 8px;
            padding: 4px 8px;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            color: #FFD700;
          }

          .video-info {
            padding: 12px;
          }

          .video-title {
            font-size: 14px;
            font-weight: 600;
            color: #fff;
            margin: 0 0 4px 0;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .video-instructor {
            font-size: 12px;
            color: #71717A;
            margin: 0 0 8px 0;
          }

          /* ==================== VIDEO METADATA BADGES ==================== */
          .video-metadata {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 8px;
          }

          .metadata-badge {
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: capitalize;
            white-space: nowrap;
          }

          /* Belt level badges with authentic BJJ colors */
          .belt-white {
            background: rgba(255, 255, 255, 0.15);
            color: #fff;
            border: 1px solid rgba(255, 255, 255, 0.3);
          }

          .belt-blue {
            background: rgba(59, 130, 246, 0.2);
            color: #60A5FA;
            border: 1px solid rgba(59, 130, 246, 0.4);
          }

          .belt-purple {
            background: rgba(168, 85, 247, 0.2);
            color: #C084FC;
            border: 1px solid rgba(168, 85, 247, 0.4);
          }

          .belt-brown {
            background: rgba(180, 83, 9, 0.2);
            color: #FDBA74;
            border: 1px solid rgba(180, 83, 9, 0.4);
          }

          .belt-black {
            background: rgba(255, 255, 255, 0.1);
            color: #FFD700;
            border: 1px solid rgba(255, 215, 0, 0.4);
          }

          /* Gi/No-Gi badge */
          .gi-badge {
            background: rgba(139, 92, 246, 0.15);
            color: #A78BFA;
            border: 1px solid rgba(139, 92, 246, 0.3);
          }

          /* Technique type badge */
          .type-badge {
            background: rgba(34, 197, 94, 0.15);
            color: #4ADE80;
            border: 1px solid rgba(34, 197, 94, 0.3);
          }

          /* Duration badge */
          .duration-badge {
            background: rgba(251, 146, 60, 0.15);
            color: #FB923C;
            border: 1px solid rgba(251, 146, 60, 0.3);
          }

          /* ==================== STATES ==================== */
          .loading-state,
          .empty-state {
            grid-column: 1 / -1;
            text-align: center;
            padding: 48px 16px;
            color: #71717A;
          }

          .empty-hint {
            margin-top: 8px;
            font-size: 14px;
          }

          /* ==================== PLAY OVERLAY ==================== */
          .play-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.3);
            opacity: 0;
            transition: opacity 150ms ease;
          }

          .video-card:hover .play-overlay {
            opacity: 1;
          }

          .play-button-circle {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: #fff;
            padding-left: 4px;
          }
        `}</style>

      </div>

      {/* Video Player Modal (outside scroll container for overlay) */}
      {currentVideo && (
        <VideoPlayer
          videoId={currentVideo.videoId}
          title={currentVideo.title}
          instructor={currentVideo.instructor}
          onClose={() => setCurrentVideo(null)}
        />
      )}
    </UserLayout>
  );
}
