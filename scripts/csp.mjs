/**
 * Teaches the shipped CSP about the stylesheets Astro insists on inlining.
 *
 *   node scripts/csp.mjs   between `astro build` and `check.mjs --dist`
 *
 * WHY THIS EXISTS
 *
 * public/_headers serves the page under `style-src 'self'`, with no
 * 'unsafe-inline' — deliberately, and the file says so. Astro's <Font>
 * component emits its @font-face declarations as an inline <style> block, and
 * `build.inlineStylesheets: "never"` does not govern it. Under that header the
 * browser blocks the block, and because --font-display is DECLARED inside it,
 * `font-family: var(--font-display)` then resolves to nothing: the page
 * renders in Times New Roman.
 *
 * None of that is visible locally. `astro dev` and `astro preview` do not read
 * _headers, so the first place it would ever have appeared is the live site.
 *
 * The fix the _headers comment asks for is a hash rather than a loosened
 * policy, and a hash of a build artefact has to be computed per build: the
 * font filenames are content-addressed, so the <style> body changes whenever a
 * font does. This computes them and rewrites dist/_headers. check.mjs --dist
 * then verifies every inline style in the emitted HTML is covered, so a future
 * inline style that nothing hashed fails the build instead of the page.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

/** Every inline <style> body in every emitted page, in document order. */
export function inlineStyles(html) {
  return [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

/** CSP source-expression form of the sha256 of one inline block. */
export const cspHash = (body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;

function htmlFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (extname(p) === ".html") out.push(p);
  }
  return out;
}

/** Every inline-style hash the built pages require, sorted. */
export function requiredHashes() {
  const hashes = new Set();
  for (const file of htmlFiles(DIST)) {
    for (const body of inlineStyles(readFileSync(file, "utf8"))) hashes.add(cspHash(body));
  }
  return [...hashes].sort();
}

function main() {
  const headersPath = join(DIST, "_headers");
  if (!existsSync(headersPath)) {
    console.error("dist/_headers is missing — did the build run?");
    process.exit(1);
  }

  // script-src is 'self' too. Nothing should be emitting an inline script, and
  // if that changes it needs the same treatment rather than silent breakage.
  let inlineScripts = 0;
  for (const file of htmlFiles(DIST)) {
    const html = readFileSync(file, "utf8");
    inlineScripts += [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/g)].length;
  }
  if (inlineScripts) {
    console.error(
      `${inlineScripts} inline <script> in the build, which \`script-src 'self'\` will block. ` +
        `Hash them here the way the styles are hashed, or give the script a src.`,
    );
    process.exit(1);
  }

  const before = readFileSync(headersPath, "utf8");
  const list = requiredHashes().join(" ");
  const after = before.replace(/style-src 'self'/, list ? `style-src 'self' ${list}` : "style-src 'self'");

  if (after === before && list) {
    console.error("could not find `style-src 'self'` in dist/_headers to extend");
    process.exit(1);
  }

  writeFileSync(headersPath, after);
  const n = list ? list.split(" ").length : 0;
  console.log(`  ok    style-src now carries ${n} inline-style hash${n === 1 ? "" : "es"}`);
}

// Only when run as a command. check.mjs imports the helpers above and must not
// trigger the rewrite by doing so.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
