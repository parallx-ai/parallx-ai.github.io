# Parallax Labs

Built with [Astro 5](https://astro.build) and [Tailwind CSS v4](https://tailwindcss.com).

## Run locally

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # production build into ./dist
npm run preview  # serve the production build
```

Requires Node 20+.

## Deployment

Push to `main` and `.github/workflows/deploy.yml` builds the site with Astro
and publishes it to GitHub Pages. The custom domain (`www.parallx.ai`) is
preserved via `public/CNAME`.

One-time setup: **Settings → Pages → Source: GitHub Actions**.
