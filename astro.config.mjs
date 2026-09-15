import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  site: "https://krasnoshtanov.com",

  // Astro 7's default is 'jsx', which applies React's whitespace rules. The
  // docs say a space between two inline elements survives; on the four
  // Family-Website sites it did not, and every one of them sets `true`
  // deliberately. Same choice here, for the same reason.
  compressHTML: true,

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
