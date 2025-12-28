// Type declarations for api.js
export function sendChatMessage(userId: string, message: string): Promise<any>;
export function getChatHistory(userId: string, limit?: number, beforeTimestamp?: string | null): Promise<any>;
export function getUserProfile(userId: string): Promise<any>;
export function updateUserProfile(userId: string, updates: any): Promise<any>;
export function getSavedVideos(userId: string): Promise<{ videos: any[] }>;
export function saveVideo(userId: string, videoId: string, note?: string): Promise<any>;
export function unsaveVideo(userId: string, videoId: string): Promise<any>;
export function submitVideoFeedback(userId: string, videoId: string, rating: number, feedback?: string): Promise<any>;
export function transcribeAudio(audioBlob: Blob): Promise<any>;
export function getVoiceSettings(userId: string): Promise<any>;
export function updateVoiceSettings(userId: string, settings: any): Promise<any>;
