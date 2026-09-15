/**
 * Assembles parts/<Name>.html -> <Name>.dc.html.
 *
 * Two substitutions, both load-bearing:
 *
 *   /*@TOKENS*\/        the shared token block. Artboards share nothing at
 *                      runtime, so it is inlined into each rather than linked.
 *
 *   /*@DATA*\/          the numbers the artboard draws, selected from the same
 *                      ../data/*.json the real site uses. This exists because
 *                      the mockup and the site had already drifted once: the
 *                      artboards were drawing a 1280x720 camera frame when the
 *                      dataset is 720x480, which put every right-side box
 *                      inside the frame instead of outside it. Hand-copied
 *                      numbers drift; derived ones cannot.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "..", "data");
const load = (n) => JSON.parse(readFileSync(join(DATA, `${n}.json`), "utf8"));

const shadow = load("shadow");
const timeline = load("emotion-timeline");

/** What each artboard gets. Kept small: the canvas republishes wholesale. */
const SELECT = {
  Shadow: () => ({
    FRAME: shadow.frame,
    BOXES: shadow.drawn.map((b) => ({ id: b.id, side: b.side, v2: b.v2, v5: b.v5 })),
    LEFT: shadow.predicted_left,
    RIGHT: shadow.predicted_right,
    ABSTAINS: shadow.direction_abstains,
    TOTAL: shadow.total,
  }),
  Mobile: () => ({
    FRAME: shadow.frame,
    // Two per side is all that stays legible at 358px wide.
    BOXES: [
      ...shadow.drawn.filter((b) => b.side === "left").slice(0, 2),
      ...shadow.drawn.filter((b) => b.side === "right").slice(0, 2),
    ].map((b) => ({ id: b.id, side: b.side, v5: b.v5 })),
    LEFT: shadow.predicted_left,
    RIGHT: shadow.predicted_right,
    ABSTAINS: shadow.direction_abstains,
    TOTAL: shadow.total,
  }),
  Timeline: () => ({
    EMOTIONS: timeline.emotions,
    DURATION: timeline.duration_s,
    STAGES: timeline.stages,
    // The two tracks are the SAME classifier over two different transcripts.
    // That is what the section's headline is about; drawing the two
    // classifiers instead would illustrate a different comparison entirely.
    TRACK_A: timeline.scenes.map((s) => [s[0], s[1], s[2]]),
    TRACK_B: timeline.scenes_whisper.map((s) => [s[0], s[1], s[2]]),
  }),
};

const tokens = readFileSync(join(HERE, "_tokens.css"), "utf8");

for (const f of readdirSync(join(HERE, "parts")).filter((n) => n.endsWith(".html"))) {
  const name = f.replace(/\.html$/, "");
  let body = readFileSync(join(HERE, "parts", f), "utf8");
  if (!body.includes("/*@TOKENS*/")) throw new Error(`${f}: missing /*@TOKENS*/ marker`);
  body = body.replace("/*@TOKENS*/", tokens);

  if (body.includes("/*@DATA*/")) {
    if (!SELECT[name]) throw new Error(`${f}: uses /*@DATA*/ but no selector is defined for ${name}`);
    const picked = SELECT[name]();
    const decls = Object.entries(picked)
      .map(([k, v]) => `    var ${k} = ${JSON.stringify(v)};`)
      .join("\n");
    body = body.replace("/*@DATA*/", `// Derived from ../data/ by build-artboards.mjs. Do not hand-edit.\n${decls}`);
  }

  const out = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${name} — krasnoshtanov.com</title>
  <script src="./support.js"></script>
</head>
<body>
${body}
</body>
</html>
`;
  writeFileSync(join(HERE, `${name}.dc.html`), out);
  console.log(`${name}.dc.html  ${(out.length / 1024).toFixed(1)} KB`);
}
