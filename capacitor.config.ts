import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rioscarehubb.app',
  appName: 'RIOS Proprietários',
  webDir: 'dist',
  // DEVELOPMENT ONLY - Uncomment for hot-reload during development:
  // server: {
  //   url: 'https://3e755580-de69-4b87-9e32-0e8bf7881879.lovableproject.com?forceHideBadge=true',
  //   cleartext: true
  // },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
