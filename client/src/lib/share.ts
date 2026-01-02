import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

export interface ShareOptions {
  title: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

export async function shareContent(options: ShareOptions): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({
        title: options.title,
        text: options.text,
        url: options.url,
        dialogTitle: options.dialogTitle || 'Share',
      });
      return true;
    } else {
      if (navigator.share) {
        await navigator.share({
          title: options.title,
          text: options.text,
          url: options.url,
        });
        return true;
      } else {
        if (options.url) {
          await navigator.clipboard.writeText(options.url);
          return true;
        }
        return false;
      }
    }
  } catch (error: any) {
    // User cancelled - don't treat as error (iOS returns 'ERR_CANCELED' or 'cancel')
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorName = error?.name?.toLowerCase() || '';
    if (errorName === 'aborterror' || 
        errorMessage.includes('cancel') || 
        errorMessage.includes('abort') ||
        errorMessage.includes('dismiss')) {
      return false;
    }
    console.warn('Share failed:', error);
    return false;
  }
}

export async function shareVideo(title: string, instructor: string, videoId: string): Promise<boolean> {
  // Validate videoId exists
  if (!videoId) {
    console.warn('Share failed: No video ID provided');
    return false;
  }
  
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const text = `${title} by ${instructor}\n\n🎥 ${url}\n\nhttps://bjjos.app\n\nBJJ OS gives you a full breakdown of every video - key timestamps, instructor tips, common mistakes. No more scrubbing through 20-minute videos to find the good stuff: https://bjjos.app`;
  
  return shareContent({
    title: title || 'BJJ Technique',
    text,
    dialogTitle: 'Share this technique',
  });
}

export async function canShare(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return true;
  }
  return !!navigator.share || !!navigator.clipboard;
}
