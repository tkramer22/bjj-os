import { Play, Bookmark } from "lucide-react";
import { useState } from "react";

interface MobileVideoCardProps {
  videoId: string;
  title: string;
  thumbnail: string;
  instructor: string;
  duration?: string;
  onSave?: () => void;
  onPlay?: () => void;
}

export function MobileVideoCard({
  videoId,
  title,
  thumbnail,
  instructor,
  duration,
  onSave,
  onPlay,
}: MobileVideoCardProps) {
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaved(!saved);
    onSave?.();
  };

  return (
    <div 
      className="mobile-video-card" 
      onClick={onPlay}
      data-testid={`video-card-${videoId}`}
    >
      <div style={{ position: "relative" }}>
        <img 
          src={thumbnail} 
          alt={title} 
          className="mobile-video-thumbnail" 
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(0, 0, 0, 0.6)",
            borderRadius: "50%",
            padding: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Play fill="white" color="white" size={24} />
        </div>
        {duration && (
          <div
            style={{
              position: "absolute",
              bottom: "0.5rem",
              right: "0.5rem",
              background: "rgba(0, 0, 0, 0.8)",
              padding: "0.25rem 0.5rem",
              borderRadius: "4px",
              fontSize: "0.75rem",
            }}
          >
            {duration}
          </div>
        )}
      </div>
      <div className="mobile-video-info">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <h3 className="mobile-video-title">{title}</h3>
          <button
            onClick={handleSave}
            className="mobile-btn-icon"
            style={{ flexShrink: 0 }}
            data-testid={`save-video-${videoId}`}
          >
            <Bookmark fill={saved ? "var(--mobile-primary-purple)" : "none"} />
          </button>
        </div>
        <p className="mobile-video-meta">{instructor}</p>
      </div>
    </div>
  );
}
