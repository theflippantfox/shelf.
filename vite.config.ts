import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      // Disabled in dev: Vite serves all modules on demand over HTTP,
      // so the precache is empty and offline navigation can't work.
      // The SW only runs in production builds where the manifest is
      // populated with the real /_app/immutable/* assets.
      devOptions: { enabled: false },

      // We register the service worker manually in app.html so we control
      // exactly when it runs and which errors surface.
      registerType: 'autoUpdate',
      injectRegister: null,
      // Use injectManifest so we can write our own service worker
      // (src/service-worker.ts).  The auto-generated workbox SW
      // doesn't let us intercept POSTs to /api/sales for the
      // offline write queue, so we do it ourselves.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      injectManifest: {
        // Keep the precache list compact — only the entry points and
        // a few critical assets.  Workbox precaches everything it
        // finds in `globPatterns` below.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,  // 5 MB
      },

      manifest: false,  // We ship a static manifest.webmanifest in /static/
                         // so the SvelteKit adapter copies it through.
      // SvelteKit adapter-node builds to /build; the SW assets go there too.
    }),
  ],
});