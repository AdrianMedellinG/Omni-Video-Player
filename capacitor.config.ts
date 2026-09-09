import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tv.omni.player',
  appName: 'Omni Video Player',
  webDir: 'dist-web',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
};

export default config;
