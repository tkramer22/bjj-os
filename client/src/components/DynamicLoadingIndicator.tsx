import { useState, useEffect } from 'react';
import '../styles/loading-animations.css';

interface LoadingStage {
  emoji: string;
  text: string;
  duration: number;
}

const STAGES: LoadingStage[] = [
  { emoji: "🔍", text: "Searching 5,000+ analyzed techniques...", duration: 1800 },
  { emoji: "🧠", text: "AI analyzing timestamps, tips, and common mistakes...", duration: 1800 },
  { emoji: "📊", text: "Evaluating instructor credibility across 33 data fields...", duration: 1600 },
  { emoji: "🎯", text: "Finding exact moments that answer your question...", duration: 1600 },
  { emoji: "✍️", text: "Preparing your personalized response...", duration: 1200 }
];

export default function DynamicLoadingIndicator() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (stageIndex < STAGES.length - 1) {
        setStageIndex(stageIndex + 1);
      }
    }, STAGES[stageIndex].duration);

    return () => clearTimeout(timer);
  }, [stageIndex]);

  const stage = STAGES[stageIndex];

  return (
    <div className="dynamic-loading-container" data-testid="dynamic-loading-indicator">
      <span className="loading-emoji">{stage.emoji}</span>
      <span className="loading-message">{stage.text}</span>
      <div className="loading-dots-wrapper">
        <span className="loading-dot">•</span>
        <span className="loading-dot">•</span>
        <span className="loading-dot">•</span>
      </div>
    </div>
  );
}
