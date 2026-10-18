import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Application mobile (iOS, puis Android) : le jeu web compilé (dist/) est
 * embarqué dans une coque native.
 * ⚠ `appId` (identifiant de bundle) et `appName` sont provisoires : à fixer
 * avant la première publication (l'identifiant ne pourra plus changer ensuite).
 */
const config: CapacitorConfig = {
  appId: 'fr.lemediadelinvestisseur.cityville',
  appName: 'City Ville',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#2f9fc7',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#2f7fd1',
      showSpinner: false,
    },
  },
};

export default config;
