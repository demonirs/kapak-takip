import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'masked-icon.svg'
      ],

      manifest: {
        name: 'KapakTakip',
        short_name: 'KapakTakip',

        description:
          'Fokus Sağlık TAVI Kapak Takip Sistemi',

        theme_color: '#0f172a',
        background_color: '#0f172a',

        display: 'standalone',

        orientation: 'portrait',

        start_url: '/',

        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            purpose: 'maskable',
            type: 'image/png'
          }
        ]
      }
    })
  ]
});
