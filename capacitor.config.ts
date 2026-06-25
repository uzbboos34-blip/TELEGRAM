import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ross.messenger',
  appName: 'Ross Messenger',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      'tg-proxy.moxirbekmoxirbek29.workers.dev',
      '*.telegram.org',
      'cdn*.telegram.org',
    ],
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#17212B',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#17212B',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
