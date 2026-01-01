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
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
