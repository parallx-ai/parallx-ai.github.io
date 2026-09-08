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

## Mailing list signup

`src/components/NewsletterSignup.astro` embeds EmailOctopus form `42205a5c-ab57-11f1-a7c4-0512a1bec2ec` in the homepage News section. The hosted embed owns list settings, submission, confirmation, and reCAPTCHA; the component supplies site-specific styles and accessible status messages. Provider branding is hidden for Parallax's Pro account. Revisit that override if the account plan changes.

## Link preview image

The shared social-media and chat link preview uses `src/assets/social-banner.png`. `src/layouts/Base.astro` supplies this image and its intrinsic dimensions to the Open Graph and Twitter card metadata on every page. Replace the image and rebuild to update the banner.

## Deployment

Push to `main` and `.github/workflows/deploy.yml` builds the site with Astro
and publishes it to GitHub Pages. The custom domain (`www.parallx.ai`) is
preserved via `public/CNAME`.

One-time setup: **Settings → Pages → Source: GitHub Actions**.
