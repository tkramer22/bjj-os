import fetch from 'node-fetch';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Voice configurations
export const VOICE_OPTIONS = {
  antoni: {
    id: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni',
    description: 'Warm, friendly, encouraging - Perfect for black belt best friend',
  },
  adam: {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam',
    description: 'Deep, authoritative, confident - Instructional tone',
  },
};

interface TTSOptions {
  text: string;
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export async function textToSpeech(options: TTSOptions): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY) {
    console.warn('[ELEVENLABS] API key not configured');
    return null;
  }

  const {
    text,
    voiceId = VOICE_OPTIONS.antoni.id,
    stability = 0.60,
    similarityBoost = 0.80,
    style = 0.40,
    useSpeakerBoost = true,
  } = options;

  try {
    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5', // Fast, high-quality model
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: useSpeakerBoost,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[ELEVENLABS] TTS API error:', error);
      return null;
    }

    const audioBuffer = await response.arrayBuffer();
    return Buffer.from(audioBuffer);
  } catch (error) {
    console.error('[ELEVENLABS] TTS error:', error);
    return null;
  }
}

// Get character count for cost tracking
export function getCharacterCount(text: string): number {
  return text.length;
}

// Estimate cost (ElevenLabs Creator plan: ~$0.30 per 1000 characters)
export function estimateCost(characterCount: number): number {
  return (characterCount / 1000) * 0.30;
}

// Optimize text for voice output (remove URLs, clean formatting)
export function optimizeForVoice(text: string): string {
  return text
    // Remove [VIDEO: ...] tags
    .replace(/\[VIDEO:.*?\]/g, '')
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}
