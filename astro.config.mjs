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
      provider: fontProviders.fontsource(),
      name: "Instrument Sans",
      cssVariable: "--font-display",
      weights: [400, 600],
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
