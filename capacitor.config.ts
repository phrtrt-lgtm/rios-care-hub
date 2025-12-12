import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rioscarehubb.app',
  appName: 'RIOS Proprietários',
  webDir: 'dist',
  server: {
    url: 'https://portal.rioshospedagens.com.br',
    cleartext: false
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
