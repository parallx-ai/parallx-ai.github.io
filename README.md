# Parallax Website

Built with [Astro 5](https://astro.build) and [Tailwind CSS v4](https://tailwindcss.com).

## Run locally

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # production build into ./dist
npm run preview  # serve the production build
```

Requires Node 20+.

## Link preview image

The shared social-media and chat link preview uses `src/assets/social-banner.png`. `src/layouts/Base.astro` supplies this image and its intrinsic dimensions to the Open Graph and Twitter card metadata on every page. Replace the image and rebuild to update the banner.

## Deployment

Push to `main` and `.github/workflows/deploy.yml` builds the site with Astro
and publishes it to GitHub Pages. The custom domain (`www.parallx.ai`) is
preserved via `public/CNAME`.

One-time setup: **Settings → Pages → Source: GitHub Actions**.
