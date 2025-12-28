import { useState, useEffect } from "react";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileVideoCard } from "@/components/mobile-video-card";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Bookmark, Search, X, MessageSquare, Filter } from "lucide-react";
import { getSavedVideos, unsaveVideo } from "@/services/api";

const CATEGORIES = [
  "All",
  "Submissions",
  "Passes",
  "Sweeps",
  "Escapes",
  "Takedowns",
  "Guard Retention",
  "Position Control",
  "Other"
];

export default function MobileSavedPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [instructorFilter, setInstructorFilter] = useState("All");
  const [savedVideos, setSavedVideos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentVideo, setCurrentVideo] = useState<{ videoId: string; title: string; instructor: string } | null>(null);
  const userId = localStorage.getItem('mobileUserId') || '1';

  useEffect(() => {
    loadSavedVideos();
  }, []);

  const loadSavedVideos = async () => {
    try {
      const data = await getSavedVideos(userId);
      // Use database thumbnail with fallback to YouTube thumbnail
      const videos = data.videos.map((v: any) => ({
        id: v.id,
        title: v.title,
        thumbnail: v.thumbnailUrl || (v.videoUrl ? `https://img.youtube.com/vi/${extractVideoId(v.videoUrl)}/mqdefault.jpg` : ''),
        instructor: v.instructor || v.instructorName || 'Unknown', // Handle both field names
        duration: v.duration || '', // Backend already formats as MM:SS
        category: v.category || 'other',
        savedDate: v.savedDate,
        note: v.note,
        videoUrl: v.videoUrl
      }));
      setSavedVideos(videos);
    } catch (error) {
      console.error('Failed to load saved videos:', error);
      setSavedVideos([]);
    } finally {
      setIsLoading(false);
    }
  };

  const extractVideoId = (url: string) => {
    if (!url) return '';
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    return match ? match[1] : '';
  };

  const handleUnsave = async (videoId: string) => {
    try {
      await unsaveVideo(userId, videoId);
      setSavedVideos(prev => prev.filter(v => v.id !== videoId));
    } catch (error) {
      console.error('Failed to unsave video:', error);
      alert('Failed to remove video');
    }
  };

  // Get unique instructors for filter
  const instructors = ["All", ...new Set(savedVideos.map(v => v.instructor).filter(Boolean))];

  const filteredVideos = savedVideos.filter(video => {
    const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         video.instructor?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || 
      video.category?.toLowerCase() === categoryFilter.toLowerCase();
    const matchesInstructor = instructorFilter === 'All' || 
      video.instructor?.toLowerCase() === instructorFilter.toLowerCase();
    return matchesSearch && matchesCategory && matchesInstructor;
  });

  if (isLoading) {
    return (
      <div className="mobile-app">
        <div className="mobile-container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
            <div style={{ fontSize: "2rem", animation: 'spin 1s linear infinite' }}>⚙️</div>
          </div>
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="mobile-app">
      <div className="mobile-container">
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: "80px" }}>
          <div 
            className="mobile-chat-header mobile-safe-area-top"
            style={{ position: "sticky", top: 0, zIndex: 10 }}
          >
            <div>
              <h2 style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>Saved Videos</h2>
              <p style={{ 
                fontSize: "0.875rem", 
                color: "var(--mobile-text-secondary)" 
              }}>
                {savedVideos.length} videos saved
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div style={{ padding: "1rem" }}>
            <div style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              background: "var(--mobile-medium-gray)",
              border: "1px solid var(--mobile-border-gray)",
              borderRadius: "var(--mobile-radius-md)",
              padding: "0.75rem 1rem",
              gap: "0.75rem"
            }}>
              <Search size={18} color="var(--mobile-text-secondary)" />
              <input
                type="text"
                placeholder="Search saved videos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-videos"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "var(--mobile-text-primary)",
                  fontSize: "1rem",
                  outline: "none"
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  data-testid="button-clear-search"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--mobile-text-secondary)",
                    padding: "0.25rem",
                    cursor: "pointer"
                  }}
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Dual Filters */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
            padding: "0 1rem 1rem"
          }}>
            <div>
              <label style={{ 
                display: "block",
                fontSize: "0.75rem",
                color: "var(--mobile-text-secondary)",
                marginBottom: "0.5rem",
                fontWeight: "600"
              }}>
                Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                data-testid="select-category-filter"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "var(--mobile-medium-gray)",
                  border: "1px solid var(--mobile-border-gray)",
                  borderRadius: "var(--mobile-radius-md)",
                  color: "var(--mobile-text-primary)",
                  fontSize: "0.875rem",
                  outline: "none"
                }}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ 
                display: "block",
                fontSize: "0.75rem",
                color: "var(--mobile-text-secondary)",
                marginBottom: "0.5rem",
                fontWeight: "600"
              }}>
                Instructor
              </label>
              <select
                value={instructorFilter}
                onChange={(e) => setInstructorFilter(e.target.value)}
                data-testid="select-instructor-filter"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "var(--mobile-medium-gray)",
                  border: "1px solid var(--mobile-border-gray)",
                  borderRadius: "var(--mobile-radius-md)",
                  color: "var(--mobile-text-primary)",
                  fontSize: "0.875rem",
                  outline: "none"
                }}
              >
                {instructors.map(instructor => (
                  <option key={instructor} value={instructor}>{instructor}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Results count */}
          <div style={{
            padding: "0 1rem 0.75rem",
            fontSize: "0.75rem",
            color: "var(--mobile-text-secondary)"
          }}>
            Showing {filteredVideos.length} of {savedVideos.length} videos
          </div>

          {filteredVideos.length === 0 ? (
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center", 
              justifyContent: "center",
              padding: "4rem 2rem",
              textAlign: "center",
              gap: "1rem"
            }}>
              <Bookmark size={48} color="var(--mobile-text-tertiary)" />
              <h3 style={{ color: "var(--mobile-text-secondary)" }}>
                {searchQuery || categoryFilter !== 'All' || instructorFilter !== 'All' ? 'No videos found' : 'No saved videos yet'}
              </h3>
              <p style={{ 
                color: "var(--mobile-text-tertiary)", 
                fontSize: "0.875rem" 
              }}>
                {searchQuery || categoryFilter !== 'All' || instructorFilter !== 'All'
                  ? 'Try adjusting your search or filters' 
                  : 'Save videos from Prof. OS to watch later'}
              </p>
            </div>
          ) : (
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "1.5rem",
              padding: "0 1rem 1rem"
            }}>
              {filteredVideos.map((video) => (
                <div key={video.id} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <MobileVideoCard
                    videoId={video.id}
                    title={video.title}
                    thumbnail={video.thumbnail}
                    instructor={video.instructor}
                    duration={video.duration}
                    onPlay={() => {
                      const youtubeId = extractVideoId(video.videoUrl);
                      if (youtubeId) {
                        setCurrentVideo({ videoId: youtubeId, title: video.title, instructor: video.instructor });
                      } else {
                        console.error('No valid YouTube URL for video:', video.id);
                      }
                    }}
                    onSave={() => handleUnsave(video.id)}
                  />
                  {video.note && (
                    <div style={{
                      fontSize: "0.875rem",
                      color: "var(--mobile-text-secondary)",
                      fontStyle: "italic",
                      padding: "0.5rem 0.75rem",
                      background: "var(--mobile-dark-gray)",
                      borderLeft: "3px solid var(--mobile-primary-purple)",
                      borderRadius: "var(--mobile-radius-sm)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem"
                    }}>
                      <MessageSquare size={14} color="var(--mobile-primary-purple)" />
                      <span>"{video.note}"</span>
                    </div>
                  )}
                  <div style={{
                    fontSize: "0.75rem",
                    color: "var(--mobile-text-tertiary)",
                    paddingLeft: "0.75rem"
                  }}>
                    Saved {video.savedDate}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <MobileBottomNav />

        {/* Video Player Modal */}
        {currentVideo && (
          <VideoPlayer
            videoId={currentVideo.videoId}
            title={currentVideo.title}
            instructor={currentVideo.instructor}
            onClose={() => setCurrentVideo(null)}
          />
        )}
      </div>
    </div>
  );
}
