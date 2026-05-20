// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.parallx.ai',
  // Emit /about.html instead of /about/index.html so the URL stays stable.
  build: { format: 'file' },
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
