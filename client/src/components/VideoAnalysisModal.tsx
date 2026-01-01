import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Star, Clock, AlertTriangle, Lightbulb, Target, ChevronRight, Loader2, Brain, Dumbbell, Share2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { shareVideo } from "@/lib/share";

interface VideoAnalysis {
  video: {
    id: number;
    title: string;
    techniqueName: string;
    instructorName: string;
    youtubeId: string;
    thumbnailUrl?: string;
    duration: string;
    difficultyScore?: number;
    giOrNogi: string;
    qualityScore?: number;
    positionCategory?: string;
    techniqueType?: string;
    beltLevel?: string[];
    keyTimestamps?: Array<{ time: string; description: string; importance?: string }>;
    keyDetails?: string[];
    commonMistakes?: string[];
    problemsSolved?: string[];
    prerequisites?: string[];
    setupTimestamp?: string;
    executionTimestamp?: string;
    troubleshootingTimestamp?: string;
    commonMistakesTimestamp?: string;
  };
  techniques: Array<{
    id: number;
    techniqueName: string;
    positionContext?: string;
    techniqueType?: string;
    skillLevel?: string;
    keyConcepts?: string[];
    instructorTips?: string[];
    commonMistakes?: string[];
    timestampStart?: string;
    timestampEnd?: string;
    whyItMatters?: string;
    problemSolved?: string;
    setupsFrom?: string[];
    chainsTo?: string[];
  }>;
  hasGeminiAnalysis: boolean;
}

interface VideoAnalysisModalProps {
  videoId: number;
  onClose: () => void;
  onTimestampClick?: (time: string) => void;
}

function getDifficultyLabel(score?: number): string {
  if (!score) return 'All Levels';
  if (score <= 3) return 'Beginner';
  if (score <= 6) return 'Intermediate';
  return 'Advanced';
}

function getDifficultyColor(score?: number): string {
  if (!score) return '#71717A';
  if (score <= 3) return '#22C55E';
  if (score <= 6) return '#F59E0B';
  return '#EF4444';
}

function formatGiNogi(value: string): string {
  if (value === 'gi') return 'Gi';
  if (value === 'nogi') return 'No-Gi';
  return 'Both';
}

