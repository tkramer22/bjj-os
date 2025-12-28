import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface VideoFeedbackButtonsProps {
  videoId: number;
  onFeedback: (videoId: number, helpful: boolean) => void;
  disabled?: boolean;
}

export function VideoFeedbackButtons({ videoId, onFeedback, disabled }: VideoFeedbackButtonsProps) {
  return (
    <div className="feedback-section mt-3 pt-3 border-t">
      <p className="text-sm text-muted-foreground mb-2">Was this helpful?</p>
      <div className="flex gap-2">
        <Button
          onClick={() => onFeedback(videoId, true)}
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={disabled}
          data-testid={`button-feedback-helpful-${videoId}`}
        >
          <ThumbsUp className="w-4 h-4 mr-2" />
          Yes, this helped
        </Button>
        <Button
          onClick={() => onFeedback(videoId, false)}
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={disabled}
          data-testid={`button-feedback-not-helpful-${videoId}`}
        >
          <ThumbsDown className="w-4 h-4 mr-2" />
          No, it wasn't
        </Button>
      </div>
    </div>
  );
}
