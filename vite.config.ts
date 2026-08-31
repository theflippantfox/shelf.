import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      // Disabled in dev to keep HMR snappy; the SW is fully active in build.
      // Toggle to `true` to debug the SW locally.
      devOptions: { enabled: false },

      // We register the service worker manually in app.html so we control
      // exactly when it runs and which errors surface.
      registerType: 'autoUpdate',
      injectRegister: null,
      // The Workbox manifest (precache list) is built at build time and
      // registered into the SW automatically. The settings below tell
      // Workbox how to cache runtime requests.
      workbox: {
        // Don't precache dev-only assets.
        navigateFallbackDenylist: [/^\/api\//, /^\/__data\.json/, /^\/_app\/version/],
        // Pages that should always bypass the SW (auth + server-side actions).
        navigateFallback: null,  // Disable SPA navigation fallback; let SvelteKit
                                 // routing handle 404s. Pages will still load from
                                 // the precached shell HTML when offline.
        runtimeCaching: [
          {
            // Google Fonts: stale-while-revalidate so first paint is fast.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // SvelteKit's own hashed static assets under /_app/immutable/
            // — precached by the manifest anyway, but route here for safety.
            urlPattern: /\/_app\/immutable\/.+/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sveltekit-immutable',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // /api/* — always hit the network. If the network fails, return
            // a JSON-shaped 503 so the client's fetch() rejects cleanly.
            // We deliberately do NOT cache API responses, because data
            // freshness is critical for inventory and sales.
            urlPattern: /\/api\/.+/,
            method: 'GET',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'shelf-api-get-queue',
                options: { maxRetentionTime: 24 * 60 },  // 24h in minutes
              },
            },
          },
          {
            // Non-GET /api/* — same: network only, with background sync for
            // queued writes when the user comes back online.
            urlPattern: /\/api\/.+/,
            method: 'POST',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'shelf-api-write-queue',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
        ],
      },

      manifest: false,  // We ship a static manifest.webmanifest in /static/
                         // so the SvelteKit adapter copies it through.
      strategies: 'generateSW',
      srcDir: 'src',
      // SvelteKit adapter-node builds to /build; the SW assets go there too.
    }),
  ],
});