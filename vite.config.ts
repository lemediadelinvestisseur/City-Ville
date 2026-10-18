import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Chemins relatifs : le build fonctionne aussi bien à la racine d'un domaine
  // que dans un sous-dossier (GitHub Pages, Capacitor, hébergement statique).
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['src/**/*.test.ts', 'convex/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
    environment: 'node',
  },
});
