import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bookmark, Search, PlayCircle, Users, Dumbbell, Star } from "lucide-react";
import UserLayout from "@/components/layouts/UserLayout";
import { IOSSpinner } from "@/components/ios-spinner";
import { triggerHaptic } from "@/lib/haptics";

interface SavedVideo {
  id?: number;
  videoUrl: string;
  title: string;
  instructor: string;
  category: string;
  thumbnailUrl?: string;
  duration?: string;
  qualityScore?: number;
  note?: string;
}

export default function SavedVideosPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedInstructor, setSelectedInstructor] = useState<string>("all");
  const [selectedTechnique, setSelectedTechnique] = useState<string>("all");
  const [selectedVideo, setSelectedVideo] = useState<SavedVideo | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  const { data: savedVideosData, isLoading } = useQuery<{ videos: SavedVideo[] }>({
    queryKey: ["/api/ai/saved-videos", user?.id],
    enabled: !!user?.id,
  });

  const savedVideos = savedVideosData?.videos || [];

  const { instructorToTechniques, techniqueToInstructors, allInstructors, allTechniques } = useMemo(() => {
    const instructorToTechniques = new Map<string, Set<string>>();
    const techniqueToInstructors = new Map<string, Set<string>>();
    const instructorSet = new Set<string>();
    const techniqueSet = new Set<string>();
    
    for (const video of savedVideos) {
      const instructor = video.instructor;
      const technique = video.category;
      
      if (instructor) {
        instructorSet.add(instructor);
        if (!instructorToTechniques.has(instructor)) {
          instructorToTechniques.set(instructor, new Set());
        }
        if (technique) {
          instructorToTechniques.get(instructor)!.add(technique);
        }
      }
      
      if (technique) {
        techniqueSet.add(technique);
        if (!techniqueToInstructors.has(technique)) {
          techniqueToInstructors.set(technique, new Set());
        }
        if (instructor) {
          techniqueToInstructors.get(technique)!.add(instructor);
        }
      }
    }
    
    return {
      instructorToTechniques,
      techniqueToInstructors,
      allInstructors: Array.from(instructorSet).sort((a, b) => a.localeCompare(b)),
      allTechniques: Array.from(techniqueSet).sort((a, b) => a.localeCompare(b)),
    };
  }, [savedVideos]);

  const filteredInstructors = useMemo(() => {
    if (selectedTechnique === 'all') {
      return allInstructors;
    }
    const instructorsForTechnique = techniqueToInstructors.get(selectedTechnique);
    if (!instructorsForTechnique) return allInstructors;
    return allInstructors.filter(i => instructorsForTechnique.has(i));
  }, [selectedTechnique, allInstructors, techniqueToInstructors]);

  const filteredTechniques = useMemo(() => {
    if (selectedInstructor === 'all') {
      return allTechniques;
    }
    const techniquesForInstructor = instructorToTechniques.get(selectedInstructor);
    if (!techniquesForInstructor) return allTechniques;
    return allTechniques.filter(t => techniquesForInstructor.has(t));
  }, [selectedInstructor, allTechniques, instructorToTechniques]);

  const handleInstructorChange = (newInstructor: string) => {
    setSelectedInstructor(newInstructor);
    
    if (newInstructor !== 'all' && selectedTechnique !== 'all') {
      const techniquesForInstructor = instructorToTechniques.get(newInstructor);
      if (!techniquesForInstructor || !techniquesForInstructor.has(selectedTechnique)) {
        setSelectedTechnique('all');
      }
    }
  };

  const handleTechniqueChange = (newTechnique: string) => {
    setSelectedTechnique(newTechnique);
    
    if (newTechnique !== 'all' && selectedInstructor !== 'all') {
      const instructorsForTechnique = techniqueToInstructors.get(newTechnique);
      if (!instructorsForTechnique || !instructorsForTechnique.has(selectedInstructor)) {
        setSelectedInstructor('all');
      }
    }
  };

  const getInstructorVideoCount = (instructor: string): number => {
    if (selectedTechnique === 'all') {
      return savedVideos.filter(v => v.instructor === instructor).length;
    }
    return savedVideos.filter(v => v.instructor === instructor && v.category === selectedTechnique).length;
  };

  const getTechniqueVideoCount = (technique: string): number => {
    if (selectedInstructor === 'all') {
      return savedVideos.filter(v => v.category === technique).length;
    }
    return savedVideos.filter(v => v.category === technique && v.instructor === selectedInstructor).length;
  };

  const filteredVideos = useMemo(() => {
    return savedVideos.filter(video => {
      const searchLower = debouncedSearch.toLowerCase();
      const matchesSearch = !debouncedSearch || 
        video.title?.toLowerCase().includes(searchLower) ||
        video.instructor?.toLowerCase().includes(searchLower);
      
      const matchesInstructor = selectedInstructor === 'all' || video.instructor === selectedInstructor;
      const matchesTechnique = selectedTechnique === 'all' || video.category === selectedTechnique;
      
      return matchesSearch && matchesInstructor && matchesTechnique;
    });
  }, [savedVideos, debouncedSearch, selectedInstructor, selectedTechnique]);

  const getVideoId = (video: SavedVideo): string => {
    if (!video.videoUrl) return '';
    if (video.videoUrl.includes('v=')) {
      return video.videoUrl.split('v=')[1]?.split('&')[0] || '';
    }
    return video.videoUrl.split('/').pop() || '';
  };

  const getThumbnailUrl = (video: SavedVideo): string => {
    if (video.thumbnailUrl) return video.thumbnailUrl;
    const videoId = getVideoId(video);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    return '';
  };

  const stats = useMemo(() => ({
    total_videos: savedVideos.length,
    unique_instructors: allInstructors.length,
    unique_techniques: allTechniques.length,
  }), [savedVideos, allInstructors, allTechniques]);

  if (isLoading) {
    return (
      <UserLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <IOSSpinner size="lg" className="text-purple-400 mb-4" />
          <p className="text-muted-foreground">Loading saved videos...</p>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Bookmark className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Saved Videos</h1>
          </div>
          <p className="text-muted-foreground">Your personal collection of BJJ technique videos</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saved Videos</CardTitle>
              <PlayCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-videos">
                {stats.total_videos}
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
                {stats.unique_instructors}
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
                {stats.unique_techniques}
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
              
              <Select value={selectedInstructor} onValueChange={handleInstructorChange}>
                <SelectTrigger className="w-full md:w-[250px]" data-testid="select-instructor">
                  <SelectValue placeholder="All Instructors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Instructors ({filteredInstructors.length})</SelectItem>
                  {filteredInstructors.map((instructor) => (
                    <SelectItem key={instructor} value={instructor}>
                      {instructor} ({getInstructorVideoCount(instructor)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedTechnique} onValueChange={handleTechniqueChange}>
                <SelectTrigger className="w-full md:w-[250px]" data-testid="select-technique">
                  <SelectValue placeholder="All Techniques" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Techniques ({filteredTechniques.length})</SelectItem>
                  {filteredTechniques.map((technique) => (
                    <SelectItem key={technique} value={technique}>
                      {technique} ({getTechniqueVideoCount(technique)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div>
          {filteredVideos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bookmark className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-xl text-muted-foreground">
                  {savedVideos.length === 0 
                    ? "No saved videos yet. Start saving videos from chat!"
                    : "No videos match your filters"
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredVideos.map((video, index) => {
                const videoId = getVideoId(video);
                
                return (
                  <Card 
                    key={video.id || index} 
                    className="overflow-hidden cursor-pointer hover-elevate transition-all" 
                    data-testid={`card-video-${video.id || index}`}
                    onClick={() => setSelectedVideo(video)}
                  >
                    <div className="relative aspect-video bg-muted">
                      <img
                        src={getThumbnailUrl(video)}
                        alt={video.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors">
                        <PlayCircle className="h-12 w-12 text-white opacity-0 hover:opacity-100 transition-opacity" />
                      </div>
                      {video.duration && (
                        <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                          {video.duration}
                        </span>
                      )}
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <h3 className="font-medium text-sm line-clamp-2" title={video.title}>
                        {video.title}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate max-w-[120px]" title={video.instructor}>
                          {video.instructor || 'Unknown'}
                        </span>
                        {video.qualityScore && (
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-yellow-500" />
                            <span>{Number(video.qualityScore).toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                      {video.category && (
                        <Badge variant="secondary" className="text-xs truncate max-w-full">
                          {video.category}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!selectedVideo} onOpenChange={(open) => !open && setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="pr-8 line-clamp-2">{selectedVideo?.title}</DialogTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{selectedVideo?.instructor}</span>
              {selectedVideo?.category && (
                <>
                  <span>-</span>
                  <Badge variant="secondary" className="text-xs">{selectedVideo?.category}</Badge>
                </>
              )}
              {selectedVideo?.qualityScore && (
                <>
                  <span>-</span>
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-yellow-500" />
                    <span>{Number(selectedVideo.qualityScore).toFixed(1)}</span>
                  </div>
                </>
              )}
            </div>
          </DialogHeader>
          <div className="aspect-video w-full">
            {selectedVideo && (
              <iframe
                src={`https://www.youtube.com/embed/${getVideoId(selectedVideo)}?autoplay=1&rel=0`}
                title={selectedVideo.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </UserLayout>
  );
}