export function VideoAnalysisModal({ videoId, onClose, onTimestampClick }: VideoAnalysisModalProps) {
  const { data, isLoading, error } = useQuery<VideoAnalysis>({
    queryKey: ['/api/ai/videos', videoId, 'analysis'],
    queryFn: async () => {
      const res = await fetch(`/api/ai/videos/${videoId}/analysis`);
      if (!res.ok) throw new Error('Failed to fetch analysis');
      return res.json();
    },
    enabled: !!videoId,
  });

  const handleTimestampTap = (time: string) => {
    triggerHaptic('light');
    if (onTimestampClick) {
      onTimestampClick(time);
    }
  };

  if (isLoading) {
    return (
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onClose}
      >
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="animate-spin" size={40} color="#8B5CF6" />
          <p style={{ color: '#fff', marginTop: '16px' }}>Loading analysis...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onClose}
      >
        <div style={{ 
          background: '#1A1A1D', 
          padding: '24px', 
          borderRadius: '16px',
          textAlign: 'center',
          maxWidth: '300px',
        }}>
          <AlertTriangle size={40} color="#EF4444" style={{ marginBottom: '16px' }} />
          <p style={{ color: '#fff' }}>Analysis not available</p>
          <button
            onClick={onClose}
            data-testid="button-close-analysis-error"
            style={{
              marginTop: '16px',
              padding: '8px 24px',
              background: '#8B5CF6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const { video, techniques, hasGeminiAnalysis } = data;
  const keyTimestamps = Array.isArray(video.keyTimestamps) ? video.keyTimestamps : [];
  const allTimestamps: Array<{ time: string; label: string; type: string }> = [];
  
  if (video.setupTimestamp) allTimestamps.push({ time: video.setupTimestamp, label: 'Setup', type: 'setup' });
  if (video.executionTimestamp) allTimestamps.push({ time: video.executionTimestamp, label: 'Execution', type: 'execution' });
  if (video.troubleshootingTimestamp) allTimestamps.push({ time: video.troubleshootingTimestamp, label: 'Troubleshooting', type: 'troubleshooting' });
  if (video.commonMistakesTimestamp) allTimestamps.push({ time: video.commonMistakesTimestamp, label: 'Common Mistakes', type: 'mistakes' });
  
  keyTimestamps.forEach(ts => {
    if (ts.time && ts.description) {
      allTimestamps.push({ time: ts.time, label: ts.description, type: 'key' });
    }
  });

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        style={{
          flex: 1,
          background: '#0A0A0B',
          marginTop: '40px',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #2A2A2E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Brain size={24} color="#8B5CF6" />
            <span style={{ fontWeight: 600, fontSize: '18px', color: '#fff' }}>Video Analysis</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={async () => {
                triggerHaptic('light');
                await shareVideo(video.title, video.instructorName, video.youtubeId);
              }}
              data-testid="button-share-analysis"
              style={{
                background: '#1A1A1D',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#71717A',
              }}
            >
              <Share2 size={18} />
            </button>
            <button
              onClick={onClose}
              data-testid="button-close-analysis"
              style={{
                background: '#1A1A1D',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#71717A',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
              {video.title}
            </h2>
            <p style={{ color: '#71717A', fontSize: '14px' }}>{video.instructorName}</p>
          </div>

          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '8px', 
            marginBottom: '24px' 
          }}>
            {video.qualityScore && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: '#1A1A1D',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '13px',
                color: '#FFD700',
              }}>
                <Star size={14} fill="#FFD700" />
                {video.qualityScore.toFixed(1)}
              </span>
            )}
            <span style={{
              background: '#1A1A1D',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '13px',
              color: '#fff',
            }}>
              {formatGiNogi(video.giOrNogi)}
            </span>
            <span style={{
              background: '#1A1A1D',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '13px',
              color: getDifficultyColor(video.difficultyScore),
            }}>
              {getDifficultyLabel(video.difficultyScore)}
            </span>
            {video.positionCategory && (
              <span style={{
                background: '#1A1A1D',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '13px',
                color: '#8B5CF6',
              }}>
                {video.positionCategory}
              </span>
            )}
            {video.duration && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: '#1A1A1D',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '13px',
                color: '#71717A',
              }}>
                <Clock size={14} />
                {video.duration}
              </span>
            )}
          </div>

          {allTimestamps.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ 
                fontSize: '15px', 
                fontWeight: 600, 
                color: '#fff', 
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <Clock size={16} color="#8B5CF6" />
                Jump To
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {allTimestamps.map((ts, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleTimestampTap(ts.time)}
                    data-testid={`button-timestamp-${idx}`}
                    style={{
                      background: '#1A1A1D',
                      border: '1px solid #2A2A2E',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  >
                    <span style={{ color: '#8B5CF6', fontWeight: 600 }}>{ts.time}</span>
                    <span>{ts.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasGeminiAnalysis && techniques.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ 
                fontSize: '15px', 
                fontWeight: 600, 
                color: '#fff', 
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <Target size={16} color="#22C55E" />
                Techniques Covered
              </h3>
              {techniques.map((tech, idx) => (
                <div 
                  key={idx}
                  style={{
                    background: '#1A1A1D',
                    border: '1px solid #2A2A2E',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    marginBottom: '12px',
                  }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                        {tech.techniqueName}
                      </h4>
                      {tech.positionContext && (
                        <span style={{ color: '#71717A', fontSize: '13px' }}>{tech.positionContext}</span>
                      )}
                    </div>
                    {tech.timestampStart && (
                      <button
                        onClick={() => handleTimestampTap(tech.timestampStart!)}
                        style={{
                          background: '#1A1A1D',
                          border: '1px solid #2A2A2E',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          color: '#8B5CF6',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Clock size={12} />
                        {tech.timestampStart}
                      </button>
                    )}
                  </div>

                  {tech.keyConcepts && tech.keyConcepts.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <p style={{ fontSize: '12px', color: '#71717A', marginBottom: '6px' }}>Key Concepts</p>
                      <ul style={{ margin: 0, paddingLeft: '16px' }}>
                        {tech.keyConcepts.map((concept, i) => (
                          <li key={i} style={{ fontSize: '13px', color: '#fff', marginBottom: '4px' }}>{concept}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {tech.instructorTips && tech.instructorTips.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <p style={{ fontSize: '12px', color: '#22C55E', marginBottom: '6px' }}>Instructor Tips</p>
                      <ul style={{ margin: 0, paddingLeft: '16px' }}>
                        {tech.instructorTips.map((tip, i) => (
                          <li key={i} style={{ fontSize: '13px', color: '#22C55E', marginBottom: '4px' }}>"{tip}"</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {tech.commonMistakes && tech.commonMistakes.length > 0 && (
                    <div>
                      <p style={{ fontSize: '12px', color: '#EF4444', marginBottom: '6px' }}>Common Mistakes</p>
                      <ul style={{ margin: 0, paddingLeft: '16px' }}>
                        {tech.commonMistakes.map((mistake, i) => (
                          <li key={i} style={{ fontSize: '13px', color: '#EF4444', marginBottom: '4px' }}>{mistake}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {(video.commonMistakes as any)?.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ 
                fontSize: '15px', 
                fontWeight: 600, 
                color: '#fff', 
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <AlertTriangle size={16} color="#EF4444" />
                Common Mistakes
              </h3>
              <div style={{
                background: '#1A1A1D',
                border: '1px solid #2A2A2E',
                borderRadius: '12px',
                padding: '16px',
              }}>
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  {(video.commonMistakes as string[]).map((mistake, idx) => (
                    <li key={idx} style={{ fontSize: '14px', color: '#EF4444', marginBottom: '8px' }}>
                      {mistake}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {(video.keyDetails as any)?.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ 
                fontSize: '15px', 
                fontWeight: 600, 
                color: '#fff', 
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <Lightbulb size={16} color="#F59E0B" />
                Key Details
              </h3>
              <div style={{
                background: '#1A1A1D',
                border: '1px solid #2A2A2E',
                borderRadius: '12px',
                padding: '16px',
              }}>
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  {(video.keyDetails as string[]).map((detail, idx) => (
                    <li key={idx} style={{ fontSize: '14px', color: '#fff', marginBottom: '8px' }}>
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {(video.prerequisites as any)?.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ 
                fontSize: '15px', 
                fontWeight: 600, 
                color: '#fff', 
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <Dumbbell size={16} color="#8B5CF6" />
                Prerequisites
              </h3>
              <div style={{
                background: '#1A1A1D',
                border: '1px solid #2A2A2E',
                borderRadius: '12px',
                padding: '16px',
              }}>
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  {(video.prerequisites as string[]).map((prereq, idx) => (
                    <li key={idx} style={{ fontSize: '14px', color: '#71717A', marginBottom: '8px' }}>
                      {prereq}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!hasGeminiAnalysis && (
            <div style={{
              background: '#1A1A1D',
              border: '1px solid #2A2A2E',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
            }}>
              <Brain size={40} color="#71717A" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#71717A', fontSize: '14px' }}>
                Detailed AI analysis is being processed for this video. Check back soon!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
