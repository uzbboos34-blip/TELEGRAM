import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ross.messenger',
  appName: 'Ross Messenger',
  // Development: Next.js server URL ishlatish
  // Production: server.url ni o'chirish va webDir ishlatish
  webDir: '.next/static',
  server: {
    // Development rejimida Next.js server'ga ulanish
    url: process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : undefined,
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      'tg-proxy.moxirbekmoxirbek29.workers.dev',
      '*.telegram.org',
      'cdn*.telegram.org',
      'localhost',
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
