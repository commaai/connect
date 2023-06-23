import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgrPlugin from 'vite-plugin-svgr';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  let sentryPlugin;
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_AUTH_TOKEN) {
    // TODO: delete source maps
    sentryPlugin = sentryVitePlugin({
      org: 'commaai',
      project: 'connect',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    });
  }

  // expose .env as process.env instead of import.meta.env
  // Reference: https://github.com/vitejs/vite/issues/1449#issuecomment-857686209
  const env = loadEnv(mode, process.cwd(), "VITE_APP");

  // Optional: Populate NODE_ENV with the current mode (development/production)
  env.NODE_ENV = mode;

  return {
    build: {
      sourcemap: true,
    },
    plugins: [
      // TODO: compression plugin
      react(),
      svgrPlugin(),
      sentryPlugin,
    ].filter(Boolean),
    define: {
      'process.env': JSON.stringify(env),
    },
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
