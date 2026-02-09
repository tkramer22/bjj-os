import { useState, useMemo, useEffect } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Play } from "lucide-react";
import bjjosLogo from "@assets/bjjos-logo.png";

interface ThumbnailImageProps {
  thumbnailUrl?: string;
  videoId?: string;
  title: string;
  className?: string;
}

export function ThumbnailImage({ thumbnailUrl, videoId, title, className = "" }: ThumbnailImageProps) {
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Validate YouTube ID (must be exactly 11 alphanumeric chars with - and _)
  const isValidYouTubeId = (id: string | undefined): boolean => {
    if (!id) return false;
    return /^[a-zA-Z0-9_-]{11}$/.test(id.trim());
  };

  const isVideoThumbnail = (url: string): boolean => {
    const trimmed = url.trim().toLowerCase();
    if (trimmed.includes('yt3.ggpht.com')) return false;
    if (trimmed.includes('yt3.googleusercontent.com')) return false;
    if (trimmed.includes('/channels/') || trimmed.includes('/channel/')) return false;
    return true;
  };

  // Build ordered list of thumbnail sources to try (highest quality first)
  // When we have a valid YouTube video ID, always prefer YouTube thumbnail URLs
  // to avoid showing channel avatars or stale cached thumbnails
  const sources = useMemo(() => {
    const urls: string[] = [];
    const hasValidVideoId = videoId && isValidYouTubeId(videoId);

    if (hasValidVideoId) {
      const cleanId = videoId!.trim();
      urls.push(`https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`);
      urls.push(`https://img.youtube.com/vi/${cleanId}/mqdefault.jpg`);
      urls.push(`https://i.ytimg.com/vi/${cleanId}/mqdefault.jpg`);
    }

    if (thumbnailUrl && thumbnailUrl.trim() && isVideoThumbnail(thumbnailUrl)) {
      if (!hasValidVideoId) {
        urls.unshift(thumbnailUrl);
      }
    }
    return urls;
  }, [thumbnailUrl, videoId]);

  // Reset source index when props change (e.g., different video in list)
  useEffect(() => {
    setCurrentSourceIndex(0);
    setIsLoading(true);
  }, [sources]);

  const currentUrl = sources[currentSourceIndex];

  // Show branded fallback placeholder with actual logo if we've exhausted all sources
  if (!currentUrl) {
    return (
      <AspectRatio ratio={16 / 9} className={className}>
        <div 
          className="w-full h-full rounded-lg flex items-center justify-center border border-[#1A1A1C]"
          style={{ background: 'linear-gradient(135deg, #0A0A0B 0%, #1A1A1C 50%, #0A0A0B 100%)' }}
        >
          <img 
            src={bjjosLogo} 
            alt="BJJ OS" 
            className="h-10 w-auto opacity-70"
            onError={(e) => {
              // Hide broken image icon if logo fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      </AspectRatio>
    );
  }

  const handleError = () => {
    // Advance to next source in chain (increment beyond array length to trigger placeholder)
    setCurrentSourceIndex(currentSourceIndex + 1);
    setIsLoading(true);
  };

  // Handle load - check for YouTube's placeholder image (120x90 gray image)
  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // YouTube returns a 120x90 gray placeholder when thumbnail doesn't exist
    // The maxresdefault returns 120x90 if video has no HD thumbnail
    if (img.naturalWidth === 120 && img.naturalHeight === 90) {
      // This is YouTube's "no thumbnail" placeholder - try next source
      handleError();
      return;
    }
    setIsLoading(false);
  };

  return (
    <AspectRatio ratio={16 / 9} className={className}>
      <div 
        className="relative w-full h-full rounded-lg overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0A0A0B 0%, #1A1A1C 50%, #0A0A0B 100%)' }}
      >
        {/* Loading skeleton - dark background matching mobile theme */}
        {isLoading && (
          <div className="absolute inset-0 bg-[#2A2A2C] animate-pulse" />
        )}
        
        {/* Thumbnail image */}
        <img
          key={currentUrl}
          src={currentUrl}
          alt={title}
          className={`w-full h-full object-cover transition-opacity duration-200 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
        />

        {/* Play overlay on hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <Play className="w-12 h-12 text-white drop-shadow-lg" />
        </div>
      </div>
    </AspectRatio>
  );
}
