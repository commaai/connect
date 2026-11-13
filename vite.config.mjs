import { copyFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';


function previewBranding() {
  return {
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.js$/,
    },
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

function devFcmToken() {
  return {
    name: 'dev-fcm-token',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/fcm-token', (req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const { token } = JSON.parse(body);
            console.log(`\n[fcm] ${req.headers['user-agent']}\n`
              + `FCM registration token: ${token}\n`);
          } catch {}
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const devSsl = command === 'serve' && process.argv.includes('--ssl');

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
      host: devSsl || undefined,
      // Local development can use the same Athena client through a same-origin path.
      proxy: {
        '/athena': {
          target: 'https://athena.comma.ai',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/athena/, ''),
        },
      },
    },
    build: {
      // Required for Sentry
      sourcemap: !process.env.E2E,
    },
    plugins: [
      // TODO: compression plugin
      tailwindcss(),
      react(),
      sentryPlugin,
      process.env.PREVIEW && previewBranding(),
      devFcmToken(),
      devSsl && basicSsl(),
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
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.test.{js,jsx,ts,tsx}'],
      setupFiles: ['./config/vitest/setupTests.js'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{js,jsx,ts,tsx}'],
      },
    },
  };
});
