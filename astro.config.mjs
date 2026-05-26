// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.parallx.ai',
  // Emit /about.html instead of /about/index.html so the URL stays stable.
  build: { format: 'file' },
  integrations: [mdx()],
  experimental: {
    // Astro-native font pipeline: fetches the requested fontsource families,
    // subsets to latin, generates fallback @font-face with metric-matched
    // ascent/descent (kills most font-swap CLS), and emits preload links
    // via <Font preload /> in Base.astro. Replaces the manual @fontsource
    // imports + handcrafted <link rel="preload"> from earlier.
    fonts: [
      {
        provider: fontProviders.fontsource(),
        name: 'Source Serif 4',
        cssVariable: '--font-display',
        weights: [400, 600],
        styles: ['normal'],
        subsets: ['latin'],
        fallbacks: ['Source Serif Pro', 'Georgia', 'serif'],
      },
      {
        provider: fontProviders.fontsource(),
        name: 'IBM Plex Sans',
        cssVariable: '--font-body',
        weights: [400, 500, 600],
        styles: ['normal'],
        subsets: ['latin'],
        fallbacks: ['-apple-system', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    ],
  },
  vite: {
    plugins: [tailwindcss()],
    // Don't inline small assets as base64 — they're better served as
    // separately cacheable files (favicon, footer mark, etc.). Default
    // is 4096; lowering to 1024 keeps only very tiny assets inlined.
    build: { assetsInlineLimit: 1024 },
  },
});
