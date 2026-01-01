import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

export interface ShareOptions {
  title: string;
  text?: string;
  url?: string;
}

export async function shareContent(options: ShareOptions): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({
        title: options.title,
        text: options.text,
        url: options.url,
        dialogTitle: 'Share',
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
    if (error.name === 'AbortError') {
      return false;
    }
    console.warn('Share failed:', error);
    return false;
  }
}

export async function shareVideo(title: string, instructor: string, videoId: string): Promise<boolean> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const text = `Check out this BJJ technique: ${title} by ${instructor}`;
  
  return shareContent({
    title: `${title} - ${instructor}`,
    text,
    url,
  });
}

export async function canShare(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return true;
  }
  return !!navigator.share || !!navigator.clipboard;
}
