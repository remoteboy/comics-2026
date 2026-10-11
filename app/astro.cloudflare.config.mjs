import { fileURLToPath } from 'node:url';

import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

function source(path) {
  return fileURLToPath(new URL(path, import.meta.url));
}

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'compile',
  }),
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@/covers/runtime': source('./src/covers/cloudflare-runtime.ts'),
        '@/db/runtime': source('./src/db/cloudflare/runtime.ts'),
        '@/platform/runtime-env': source(
          './src/platform/cloudflare-runtime-env.ts',
        ),
        '@/providers/zap/live/runtime-session-store': source(
          './src/providers/zap/live/cloudflare-session-store.ts',
        ),
      },
    },
  },
});
