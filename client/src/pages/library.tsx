import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Heart, ChevronLeft, ChevronRight, Layers, Grid3X3 } from "lucide-react";
import { Input } from "@/components/ui/input";
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

interface TaxonomyNode {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  level: number;
  displayOrder: number;
  description: string | null;
  videoCount: number;
  children?: TaxonomyNode[];
}

type ViewMode = 'categories' | 'children' | 'videos' | 'search' | 'all';

export default function LibraryPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [selectedCategory, setSelectedCategory] = useState<TaxonomyNode | null>(null);
  const [selectedChild, setSelectedChild] = useState<TaxonomyNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<{ videoId: string; title: string; instructor: string } | null>(null);
  const [savedVideoIds, setSavedVideoIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: user, isLoading: isLoadingUser, error: userError } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

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

  const { data: savedVideosData } = useQuery<{ videos: { id: string }[] }>({
    queryKey: ["/api/ai/saved-videos", user?.id],
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (savedVideosData?.videos) {
      setSavedVideoIds(new Set(savedVideosData.videos.map(v => parseInt(v.id))));
    }
  }, [savedVideosData]);

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
      toast({ title: "Saved", description: "Video saved to your library" });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/saved-videos', user?.id] });
    },
  });

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
      toast({ title: "Removed", description: "Video removed from your library" });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/saved-videos', user?.id] });
    },
  });

  const toggleSaveVideo = (videoId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (savedVideoIds.has(videoId)) {
      unsaveVideoMutation.mutate(videoId);
    } else {
      saveVideoMutation.mutate(videoId);
    }
  };

  const playVideo = (videoId: string, title: string, instructor: string) => {
    setCurrentVideo({ videoId, title, instructor });
  };

  const { data: categoriesData, isLoading: isCategoriesLoading } = useQuery<{ categories: TaxonomyNode[] }>({
    queryKey: ['/api/taxonomy/categories'],
  });

  const categories = categoriesData?.categories || [];
  const hasTaxonomy = categories.length > 0;

  const { data: childrenData, isLoading: isChildrenLoading } = useQuery<{ parent: TaxonomyNode; children: TaxonomyNode[] }>({
    queryKey: [`/api/taxonomy/children/${selectedCategory?.id}`],
    enabled: !!selectedCategory?.id && viewMode === 'children',
  });

  const taxonomyIdForVideos = viewMode === 'videos' ? (selectedChild?.id || selectedCategory?.id) : null;
  const { data: taxonomyVideosData, isLoading: isTaxonomyVideosLoading } = useQuery<{ videos: Video[]; count: number }>({
    queryKey: [`/api/taxonomy/videos/${taxonomyIdForVideos}?includeChildren=true`],
    enabled: !!taxonomyIdForVideos && viewMode === 'videos',
  });

  const { data: searchData, isLoading: isSearchLoading } = useQuery<{ taxonomyResults: TaxonomyNode[]; videoResults: Video[] }>({
    queryKey: [`/api/taxonomy/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: isSearching && searchQuery.length >= 2,
  });

  const { data: allVideosData, isLoading: isAllVideosLoading } = useQuery<{ videos: Video[] }>({
    queryKey: ['/api/ai/videos'],
    enabled: !hasTaxonomy || viewMode === 'all',
  });

  useEffect(() => {
    if (searchQuery.length >= 2) {
      setIsSearching(true);
      setViewMode('search');
    } else if (searchQuery.length === 0 && isSearching) {
      setIsSearching(false);
      if (selectedChild) setViewMode('videos');
      else if (selectedCategory) setViewMode('children');
      else setViewMode(hasTaxonomy ? 'categories' : 'all');
    }
  }, [searchQuery]);

  const navigateToCategory = (category: TaxonomyNode) => {
    setSelectedCategory(category);
    setSelectedChild(null);
    setViewMode('children');
    setSearchQuery('');
    setIsSearching(false);
  };

  const navigateToChild = (child: TaxonomyNode) => {
    setSelectedChild(child);
    setViewMode('videos');
    setSearchQuery('');
    setIsSearching(false);
  };

  const navigateBack = () => {
    if (viewMode === 'videos' && selectedChild) {
      setSelectedChild(null);
      setViewMode('children');
    } else if (viewMode === 'children' || viewMode === 'videos') {
      setSelectedCategory(null);
      setSelectedChild(null);
      setViewMode(hasTaxonomy ? 'categories' : 'all');
    } else if (viewMode === 'search') {
      setSearchQuery('');
      setIsSearching(false);
      if (selectedChild) setViewMode('videos');
      else if (selectedCategory) setViewMode('children');
      else setViewMode(hasTaxonomy ? 'categories' : 'all');
    }
  };

  const showAllVideos = () => {
    setViewMode('all');
    setSelectedCategory(null);
    setSelectedChild(null);
    setSearchQuery('');
    setIsSearching(false);
  };

  if (isLoadingUser) {
    return (
      <UserLayout>
        <div className="flex items-center justify-center h-screen">
          <IOSSpinner size="lg" className="text-purple-400" />
        </div>
      </UserLayout>
    );
  }

  if (userError || !user) {
    return (
      <UserLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-muted-foreground">Redirecting to login...</div>
        </div>
      </UserLayout>
    );
  }

  const breadcrumbTitle = viewMode === 'categories' ? 'Technique Library'
    : viewMode === 'children' ? selectedCategory?.name || 'Category'
    : viewMode === 'videos' ? (selectedChild?.name || selectedCategory?.name || 'Videos')
    : viewMode === 'search' ? 'Search Results'
    : 'All Videos';

  const showBackButton = viewMode !== 'categories' && viewMode !== 'all';

  return (
    <UserLayout>
      <div className="library-page w-full h-full overflow-auto" data-testid="library-page">
        <header className="page-header">
          <div className="header-content">
            <div className="header-left">
              {showBackButton && (
                <button className="back-button" onClick={navigateBack} data-testid="button-back">
                  <ChevronLeft className="back-icon" />
                </button>
              )}
              <h1 className="page-title" data-testid="text-page-title">{breadcrumbTitle}</h1>
            </div>
            <div className="header-right">
              {hasTaxonomy && viewMode !== 'all' && (
                <button className="view-all-btn" onClick={showAllVideos} data-testid="button-view-all">
                  <Grid3X3 size={18} />
                </button>
              )}
              {viewMode === 'all' && hasTaxonomy && (
                <button className="view-all-btn" onClick={() => { setViewMode('categories'); setSelectedCategory(null); setSelectedChild(null); }} data-testid="button-browse">
                  <Layers size={18} />
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="search-section">
          <div className="search-bar">
            <Search className="search-icon" />
            <Input
              type="text"
              placeholder="Search techniques, videos, instructors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              data-testid="input-search"
            />
          </div>
        </div>

        {viewMode === 'search' && isSearching && (
          <div className="search-results-container">
            {isSearchLoading ? (
              <div className="loading-state"><IOSSpinner size="md" className="text-purple-400" /></div>
            ) : (
              <>
                {searchData?.taxonomyResults && searchData.taxonomyResults.length > 0 && (
                  <div className="search-section-group">
                    <h2 className="section-title" data-testid="text-taxonomy-results">Techniques</h2>
                    <div className="taxonomy-search-results">
                      {searchData.taxonomyResults.map(node => (
                        <button
                          key={node.id}
                          className="taxonomy-search-item"
                          data-testid={`taxonomy-result-${node.id}`}
                          onClick={() => {
                            if (node.level === 1) navigateToCategory(node);
                            else navigateToChild(node);
                          }}
                        >
                          <div className="taxonomy-search-info">
                            <span className="taxonomy-search-name">{node.name}</span>
                            <span className="taxonomy-search-level">
                              {node.level === 1 ? 'Category' : node.level === 2 ? 'Position' : 'Technique'}
                            </span>
                          </div>
                          <div className="taxonomy-search-count">{node.videoCount || 0} videos</div>
                          <ChevronRight size={16} className="taxonomy-search-arrow" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchData?.videoResults && searchData.videoResults.length > 0 && (
                  <div className="search-section-group">
                    <h2 className="section-title" data-testid="text-video-results">Videos</h2>
                    <div className="video-grid">
                      {searchData.videoResults.map(video => (
                        <VideoCard
                          key={video.id}
                          video={video}
                          isSaved={savedVideoIds.has(video.id)}
                          onToggleSave={toggleSaveVideo}
                          onPlay={playVideo}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {(!searchData?.taxonomyResults?.length && !searchData?.videoResults?.length) && (
                  <div className="empty-state" data-testid="text-no-results">
                    <p>No results found for "{searchQuery}"</p>
                    <p className="empty-hint">Try different keywords</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {viewMode === 'categories' && hasTaxonomy && (
          <div className="categories-grid" data-testid="categories-grid">
            {isCategoriesLoading ? (
              <div className="loading-state"><IOSSpinner size="md" className="text-purple-400" /></div>
            ) : (
              categories.map(category => (
                <button
                  key={category.id}
                  className="category-card"
                  data-testid={`category-card-${category.id}`}
                  onClick={() => navigateToCategory(category)}
                >
                  <div className="category-name">{category.name}</div>
                  <div className="category-count">{category.videoCount || 0} videos</div>
                  {category.description && (
                    <div className="category-description">{category.description}</div>
                  )}
                  <ChevronRight className="category-arrow" size={20} />
                </button>
              ))
            )}
          </div>
        )}

        {viewMode === 'children' && selectedCategory && (
          <div className="children-list" data-testid="children-list">
            {isChildrenLoading ? (
              <div className="loading-state"><IOSSpinner size="md" className="text-purple-400" /></div>
            ) : (
              <>
                {selectedCategory.description && (
                  <div className="category-desc-banner" data-testid="text-category-description">
                    {selectedCategory.description}
                  </div>
                )}

                <button
                  className="child-item view-all-child"
                  data-testid="button-view-all-category"
                  onClick={() => {
                    setSelectedChild(null);
                    setViewMode('videos');
                  }}
                >
                  <div className="child-info">
                    <span className="child-name">All {selectedCategory.name}</span>
                  </div>
                  <div className="child-count">{selectedCategory.videoCount || 0}</div>
                  <ChevronRight size={16} className="child-arrow" />
                </button>

                {childrenData?.children?.map(child => (
                  <button
                    key={child.id}
                    className="child-item"
                    data-testid={`child-item-${child.id}`}
                    onClick={() => navigateToChild(child)}
                  >
                    <div className="child-info">
                      <span className="child-name">{child.name}</span>
                    </div>
                    <div className="child-count">{child.videoCount || 0}</div>
                    <ChevronRight size={16} className="child-arrow" />
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {viewMode === 'videos' && (
          <div className="videos-section">
            {isTaxonomyVideosLoading ? (
              <div className="loading-state"><IOSSpinner size="md" className="text-purple-400" /></div>
            ) : (
              <>
                <div className="result-count" data-testid="video-count">
                  {taxonomyVideosData?.count || 0} videos
                </div>
                <div className="video-grid">
                  {(taxonomyVideosData?.videos || []).map(video => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      isSaved={savedVideoIds.has(video.id)}
                      onToggleSave={toggleSaveVideo}
                      onPlay={playVideo}
                    />
                  ))}
                  {(!taxonomyVideosData?.videos || taxonomyVideosData.videos.length === 0) && (
                    <div className="empty-state" data-testid="text-no-videos">
                      <p>No videos in this category yet</p>
                      <p className="empty-hint">Videos will appear here once they're mapped to the taxonomy</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {(viewMode === 'all' || (!hasTaxonomy && viewMode === 'categories')) && (
          <div className="videos-section">
            {isAllVideosLoading ? (
              <div className="loading-state"><IOSSpinner size="md" className="text-purple-400" /></div>
            ) : (
              <>
                <div className="result-count" data-testid="video-count">
                  {allVideosData?.videos?.length || 0} videos
                </div>
                <div className="video-grid">
                  {(allVideosData?.videos || []).map((video: any) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      isSaved={savedVideoIds.has(video.id)}
                      onToggleSave={toggleSaveVideo}
                      onPlay={playVideo}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <style>{`
          .library-page {
            min-height: 100vh;
            background: #000;
            color: #fff;
          }

          .page-header {
            padding: 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            position: sticky;
            top: 0;
            background: #000;
            z-index: 50;
          }

          .header-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }

          .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
          }

          .header-right {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .back-button {
            background: none;
            border: none;
            color: #A78BFA;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            flex-shrink: 0;
          }

          .back-icon {
            width: 24px;
            height: 24px;
          }

          .page-title {
            font-size: 20px;
            font-weight: 700;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .view-all-btn {
            background: rgba(139, 92, 246, 0.15);
            border: 1px solid rgba(139, 92, 246, 0.3);
            color: #A78BFA;
            border-radius: 8px;
            padding: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .search-section {
            padding: 12px 16px;
            background: #000;
          }

          .search-bar {
            position: relative;
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

          /* ==================== CATEGORIES GRID ==================== */
          .categories-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            padding: 16px;
          }

          @media (min-width: 768px) {
            .categories-grid {
              grid-template-columns: repeat(3, 1fr);
              gap: 16px;
            }
          }

          .category-card {
            background: #0F0F0F;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 16px;
            cursor: pointer;
            transition: all 150ms ease;
            text-align: left;
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .category-card:hover {
            border-color: rgba(139, 92, 246, 0.4);
            background: #111;
          }

          .category-name {
            font-size: 15px;
            font-weight: 600;
            color: #fff;
            line-height: 1.3;
          }

          .category-count {
            font-size: 13px;
            color: #A78BFA;
            font-weight: 500;
          }

          .category-description {
            font-size: 12px;
            color: #71717A;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .category-arrow {
            position: absolute;
            top: 16px;
            right: 12px;
            color: #3F3F46;
          }

          /* ==================== CHILDREN LIST ==================== */
          .children-list {
            padding: 8px 0;
          }

          .category-desc-banner {
            padding: 12px 16px;
            color: #A1A1AA;
            font-size: 13px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          }

          .child-item {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 14px 16px;
            background: none;
            border: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            cursor: pointer;
            text-align: left;
            color: #fff;
            transition: background 150ms ease;
          }

          .child-item:hover {
            background: rgba(255, 255, 255, 0.03);
          }

          .child-item.view-all-child {
            background: rgba(139, 92, 246, 0.05);
          }

          .child-item.view-all-child .child-name {
            color: #A78BFA;
            font-weight: 600;
          }

          .child-info {
            flex: 1;
            min-width: 0;
          }

          .child-name {
            font-size: 15px;
            font-weight: 500;
          }

          .child-count {
            font-size: 13px;
            color: #71717A;
            flex-shrink: 0;
          }

          .child-arrow {
            color: #3F3F46;
            flex-shrink: 0;
          }

          /* ==================== SEARCH RESULTS ==================== */
          .search-results-container {
            padding: 0;
          }

          .search-section-group {
            padding: 0;
          }

          .section-title {
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #71717A;
            padding: 16px 16px 8px;
            margin: 0;
          }

          .taxonomy-search-results {
            padding: 0;
          }

          .taxonomy-search-item {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 12px 16px;
            background: none;
            border: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            cursor: pointer;
            text-align: left;
            color: #fff;
            transition: background 150ms ease;
          }

          .taxonomy-search-item:hover {
            background: rgba(255, 255, 255, 0.03);
          }

          .taxonomy-search-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .taxonomy-search-name {
            font-size: 14px;
            font-weight: 500;
          }

          .taxonomy-search-level {
            font-size: 11px;
            color: #71717A;
            text-transform: uppercase;
            letter-spacing: 0.03em;
          }

          .taxonomy-search-count {
            font-size: 12px;
            color: #A78BFA;
            flex-shrink: 0;
          }

          .taxonomy-search-arrow {
            color: #3F3F46;
            flex-shrink: 0;
          }

          /* ==================== VIDEO GRID ==================== */
          .videos-section {
            padding: 0 16px 16px;
          }

          .result-count {
            font-size: 14px;
            color: #71717A;
            text-align: center;
            padding: 8px 0 12px;
          }

          .video-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
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

          .gi-badge {
            background: rgba(139, 92, 246, 0.15);
            color: #A78BFA;
            border: 1px solid rgba(139, 92, 246, 0.3);
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

function VideoCard({ video, isSaved, onToggleSave, onPlay }: {
  video: Video;
  isSaved: boolean;
  onToggleSave: (id: number, e: React.MouseEvent) => void;
  onPlay: (videoId: string, title: string, instructor: string) => void;
}) {
  return (
    <div
      className="video-card"
      data-testid={`video-card-${video.id}`}
      onClick={() => video.videoId && onPlay(video.videoId, video.techniqueName || video.title, video.instructorName)}
    >
      <div className="video-thumbnail">
        <ThumbnailImage
          thumbnailUrl={video.thumbnailUrl}
          videoId={video.videoId}
          title={video.techniqueName || video.title}
        />
        <div className="play-overlay">
          <div className="play-button-circle">&#9654;</div>
        </div>
        <button
          className="save-button"
          data-testid={`button-save-${video.id}`}
          onClick={(e) => onToggleSave(video.id, e)}
        >
          <Heart
            className="heart-icon"
            fill={isSaved ? "#ff4444" : "none"}
            stroke={isSaved ? "#ff4444" : "#fff"}
          />
        </button>
        {video.qualityScore > 0 && (
          <div className="quality-badge">
            {video.qualityScore.toFixed(1)}
          </div>
        )}
      </div>
      <div className="video-info">
        <h3 className="video-title">{video.techniqueName || video.title}</h3>
        <p className="video-instructor">{video.instructorName}</p>
        <div className="video-metadata">
          {video.giOrNogi && (
            <span className="metadata-badge gi-badge" data-testid={`badge-gi-${video.id}`}>
              {video.giOrNogi === 'gi' ? 'Gi' : video.giOrNogi === 'nogi' ? 'No-Gi' : 'Both'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
