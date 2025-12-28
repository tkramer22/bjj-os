import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AdminLayout } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, PlayCircle, Users, Dumbbell, TrendingUp, Star, AlertCircle, Loader2 } from "lucide-react";

interface Video {
  id: number;
  youtube_id: string;
  title: string;
  instructor_name: string;
  technique_name: string;
  thumbnail_url: string;
  quality_score: number;
  duration: number;
  created_at: string;
}

interface Stats {
  total_videos: number;
  unique_instructors: number;
  unique_techniques: number;
  avg_quality: number;
}

async function fetchWithAuth(url: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  
  if (response.status === 401 || response.status === 403) {
    throw new Error('AUTH_REQUIRED');
  }
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${response.status}`);
  }
  
  return response.json();
}

export default function AdminVideos() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedInstructor, setSelectedInstructor] = useState<string>("all");
  const [selectedTechnique, setSelectedTechnique] = useState<string>("all");
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery<Stats>({
    queryKey: ['/api/admin/videos/stats'],
    queryFn: () => fetchWithAuth('/api/admin/videos/stats'),
    staleTime: 30000,
    retry: false,
  });

  const { data: instructorsData } = useQuery<string[]>({
    queryKey: ['/api/admin/videos/instructors'],
    queryFn: () => fetchWithAuth('/api/admin/videos/instructors'),
    staleTime: 60000,
    retry: false,
    enabled: !authError,
  });

  const { data: techniquesData } = useQuery<string[]>({
    queryKey: ['/api/admin/videos/techniques'],
    queryFn: () => fetchWithAuth('/api/admin/videos/techniques'),
    staleTime: 60000,
    retry: false,
    enabled: !authError,
  });

  const { data: videosData, isLoading, error: videosError } = useQuery<{ videos: Video[]; total: number }>({
    queryKey: ['/api/admin/videos/list', debouncedSearch, selectedInstructor, selectedTechnique],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('q', debouncedSearch);
      if (selectedInstructor && selectedInstructor !== 'all') params.append('instructor', selectedInstructor);
      if (selectedTechnique && selectedTechnique !== 'all') params.append('technique', selectedTechnique);
      params.append('limit', '50');
      return fetchWithAuth(`/api/admin/videos/list?${params.toString()}`);
    },
    staleTime: 10000,
    retry: false,
    enabled: !authError,
  });

  useEffect(() => {
    const error = statsError || videosError;
    if (error && (error as Error).message === 'AUTH_REQUIRED') {
      setAuthError(true);
      navigate('/admin/login');
    }
  }, [statsError, videosError, navigate]);

  if (authError) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground mb-4">Please log in to access the video library.</p>
          <Button onClick={() => navigate('/admin/login')}>Go to Login</Button>
        </div>
      </AdminLayout>
    );
  }

  const stats = statsData || { total_videos: 0, unique_instructors: 0, unique_techniques: 0, avg_quality: 0 };
  const instructors = instructorsData || [];
  const techniques = techniquesData || [];
  const videos = videosData?.videos || [];

  const getThumbnailUrl = (video: Video): string => {
    if (video.thumbnail_url) return video.thumbnail_url;
    if (video.youtube_id) return `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`;
    return '';
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AdminLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Video Library</h1>
          <p className="text-muted-foreground">Manage curated BJJ technique videos</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Videos</CardTitle>
              <PlayCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-videos">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (stats.total_videos?.toLocaleString() || '0')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Instructors</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-instructors">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (stats.unique_instructors?.toLocaleString() || '0')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Techniques</CardTitle>
              <Dumbbell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-techniques">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (stats.unique_techniques?.toLocaleString() || '0')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Quality</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-avg-quality">
                {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (stats.avg_quality ? Number(stats.avg_quality).toFixed(1) : '0.0')}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title or instructor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
              
              <Select value={selectedInstructor} onValueChange={setSelectedInstructor}>
                <SelectTrigger className="w-[200px]" data-testid="select-instructor">
                  <SelectValue placeholder="All Instructors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Instructors</SelectItem>
                  {instructors.map((instructor) => (
                    <SelectItem key={instructor} value={instructor}>
                      {instructor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedTechnique} onValueChange={setSelectedTechnique}>
                <SelectTrigger className="w-[200px]" data-testid="select-technique">
                  <SelectValue placeholder="All Techniques" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Techniques</SelectItem>
                  {techniques.map((technique) => (
                    <SelectItem key={technique} value={technique}>
                      {technique}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading videos...</p>
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No videos found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {videos.map((video) => (
                <Card key={video.id} className="overflow-hidden" data-testid={`card-video-${video.id}`}>
                  <div className="relative aspect-video bg-muted">
                    <img
                      src={getThumbnailUrl(video)}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`;
                      }}
                    />
                    {video.duration && (
                      <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                        {formatDuration(video.duration)}
                      </span>
                    )}
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <h3 className="font-medium text-sm line-clamp-2" title={video.title}>
                      {video.title}
                    </h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate max-w-[120px]" title={video.instructor_name}>
                        {video.instructor_name || 'Unknown'}
                      </span>
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-yellow-500" />
                        <span>{video.quality_score ? Number(video.quality_score).toFixed(1) : '-'}</span>
                      </div>
                    </div>
                    {video.technique_name && (
                      <Badge variant="secondary" className="text-xs truncate max-w-full">
                        {video.technique_name}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
