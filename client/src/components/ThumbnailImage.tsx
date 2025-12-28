import { useState, useMemo, useEffect } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Play } from "lucide-react";

interface ThumbnailImageProps {
  thumbnailUrl?: string;
  videoId?: string;
  title: string;
  className?: string;
}

export function ThumbnailImage({ thumbnailUrl, videoId, title, className = "" }: ThumbnailImageProps) {
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Build ordered list of thumbnail sources to try (highest quality first)
  const sources = useMemo(() => {
    const urls: string[] = [];
    if (thumbnailUrl && thumbnailUrl.trim()) urls.push(thumbnailUrl);
    if (videoId && videoId.trim()) {
      // Try multiple YouTube thumbnail quality levels with fallbacks
      urls.push(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
      urls.push(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
      urls.push(`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`);
      urls.push(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`);
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
        <div className="w-full h-full bg-[#0A0A0B] rounded-lg flex items-center justify-center border border-[#1A1A1C]">
          <img 
            src="/bjjos-logo.png" 
            alt="BJJ OS" 
            className="h-8 w-auto opacity-60"
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

  return (
    <AspectRatio ratio={16 / 9} className={className}>
      <div className="relative w-full h-full rounded-lg overflow-hidden bg-[#1A1A1C]">
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
          onLoad={() => setIsLoading(false)}
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
