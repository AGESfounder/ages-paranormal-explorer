import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ages.explorer',
  appName: 'AGES Paranormal Explorer',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;