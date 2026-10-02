import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import { VitePWA } from 'vite-plugin-pwa';

const pwaPlugins = VitePWA({
  registerType: 'autoUpdate',
  outDir: 'dist/client',
  includeAssets: ['icon-192.png', 'icon-512.png', 'favicon.svg', 'manifest.json'],
  manifest: false,
  workbox: {
    globDirectory: 'dist/client',
    swDest: 'dist/client/sw.js',
    globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
    globIgnores: ['**/exercises/**'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//, /^\/exercises\//],
    runtimeCaching: [{
      urlPattern: /\/exercises\/.*\.svg$/,
      handler: 'CacheFirst',
      options: { cacheName: 'training-art-v1', expiration: { maxEntries: 906 } },
    }],
  },
});

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  server: { host: '127.0.0.1' },
  integrations: [svelte(), {
    name: 'training-pwa-after-prerender',
    hooks: {
      // Astro 7 Cloudflare has multiple Vite environments; generate only after
      // prerender has emitted the pages and use the client output explicitly.
      'astro:build:done': async () => {
        const plugin = pwaPlugins.find(plugin => plugin.api?.generateSW);
        if (!plugin) throw new Error('PWA build API missing');
        await plugin.api.generateSW();
      },
    },
  }],
  vite: {
    optimizeDeps: {
      exclude: ['@astrojs/svelte/server.js', '@astrojs/svelte', '@astrojs/cloudflare/entrypoints/server', 'astro/logger/console'],
    },
    plugins: pwaPlugins,
  },
});
