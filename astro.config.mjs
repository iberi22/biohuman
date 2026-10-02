import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  // Escucha explicita en IPv4: por defecto `astro dev` se ata solo a [::1] y cualquier sonda que
  // use http://127.0.0.1 (monitores, `hermes verify`, contenedores, curl desde un host) recibe
  // "connection refused" aunque el servidor este perfectamente vivo.
  server: { host: '127.0.0.1' },
  integrations: [svelte()],
  vite: {
    // El runner de @astrojs/cloudflare carga los modulos SSR por ruta absoluta y el optimizador de
    // dependencias de Vite los re-optimiza y recarga a mitad de vuelo, de modo que `astro dev` moria
    // con: "The file does not exist at node_modules/.vite/deps_ssr/handler-*.js ... Try adding it to
    // optimizeDeps.exclude". Se excluye la integracion de Svelte del optimizador y el arranque queda
    // estable (necesario para `hermes verify` y para cualquier dev local de este template).
    optimizeDeps: {
      exclude: ['@astrojs/svelte/server.js', '@astrojs/svelte', '@astrojs/cloudflare/entrypoints/server', 'astro/logger/console'],
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon-192.png', 'icon-512.png'],
        manifest: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
          globIgnores: ['**/exercises/**'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/exercises\//],
          runtimeCaching: [
            { urlPattern: /\/exercises\/.*\.svg$/, handler: 'CacheFirst', options: { cacheName: 'training-art-v1', expiration: { maxEntries: 906 } } },

          ],
        },
      }),
    ],
  },
});
