import { CapacitorConfig } from '@capacitor/cli';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://10.0.2.2:3000';

const config: CapacitorConfig = {
  appId: 'com.ross.messenger',
  appName: 'Ross Messenger',
  // www/index.html - Capacitor uchun kerakli entry point
  webDir: 'www',
  server: {
    // Next.js server URL - APK shu URLga ulanadi
    // Production da o'z serveringiz URLini qo'ying
    url: SERVER_URL,
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      'tg-proxy.moxirbekmoxirbek29.workers.dev',
      '*.telegram.org',
      'cdn*.telegram.org',
      '10.0.2.2',
      'localhost',
      '127.0.0.1',
    ],
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    buildOptions: {
      releaseType: 'APK',
    },
  },
  plugins: {
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#17212B',
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
