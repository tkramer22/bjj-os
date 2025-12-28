// OpenAI Whisper Integration for Voice Transcription
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
import OpenAI from "openai";
import fs from "fs";
import path from "path";

// This is using OpenAI's API, which points to OpenAI's API servers and requires your own API key.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Transcribe audio file to text using OpenAI Whisper API
 * @param audioFilePath - Path to the audio file
 * @returns Transcription text and duration
 */
export async function transcribeAudio(audioFilePath: string): Promise<{ text: string, duration: number }> {
  try {
    const audioReadStream = fs.createReadStream(audioFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
      language: "en", // Can be made dynamic based on user preference
    });

    // Clean up the temporary file
    fs.unlinkSync(audioFilePath);

    return {
      text: transcription.text,
      duration: transcription.duration || 0,
    };
  } catch (error: any) {
    console.error("Whisper transcription error:", error);
    
    // Clean up file on error
    if (fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
    }
    
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}

/**
 * Transcribe audio buffer directly
 * @param audioBuffer - Audio data buffer
 * @param filename - Original filename
 * @returns Transcription text and duration
 */
export async function transcribeAudioBuffer(audioBuffer: Buffer, filename: string): Promise<{ text: string, duration: number }> {
  // Create temp directory if it doesn't exist
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Save buffer to temp file
  const tempFilePath = path.join(tempDir, `voice-${Date.now()}-${filename}`);
  fs.writeFileSync(tempFilePath, audioBuffer);

  // Transcribe and return
  return await transcribeAudio(tempFilePath);
}
