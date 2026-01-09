import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.bjjos.ios',
  appName: 'BJJ OS',
  webDir: 'dist/public',
  server: {
    url: 'https://bjjos.app',
    androidScheme: 'https',
    iosScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#0A0A0B',
    scheme: 'BJJ OS'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0A0A0B',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      iosSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: true,
      launchAutoHide: true,
      useDialog: false,
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#0A0A0B',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      style: 'dark',
    },
    // Google Auth (Android only) - requires Google Cloud Console setup
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com', // Replace with actual Client ID from Google Cloud Console
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
