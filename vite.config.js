import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgrPlugin from 'vite-plugin-svgr';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  let sentryPlugin;
  if (mode === 'production' && process.env.SENTRY_AUTH_TOKEN) {
    sentryPlugin = sentryVitePlugin({
      org: 'commaai',
      project: 'connect',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    });
  }

  return {
    build: {
      // Required for Sentry
      // TODO: delete source maps
      sourcemap: true,
    },
    plugins: [
      // TODO: compression plugin
      react(),
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
