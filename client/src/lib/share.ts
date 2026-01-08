import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

export interface ShareOptions {
  title: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

export async function shareContent(options: ShareOptions): Promise<boolean> {
  console.log('=== SHARE ATTEMPT ===');
  console.log('Platform:', Capacitor.getPlatform());
  console.log('Is Native:', Capacitor.isNativePlatform());
  console.log('Options:', JSON.stringify(options, null, 2));
  
  try {
    if (Capacitor.isNativePlatform()) {
      console.log('Calling Share.share() for native platform...');
      const result = await Share.share({
        title: options.title,
        text: options.text,
        url: options.url,
        dialogTitle: options.dialogTitle || 'Share',
      });
      console.log('=== SHARE SUCCESS ===', result);
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
    console.log('=== SHARE ERROR ===');
    console.log('Error name:', error?.name);
    console.log('Error message:', error?.message);
    console.log('Full error:', error);
    
    // User cancelled - don't treat as error (iOS returns 'ERR_CANCELED' or 'cancel')
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorName = error?.name?.toLowerCase() || '';
    if (errorName === 'aborterror' || 
        errorMessage.includes('cancel') || 
        errorMessage.includes('abort') ||
        errorMessage.includes('dismiss')) {
      console.log('User cancelled share - not an error');
      return false;
    }
    console.warn('Share failed unexpectedly:', error);
    return false;
  }
}

export async function shareVideo(title: string, instructor: string, videoId: string): Promise<boolean> {
  console.log('=== SHARE VIDEO CALLED ===');
  console.log('Title:', title);
  console.log('Instructor:', instructor);
  console.log('VideoId:', videoId);
  
  // Validate videoId exists
  if (!videoId) {
    console.warn('Share failed: No video ID provided');
    return false;
  }
  
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const text = `${title}\n${instructor}\n\n🎥 ${url}\n\nProfessor OS found this - 3,500+ videos analyzed with timestamps and key details.\n\nhttps://bjjos.app`;
  
  console.log('URL:', url);
  console.log('Calling shareContent...');
  
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
