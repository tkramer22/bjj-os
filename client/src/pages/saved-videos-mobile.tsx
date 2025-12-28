import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Heart, Play } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AdaptiveLayout from "@/components/adaptive-layout";

interface Video {
  id: string;
  title: string;
  techniqueName: string;
  instructor: string;
  instructorName: string;
  category: string;
  techniqueType: string;
  videoId: string;
  duration: string;
}

export default function SavedVideosPage() {
  const [techniqueFilter, setTechniqueFilter] = useState("all");
  const [instructorFilter, setInstructorFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const { toast } = useToast();

  // Get user
  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  // Fetch saved videos
  const { data: savedVideosData, isLoading } = useQuery<{ videos: Video[] }>({
    queryKey: ["/api/ai/saved-videos", user?.id],
    enabled: !!user?.id,
  });

  const savedVideos = savedVideosData?.videos || [];

  // Get unique techniques and instructors
  const techniques = ["all", ...new Set(savedVideos.map(v => v.techniqueName || v.category).filter(Boolean))];
  const instructors = ["all", ...new Set(savedVideos.map(v => v.instructorName || v.instructor).filter(Boolean))];

  // Unsave video mutation
  const unsaveVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      await apiRequest('DELETE', `/api/ai/saved-videos/${videoId}`);
    },
    onSuccess: () => {
      toast({
        title: "Video unsaved",
        description: "Removed from your saved videos",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/saved-videos", user?.id] });
    },
  });

  // Apply filters
  let filteredVideos = savedVideos.filter(video => {
    const matchesTechnique = techniqueFilter === "all" || 
      video.techniqueName?.toLowerCase() === techniqueFilter.toLowerCase() ||
      video.category?.toLowerCase() === techniqueFilter.toLowerCase();
    
    const matchesInstructor = instructorFilter === "all" || 
      video.instructorName?.toLowerCase() === instructorFilter.toLowerCase() ||
      video.instructor?.toLowerCase() === instructorFilter.toLowerCase();
    
    return matchesTechnique && matchesInstructor;
  });

  // Apply sorting
  filteredVideos = [...filteredVideos].sort((a, b) => {
    switch (sortBy) {
      case "recent":
        return 0; // Already in recent order
      case "oldest":
        return 0; // Reverse order
      case "technique-az":
        return (a.techniqueName || '').localeCompare(b.techniqueName || '');
      case "instructor-az":
        return (a.instructorName || '').localeCompare(b.instructorName || '');
      case "duration-short":
        return (a.duration || '').localeCompare(b.duration || '');
      case "duration-long":
        return (b.duration || '').localeCompare(a.duration || '');
      default:
        return 0;
    }
  });

  const handleUnsave = (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    unsaveVideoMutation.mutate(videoId);
  };

  return (
    <AdaptiveLayout>
      <div className="saved-videos-page">
        {/* Header */}
        <header className="page-header">
          <h1 className="page-title">Saved Videos</h1>
        </header>

        {/* Filters */}
        <div className="filters-section">
          <div className="filter-row">
            <Select value={techniqueFilter} onValueChange={setTechniqueFilter}>
              <SelectTrigger className="filter-select" data-testid="select-technique">
                <SelectValue placeholder="Technique" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Techniques</SelectItem>
                {techniques.slice(1).map(tech => (
                  <SelectItem key={tech} value={tech}>{tech}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={instructorFilter} onValueChange={setInstructorFilter}>
              <SelectTrigger className="filter-select" data-testid="select-instructor">
                <SelectValue placeholder="Instructor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Instructors</SelectItem>
                {instructors.slice(1).map(inst => (
                  <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="sort-select" data-testid="select-sort">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent Saved</SelectItem>
              <SelectItem value="oldest">Oldest Saved</SelectItem>
              <SelectItem value="technique-az">Technique A-Z</SelectItem>
              <SelectItem value="instructor-az">Instructor A-Z</SelectItem>
              <SelectItem value="duration-short">Duration (Shortest)</SelectItem>
              <SelectItem value="duration-long">Duration (Longest)</SelectItem>
            </SelectContent>
          </Select>

          <div className="result-count">
            {isLoading ? 'Loading...' : `Showing ${filteredVideos.length} videos`}
          </div>
        </div>

        {/* Video Grid */}
        <div className="video-grid">
          {isLoading ? (
            <div className="loading-state">Loading saved videos...</div>
          ) : filteredVideos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📚</div>
              <h3 className="empty-title">No Saved Videos{techniqueFilter !== 'all' || instructorFilter !== 'all' ? ' Match Filters' : ' Yet'}</h3>
              <p className="empty-text">
                {techniqueFilter !== 'all' || instructorFilter !== 'all' 
                  ? "Try adjusting your filters or browse the Video Library" 
                  : "Explore the Video Library and save videos to practice later!"}
              </p>
            </div>
          ) : (
            filteredVideos.map((video) => (
              <div
                key={video.id}
                className="video-card"
                onClick={() => setSelectedVideo(video)}
                data-testid={`video-card-${video.id}`}
              >
                <div className="video-thumbnail">
                  {video.videoId && (
                    <img 
                      src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`} 
                      alt={video.title}
                      loading="lazy"
                    />
                  )}
                  <button
                    className="unsave-button"
                    onClick={(e) => handleUnsave(video.id, e)}
                    data-testid={`button-unsave-${video.id}`}
                  >
                    <Heart className="heart-icon filled" />
                  </button>
                  {video.duration && (
                    <div className="duration-badge">{video.duration}</div>
                  )}
                </div>
                <div className="video-info">
                  <h3 className="video-title">{video.techniqueName || video.title}</h3>
                  <p className="video-instructor">{video.instructorName || video.instructor}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Video Modal */}
        {selectedVideo && (
          <div className="video-modal" onClick={() => setSelectedVideo(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button
                className="close-button"
                onClick={() => setSelectedVideo(null)}
                data-testid="button-close-modal"
              >
                ×
              </button>
              <div className="modal-video">
                <iframe
                  src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="modal-info">
                <h2 className="modal-title">{selectedVideo.techniqueName || selectedVideo.title}</h2>
                <p className="modal-instructor">{selectedVideo.instructorName || selectedVideo.instructor}</p>
              </div>
            </div>
          </div>
        )}

        <style>{`
          /* ==================== PAGE LAYOUT ==================== */
          .saved-videos-page {
            min-height: 100vh;
            background: #000;
            color: #fff;
          }

          .page-header {
            padding: 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .page-title {
            font-size: 24px;
            font-weight: 700;
            margin: 0;
          }

          /* ==================== FILTERS ==================== */
          .filters-section {
            padding: 16px;
            background: #000;
          }

          .filter-row {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-bottom: 12px;
          }

          .filter-select,
          .sort-select {
            background: #0F0F0F;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
          }

          .sort-select {
            width: 100%;
          }

          .result-count {
            font-size: 14px;
            color: #71717A;
            text-align: center;
            margin-top: 12px;
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

          @media (min-width: 768px) {
            .video-card:hover {
              transform: scale(1.05);
            }
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

          .unsave-button {
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
            z-index: 1;
          }

          .unsave-button:hover {
            background: rgba(0, 0, 0, 0.8);
            transform: scale(1.1);
          }

          .heart-icon {
            width: 18px;
            height: 18px;
            color: #EF4444;
          }

          .heart-icon.filled {
            fill: #EF4444;
          }

          .duration-badge {
            position: absolute;
            bottom: 8px;
            right: 8px;
            padding: 4px 8px;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            color: #fff;
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
            margin: 0;
          }

          /* ==================== STATES ==================== */
          .loading-state,
          .empty-state {
            grid-column: 1 / -1;
            text-align: center;
            padding: 48px 16px;
          }

          .loading-state {
            color: #71717A;
          }

          .empty-icon {
            font-size: 64px;
            margin-bottom: 16px;
          }

          .empty-title {
            font-size: 20px;
            font-weight: 700;
            color: #fff;
            margin: 0 0 8px 0;
          }

          .empty-text {
            color: #71717A;
            margin: 0;
            max-width: 400px;
            margin-left: auto;
            margin-right: auto;
          }

          /* ==================== VIDEO MODAL ==================== */
          .video-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            padding: 16px;
          }

          .modal-content {
            width: 100%;
            max-width: 900px;
            background: #0F0F0F;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
          }

          .close-button {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            border: none;
            color: #fff;
            font-size: 32px;
            line-height: 1;
            cursor: pointer;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .close-button:hover {
            background: rgba(0, 0, 0, 1);
          }

          .modal-video {
            position: relative;
            width: 100%;
            padding-top: 56.25%; /* 16:9 aspect ratio */
          }

          .modal-video iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
          }

          .modal-info {
            padding: 20px;
          }

          .modal-title {
            font-size: 20px;
            font-weight: 700;
            color: #fff;
            margin: 0 0 8px 0;
          }

          .modal-instructor {
            font-size: 16px;
            color: #71717A;
            margin: 0;
          }
        `}</style>
      </div>
    </AdaptiveLayout>
  );
}
