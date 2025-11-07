import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.3e755580de694b879e320e8bf7881879',
  appName: 'rios-care-hub',
  webDir: 'dist',
  server: {
    url: 'https://3e755580-de69-4b87-9e32-0e8bf7881879.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
