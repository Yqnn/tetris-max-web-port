import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/tetris-max-web-port/',
  build: {
    outDir: 'docs',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Tetris Max',
        short_name: 'Tetris Max',
        description: 'Tetris Max - Classic Mac-style Tetris',
        display: 'fullscreen',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          {
            src: 'pwa.png',
            sizes: 'any',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa.png',
            sizes: 'any',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,ico,webmanifest,wav}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
