import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.assar.optical.accounting',
  appName: 'نظام البصريات المتكامل',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    captureInput: true
  },
  plugins: {
    Keyboard: {
      resize: 'none' as any,
      style: 'dark' as any,
    }
  }
};

export default config;
