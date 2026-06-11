import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import svgrPlugin from 'vite-plugin-svgr';
import { sentryVitePlugin } from '@sentry/vite-plugin';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const input = {
    main: resolve(rootDir, 'index.html'),
  };
  let sentryPlugin;
  if (mode !== 'production' || process.env.WEBRTC_LATENCY_TEST) {
    input['webrtc-latency-runner'] = resolve(rootDir, 'src/__puppeteer__/webrtc-latency-runner.html');
  }

  if (mode === 'production' && process.env.SENTRY_AUTH_TOKEN) {
    sentryPlugin = sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: 'commaai',
      project: 'connect',
      sourcemaps: {
        filesToDeleteAfterUpload: ['**/*.map'],
      },
    });
  }

  return {
    server: {
      port: 3000,
    },
    build: {
      // Required for Sentry
      sourcemap: true,
      rollupOptions: {
        input,
      },
    },
    plugins: [
      // TODO: compression plugin
      react(),
      VitePWA({
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,webp,svg,ico}'],
          // TODO: revisit, throw error during build if too large?
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          sourcemap: true,
        },
      }),
      svgrPlugin(),
      sentryPlugin,
    ].filter(Boolean),
    optimizeDeps: {
      esbuildOptions: {
        // Node.js global to browser globalThis
        // Required for Material UI v1
        define: {
          global: 'globalThis',
        },
      },
    },
  };
});
