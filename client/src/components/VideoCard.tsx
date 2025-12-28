import { Play, Trash2, Video, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface VideoCardProps {
  video: {
    id: string;
    videoId: string;
    title: string;
    instructorName: string;
    thumbnailUrl?: string;
    keyDetail?: string;
    keyDetailTimestamp?: number;
    videoLengthSeconds?: number;
    qualityScore?: number;
    createdAt?: string;
  };
  onPlay: (videoId: string, startTime: number, title: string, instructor: string) => void;
  showAdminControls?: boolean;
  onDelete?: (id: string) => void;
}

export function VideoCard({
  video,
  onPlay,
  showAdminControls = false,
  onDelete
}: VideoCardProps) {
  const thumbnailUrl = video.thumbnailUrl || `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`;
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <Card className="overflow-hidden" data-testid={`video-card-${video.id}`}>
      {/* Thumbnail */}
      <div className="relative">
        <img 
          src={thumbnailUrl} 
          alt={video.title} 
          className="w-full aspect-video object-cover"
          data-testid="video-thumbnail"
        />
        {video.videoLengthSeconds && (
          <div className="absolute bottom-2 right-2 bg-black/75 text-white text-xs px-2 py-1 rounded">
            {formatTime(video.videoLengthSeconds)}
          </div>
        )}
      </div>
      
      {/* Content */}
      <CardContent className="p-4">
        <h3 className="font-semibold text-base mb-1 line-clamp-2" data-testid="video-title">
          {video.title}
        </h3>
        <p className="text-muted-foreground text-sm mb-1" data-testid="video-instructor">
          {video.instructorName}
        </p>
        
        {/* Timestamp - When Added to Library */}
        {video.createdAt && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3" data-testid="video-added-timestamp">
            <Clock className="w-3 h-3" />
            <span>Added {formatDistanceToNow(new Date(video.createdAt), { addSuffix: true })}</span>
          </div>
        )}
        
        {/* Key Detail Badge */}
        {video.keyDetail && video.keyDetailTimestamp !== undefined && (
          <div className="bg-primary/10 border border-primary/20 rounded-md p-2 mb-3">
            <p className="text-xs text-primary font-semibold mb-1">
              🎯 Key Detail at {formatTime(video.keyDetailTimestamp)}
            </p>
            <p className="text-sm text-foreground/80 line-clamp-2">{video.keyDetail}</p>
          </div>
        )}
      </CardContent>
      
      {/* Action Buttons */}
      <CardFooter className="p-4 pt-0 flex flex-col gap-2">
        <div className="flex gap-2 w-full">
          <Button
            onClick={() => onPlay(video.videoId, video.keyDetailTimestamp || 0, video.title, video.instructorName)}
            className="flex-1"
            size="sm"
            data-testid={`button-play-key-detail-${video.id}`}
            disabled={!video.keyDetail && !video.keyDetailTimestamp}
          >
            <Play className="w-3 h-3 mr-1" />
            {video.keyDetailTimestamp ? 'Watch Key Detail' : 'Watch Video'}
          </Button>
          <Button
            onClick={() => onPlay(video.videoId, 0, video.title, video.instructorName)}
            variant="outline"
            className="flex-1"
            size="sm"
            data-testid={`button-play-full-${video.id}`}
          >
            <Video className="w-3 h-3 mr-1" />
            Full Video
          </Button>
        </div>
        
        {/* Admin Controls */}
        {showAdminControls && (
          <div className="flex items-center justify-between w-full pt-2 border-t">
            {video.qualityScore && (
              <Badge variant="secondary" className="text-xs">
                Quality: {video.qualityScore}/10
              </Badge>
            )}
            {onDelete && (
              <Button
                onClick={() => onDelete(video.id)}
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                data-testid={`button-delete-${video.id}`}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
