import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

interface DetailedFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (category: string, text?: string) => void;
  videoTitle?: string;
}

const feedbackOptions = [
  {
    value: "video_quality_poor",
    label: "Poor video quality (unclear, bad audio)",
  },
  {
    value: "wrong_recommendation",
    label: "Not what I was looking for",
  },
  {
    value: "too_advanced",
    label: "Too advanced for my level",
  },
  {
    value: "too_basic",
    label: "Too basic for my level",
  },
  {
    value: "wrong_style",
    label: "Wrong style (wanted gi/no-gi)",
  },
  {
    value: "other",
    label: "Other reason",
  },
];

export function DetailedFeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  videoTitle,
}: DetailedFeedbackModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [feedbackText, setFeedbackText] = useState<string>("");

  const handleSubmit = () => {
    if (selectedCategory) {
      onSubmit(selectedCategory, feedbackText || undefined);
      setSelectedCategory("");
      setFeedbackText("");
      onClose();
    }
  };

  const handleSkip = () => {
    setSelectedCategory("");
    setFeedbackText("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]" data-testid="modal-detailed-feedback">
        <DialogHeader>
          <DialogTitle>Why wasn't it helpful?</DialogTitle>
          <DialogDescription>
            This helps Professor OS learn and improve recommendations for everyone
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={selectedCategory} onValueChange={setSelectedCategory}>
            <div className="space-y-3">
              {feedbackOptions.map((option) => (
                <div key={option.value} className="flex items-start space-x-3">
                  <RadioGroupItem
                    value={option.value}
                    id={option.value}
                    className="mt-0.5"
                    data-testid={`radio-${option.value}`}
                  />
                  <Label
                    htmlFor={option.value}
                    className="font-normal cursor-pointer flex-1 leading-relaxed"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </RadioGroup>

          <div className="pt-2">
            <Label htmlFor="feedback-text" className="text-sm text-muted-foreground">
              Any additional details? (optional)
            </Label>
            <Textarea
              id="feedback-text"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Tell us more..."
              className="mt-2 min-h-[80px]"
              data-testid="textarea-feedback-text"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            onClick={handleSkip}
            variant="ghost"
            data-testid="button-skip-feedback"
          >
            Skip
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedCategory}
            data-testid="button-submit-feedback"
          >
            Submit Feedback
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
