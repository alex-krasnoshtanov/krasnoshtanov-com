import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  site: "https://krasnoshtanov.com",

  // Astro 7's default is 'jsx', which applies React's whitespace rules. The
  // docs say a space between two inline elements survives; on the four
  // Family-Website sites it did not, and every one of them sets `true`
  // deliberately. Same choice here, for the same reason.
  compressHTML: true,

  // public/_headers serves this page under `style-src 'self'`, with no
  // 'unsafe-inline' and no hashes — deliberately. An inlined stylesheet is
  // therefore not an optimisation here, it is a stylesheet the browser
  // refuses to apply, and the failure only ever appears in production because
  // `astro dev` and `astro preview` do not read _headers.
  build: { inlineStylesheets: "never" },

  // esbuild, not the default lightningcss.
  //
  // lightningcss folds `animation-timeline` into the `animation` shorthand,
  // because CSS Animations Level 2 puts it there. No browser accepts it
  // there — the shorthand resets the timeline but will not take one as a
  // value — so `animation: linear both settle view()` is invalid and the
  // whole declaration is dropped.
  //
  // That shipped. Every scroll-driven animation on this page was silently
  // dead in production while working perfectly in `astro dev`, and the
  // progress bar, which never got its transform, sat at full width as a
  // permanent line across the top of the screen. scripts/check.mjs now fails
  // the build if an `animation` shorthand in the emitted CSS ever contains
  // view() or scroll() again.
  vite: { build: { cssMinify: "esbuild" } },

  // Self-hosted rather than a <link> to Google's CDN: one less
  // render-blocking third-party request, and no EU question about who gets
  // the visitor's IP. The Fonts API is stable in 7.x, no flag needed.
  fonts: [
    {
      // Bricolage Grotesque carries three axes — opsz 12-96, wdth 75-100,
      // wght 200-800 — and the page animates all three. A static face would
      // need six separate files to do a fraction of it.
      provider: fontProviders.fontsource(),
      name: "Bricolage Grotesque",
      cssVariable: "--font-display",
      weights: ["200 800"],
      styles: ["normal"],
      subsets: ["latin"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "IBM Plex Mono",
      cssVariable: "--font-mono",
      weights: [400, 500],
      styles: ["normal"],
      subsets: ["latin"],
    },
  ],
});
