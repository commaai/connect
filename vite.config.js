import { copyFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';


function previewBranding() {
  return {
    name: 'preview-branding',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const srcDir = resolve(process.cwd(), 'public/preview-icons');
      const outDir = resolve(process.cwd(), 'dist');
      for (const file of readdirSync(srcDir)) {
        copyFileSync(resolve(srcDir, file), resolve(outDir, file));
      }
      console.log('[preview-branding] swapped in preview icons');
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  let sentryPlugin;
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
    },
    css: {
      postcss: {
        plugins: [tailwindcss, autoprefixer],
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
      sentryPlugin,
      process.env.PREVIEW && previewBranding(),
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
