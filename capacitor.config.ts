import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.bjjos.ios',
  appName: 'BJJ OS',
  webDir: 'dist/public',
  // BUNDLED MODE: Server URL disabled - app loads from local bundle
  // This is more reliable than remote loading and preferred for App Store
  server: {
    // url: 'https://bjjos.app/ios-login',  // DISABLED - causes iOS 18 issues
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
      // iOS splash screen sizing
      launchAutoHide: true,
      useDialog: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0A0A0B',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
