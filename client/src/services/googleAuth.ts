import { Capacitor } from '@capacitor/core';

interface GoogleAuthResult {
  email: string;
  name: string;
  id: string;
  authentication: {
    idToken: string;
  };
}

interface GoogleAuthError {
  code: string;
  message: string;
}

// Dynamic import function that only loads on native Android
// Uses a variable to prevent Vite from analyzing the import at build time
async function loadGoogleAuthPlugin() {
  const moduleName = '@codetrix-studio/capacitor-google-auth';
  // @ts-ignore - Dynamic import with variable to avoid static analysis
  return import(/* @vite-ignore */ moduleName);
}

export const GoogleAuthService = {
  async signIn(): Promise<GoogleAuthResult> {
    const platform = Capacitor.getPlatform();
    
    if (platform !== 'android') {
      throw new Error('Google Sign-In is only available on Android');
    }

    try {
      const { GoogleAuth } = await loadGoogleAuthPlugin();
      const result = await GoogleAuth.signIn();
      
      return {
        email: result.email || '',
        name: result.name || result.givenName || '',
        id: result.id || '',
        authentication: {
          idToken: result.authentication?.idToken || '',
        },
      };
    } catch (error: any) {
      console.error('[GoogleAuth] Sign-in error:', error);
      
      if (error.message?.includes('12501') || 
          error.message?.includes('canceled') ||
          error.message?.includes('cancelled')) {
        const cancelError: GoogleAuthError = {
          code: 'CANCELLED',
          message: 'Sign-in was cancelled',
        };
        throw cancelError;
      }
      
      if (error.message?.includes('Cannot find module') ||
          error.message?.includes('Failed to fetch dynamically imported module')) {
        const moduleError: GoogleAuthError = {
          code: 'MODULE_NOT_FOUND',
          message: 'Google Sign-In plugin not available. Please update the app.',
        };
        throw moduleError;
      }
      
      throw error;
    }
  },

  async signOut(): Promise<void> {
    const platform = Capacitor.getPlatform();
    
    if (platform !== 'android') {
      return;
    }

    try {
      const { GoogleAuth } = await loadGoogleAuthPlugin();
      await GoogleAuth.signOut();
    } catch (error) {
      console.error('[GoogleAuth] Sign-out error:', error);
    }
  },
};
