/**
 * The gate. Refuses to let a build finish rather than publishing something
 * wrong, in the spirit of CV/.github/workflows/build.yml — which fails if the
 * resume spills onto a second page rather than shipping half a CV.
 *
 *   node scripts/check.mjs --data   before the build: data files and claims
 *   node scripts/check.mjs --dist   after the build:  the emitted HTML
 *
 * The --data pass RECOMPUTES every claim in data/claims.json marked
 * `recompute` or `crosscheck` from the vendored data, and a claim of that
 * class with no check function is itself a failure. The --dist pass asserts
 * each claim's text appears VERBATIM in the HTML, which is what catches a
 * number drifting in the prose rather than in a data file.
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { requiredHashes } from "./csp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));
const sha256 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const problems = [];
const fail = (msg) => problems.push(msg);
const ok = [];
const pass = (msg) => ok.push(msg);

// Per-file ceilings. Set at ~1.3x of what prep.mjs currently emits, so a
// re-prep that forgets to downsample fails here instead of shipping 21 MB.
const BUDGET = {
  "emotion-timeline.json": 12_000,
  "shadow.json": 140_000,
  "cv-platform.json": 6_000,
  "npec.json": 46_000,
};
const TOTAL_BUDGET = 220_000;

// ---------------------------------------------------------------------------
// recompute / crosscheck implementations
// ---------------------------------------------------------------------------

const r4 = (n) => n.toFixed(4);
const pct1 = (n) => (n * 100).toFixed(1) + "%";
const commas = (n) => n.toLocaleString("en-US");

function iou(a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}
const meanBox = (rows) => [0, 1, 2, 3].map((i) => rows.reduce((s, r) => s + r[i], 0) / rows.length);

/** Which integer seconds each track covers, and what it answered there. */
function secondsMap(scenes) {
  const m = new Map();
  for (const [start, end, emotion] of scenes) {
    for (let t = Math.ceil(start); t < end; t++) m.set(t, emotion);
  }
  return m;
}

const CHECKS = {
  perSideMeanBoxFloor() {
    const { gt } = json("data/shadow.json");
    // `xmin < 0` identifies the side, with no ambiguous middle case, because
    // every subject is fully outside the frame (docs/dataset.md).
    const left = gt.filter((r) => r[0] < 0);
    const right = gt.filter((r) => r[0] >= 0);
    const ml = meanBox(left);
    const mr = meanBox(right);
    const total = left.reduce((s, r) => s + iou(ml, r), 0) + right.reduce((s, r) => s + iou(mr, r), 0);
    return { "shadow-floor": r4(total / gt.length) };
  },

  globalMeanBoxFloor() {
    const { gt } = json("data/shadow.json");
    const g = meanBox(gt);
    return { "shadow-global-floor": r4(gt.reduce((s, r) => s + iou(g, r), 0) / gt.length) };
  },

  predictedSideSplit() {
    const { v5_all } = json("data/shadow.json");
    const left = v5_all.filter((r) => r[0] < 0).length;
    return { "shadow-side-split": `${left} / ${v5_all.length - left}` };
  },

  directionAbstentions() {
    const { v5_all } = json("data/shadow.json");
    const abstains = v5_all.filter((r) => r[1] === -1).length;
    return { "shadow-abstentions": `${abstains} / ${v5_all.length}` };
  },

  walkingBaseRate() {
    const { gt } = json("data/shadow.json");
    return { "shadow-base-rate": pct1(gt.reduce((s, r) => s + r[4], 0) / gt.length) };
  },

  sceneAgreement() {
    const { scenes } = json("data/emotion-timeline.json");
    const agreed = scenes.filter((s) => s[4] === 1).length;
    return { "timeline-scene-agreement": `${agreed} / ${scenes.length}` };
  },

  agreementByIntegerSecond() {
    const d = json("data/emotion-timeline.json");
    // THE METHOD IS THE CLAIM. Integer-second sampling gives 61.97%;
    // weighting by overlap duration gives 61.85% over 2,743.7 s. Both round
    // to 62%, so pinning the method here is what stops a rewrite drifting.
    const a = secondsMap(d.scenes);
    const b = secondsMap(d.scenes_whisper);
    let shared = 0;
    let same = 0;
    for (const [t, ea] of a) {
      if (!b.has(t)) continue;
      shared++;
      if (b.get(t) === ea) same++;
    }
    const rate = same / shared;
    const unshared = Math.round(d.duration_s) - shared;
    return {
      "timeline-second-agreement": `${pct1(rate)} of ${commas(shared)}`,
      "timeline-moved": `${(100 - rate * 100).toFixed(0)}%`,
      "timeline-unshared": `${unshared} of the ${commas(Math.round(d.duration_s))} seconds`,
    };
  },

  datasetRows() {
    const { dataset } = json("data/emotion-timeline.json");
    const sourceRows = Object.values(dataset.source_composition).reduce((s, v) => s + v.rows, 0);
    // The published set is the reproducible part plus the synthetic rows that
    // did not survive. If that relation ever breaks, the three numbers on the
    // page are describing different things and must not be shown together.
    const implied = dataset.reproducible_rows + dataset.synthetic_disgust_rows;
    if (implied !== dataset.published_rows) {
      fail(
        `datasetRows: ${commas(dataset.reproducible_rows)} + ${commas(dataset.synthetic_disgust_rows)} = ` +
          `${commas(implied)}, but published_rows is ${commas(dataset.published_rows)}`,
      );
    }
    return {
      "timeline-dataset": `${commas(sourceRows)} → ${commas(dataset.published_rows)}`,
      "timeline-reproducible": commas(dataset.reproducible_rows),
      "timeline-synthetic": commas(dataset.synthetic_disgust_rows),
    };
  },

  primaryAccuracy() {
    const { primary } = json("data/emotion-timeline.json");
    return { "timeline-held-out-acc": r4(primary.held_out_accuracy) };
  },

  bestValF1() {
    const d = json("data/cv-platform.json");
    // epochs are [epoch, train_loss, val_f1, val_iou]
    const best = d.epochs.reduce((m, e) => (e[2] > m[2] ? e : m));
    if (best[0] !== d.best_epoch) {
      fail(`bestValF1: argmax val_f1 is epoch ${best[0]}, but best_epoch records ${d.best_epoch}`);
    }
    return { "platform-best-f1": best[2].toFixed(4), "platform-best-epoch": `epoch ${best[0]}` };
  },

  gainSweep() {
    const { runs } = json("data/npec.json");
    const key = (r) => `${r.kp}/${r.ki}/${r.kd}`;
    const unique = new Set(runs.map(key)).size;
    const best = Math.min(...runs.map((r) => r.settling));
    // The duplicated setting, kept rather than averaged: it is the only
    // measurement of run-to-run variance in the sweep.
    const counts = new Map();
    for (const r of runs) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
    const dupKey = [...counts].find(([, n]) => n > 1)?.[0];
    const dup = runs.filter((r) => key(r) === dupKey).map((r) => r.settling).sort((a, b) => b - a);
    return {
      "npec-settings": String(runs.length),
      "npec-unique": `${unique} distinct settings`,
      "npec-best-settling": `${Math.round(best)} steps`,
      "npec-duplicate-spread": `${dup[0].toFixed(1)} and ${dup[1].toFixed(1)} steps`,
    };
  },

  ppoResults() {
    const { rl } = json("data/npec.json");
    const successes = rl.detail.filter((e) => e[3] === 1).length;
    const mean = rl.detail.reduce((s, e) => s + e[2], 0) / rl.detail.length;
    if (Math.abs(mean - rl.mean_final_distance_mm) > 0.01) {
      fail(
        `ppoResults: mean of per-episode distances is ${mean.toFixed(3)}, ` +
          `but the summary records ${rl.mean_final_distance_mm}`,
      );
    }
    return {
      "npec-ppo-successes": `${successes} / ${rl.detail.length}`,
      "npec-ppo-distance": `${rl.mean_final_distance_mm} ± ${rl.std_final_distance_mm} mm`,
    };
  },
};

// ---------------------------------------------------------------------------
function checkData() {
  const manifest = json("data/manifest.json");
  const claims = json("data/claims.json");

  // 1. Every data file present, parseable, within budget, and unmodified
  //    since prep.mjs wrote it.
  let total = 0;
  for (const [name, limit] of Object.entries(BUDGET)) {
    const p = join(ROOT, "data", name);
    if (!existsSync(p)) {
      fail(`data/${name} is missing — run: npm run prep`);
      continue;
    }
    const text = readFileSync(p, "utf8");
    const bytes = statSync(p).size;
    total += bytes;
    try {
      JSON.parse(text);
    } catch (e) {
      fail(`data/${name} does not parse: ${e.message}`);
      continue;
    }
    if (bytes > limit) fail(`data/${name} is ${bytes} bytes, over its ${limit} ceiling`);
    const recorded = manifest.outputs?.[name]?.sha256;
    if (!recorded) fail(`data/${name} has no manifest entry`);
    else if (recorded !== sha256(text)) {
      fail(`data/${name} was modified after prep.mjs wrote it (hash mismatch). Re-run: npm run prep`);
    }
    if (!JSON.parse(text)._comment) fail(`data/${name} has no _comment provenance block`);
  }
  if (total > TOTAL_BUDGET) fail(`data/ totals ${total} bytes, over the ${TOTAL_BUDGET} ceiling`);
  pass(`4 data files, ${(total / 1024).toFixed(1)} KB total, hashes match the manifest`);

  // 2. No source was read out of a tree with uncommitted changes, because the
  //    commit recorded beside it would not reproduce it.
  const dirty = (manifest.sources ?? []).filter((s) => s.dirty);
  if (dirty.length) {
    fail(`read out of a dirty tree, so not reproducible: ${dirty.map((s) => s.repo + "/" + s.path).join(", ")}`);
  } else {
    pass(`${manifest.sources.length} sources, all read from clean trees`);
  }

  // 3. Recompute every recomputable claim.
  const computed = {};
  const ran = new Set();
  for (const c of claims.claims) {
    if (c.class === "attested") continue;
    if (!c.check) {
      fail(`claim "${c.id}" is class ${c.class} but names no check function`);
      continue;
    }
    if (!CHECKS[c.check]) {
      fail(`claim "${c.id}" names check "${c.check}", which does not exist`);
      continue;
    }
    if (!ran.has(c.check)) {
      ran.add(c.check);
      Object.assign(computed, CHECKS[c.check]());
    }
  }
  let verified = 0;
  for (const c of claims.claims) {
    if (c.class === "attested") continue;
    if (!(c.id in computed)) {
      fail(`claim "${c.id}" was not produced by check "${c.check}"`);
      continue;
    }
    if (computed[c.id] !== c.text) {
      fail(`claim "${c.id}": page says "${c.text}", recomputed "${computed[c.id]}"`);
    } else verified++;
  }
  pass(`${verified} claims recomputed and matched`);

  const attested = claims.claims.filter((c) => c.class === "attested");
  for (const c of attested) {
    if (!c.source) fail(`attested claim "${c.id}" names no source`);
  }
  pass(`${attested.length} attested claims, each with a named source`);
}

// ---------------------------------------------------------------------------
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function checkDist() {
  const dist = join(ROOT, "dist");
  if (!existsSync(dist)) return fail("dist/ does not exist — run the build first");
  const files = walk(dist);
  const html = files.filter((f) => extname(f) === ".html");
  const indexPath = join(dist, "index.html");
  if (!existsSync(indexPath)) return fail("dist/index.html is missing");
  const index = readFileSync(indexPath, "utf8");

  // One page. Mechanically, not as an intention.
  const pages = html.filter((f) => !f.endsWith("404.html"));
  if (pages.length !== 1) {
    fail(`expected exactly 1 page, found ${pages.length}: ${pages.map((f) => f.replace(dist, "")).join(", ")}`);
  } else pass("exactly one page");

  // Weight. The JS ceiling is what makes "no UI framework" a fact.
  const js = files.filter((f) => extname(f) === ".js").reduce((s, f) => s + statSync(f).size, 0);
  const fonts = files.filter((f) => [".woff2", ".woff", ".ttf"].includes(extname(f)))
    .reduce((s, f) => s + statSync(f).size, 0);
  const totalBytes = files.reduce((s, f) => s + statSync(f).size, 0);
  const weigh = (label, got, limit) => {
    if (got > limit) fail(`${label} is ${(got / 1024).toFixed(1)} KB, over its ${(limit / 1024).toFixed(0)} KB ceiling`);
    else pass(`${label} ${(got / 1024).toFixed(1)} KB (ceiling ${(limit / 1024).toFixed(0)} KB)`);
  };
  weigh("index.html", Buffer.byteLength(index), 140_000);
  weigh("total JS", js, 25_000);
  weigh("total fonts", fonts, 200_000);
  weigh("dist total", totalBytes, 1_400_000);

  // Head essentials.
  for (const needle of ['property="og:title"', 'property="og:description"', 'rel="canonical"', "<title>"]) {
    if (!index.includes(needle)) fail(`dist/index.html is missing ${needle}`);
  }

  // og:image is optional, but a DECLARED one must exist at the declared size.
  // A link card with a 404'd image is worse than one with no image, and the
  // failure is invisible until someone pastes the URL into LinkedIn — which
  // is exactly when it matters. Dimensions are read the same way the CV
  // repo's workflow reads them, straight out of the PNG header.
  const og = index.match(/property="og:image"\s+content="([^"]+)"/);
  if (og) {
    const file = join(dist, og[1].replace(/^https?:\/\/[^/]+/, ""));
    if (!existsSync(file)) {
      fail(`og:image declares ${og[1]} but ${file.replace(dist, "dist")} does not exist`);
    } else {
      const buf = readFileSync(file);
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      const want = [index.match(/og:image:width"\s+content="(\d+)"/)?.[1], index.match(/og:image:height"\s+content="(\d+)"/)?.[1]];
      if (want[0] && (+want[0] !== w || +want[1] !== h)) {
        fail(`og:image is ${w}x${h} but the page declares ${want[0]}x${want[1]}`);
      } else pass(`og:image present, ${w}x${h}`);
    }
  } else {
    pass("no og:image declared (link cards will be text-only)");
  }
  const h1s = index.match(/<h1[\s>]/g) ?? [];
  if (h1s.length !== 1) fail(`expected exactly 1 <h1>, found ${h1s.length}`);
  else pass("one <h1>, head metadata present");

  // Every claim's text, verbatim. This is the gate that catches prose drift.
  const claims = json("data/claims.json");
  const missing = claims.claims.filter((c) => !index.includes(c.text));
  if (missing.length) {
    fail(`claim text not found verbatim in the page: ${missing.map((c) => `${c.id} ("${c.text}")`).join(", ")}`);
  } else pass(`all ${claims.claims.length} claim strings present verbatim`);

  // Numbers and names that must never reappear.
  //
  // Matched against what a READER encounters — visible text plus accessible
  // names — and not against raw markup. Scanning the markup flagged an SVG
  // `opacity="0.88"` in a bar chart as the forbidden NPEC F1: a guard that
  // fires on something it does not mean is worse than no guard, because the
  // next real hit gets waved through as another false positive.
  const visible = index
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ");
  const accessibleNames = [...index.matchAll(/(?:aria-label|title|alt)="([^"]*)"/gi)]
    .map((m) => m[1])
    .join(" ");
  const readable = visible + " " + accessibleNames;

  for (const d of claims.denied) {
    const re = new RegExp(d.pattern, "i");
    const hit = readable.match(re);
    if (hit) fail(`denied pattern /${d.pattern}/ matched "${hit[0]}" in readable text — ${d.why}`);
  }
  pass(`${claims.denied.length} denied patterns, none in readable text`);

  // Placeholder leakage, in the spirit of Family-Website's check-dist.
  for (const needle of ["undefined", "[object Object]", "localhost", "NaN", "TODO"]) {
    if (index.includes(needle)) fail(`dist/index.html contains "${needle}"`);
  }

  // A figure that rendered to nothing must fail the build rather than ship an
  // empty box. Each one has to carry a non-empty viewBox.
  const figures = index.match(/data-fig="[^"]+"/g) ?? [];
  const viewBoxes = index.match(/viewBox="[^"]+"/g) ?? [];
  if (figures.length && viewBoxes.length < figures.length) {
    fail(`${figures.length} figures but only ${viewBoxes.length} viewBox attributes`);
  } else pass(`${figures.length} figures, each with an svg viewBox`);

  // No architecture label wider than the box it is drawn in.
  //
  // SVG does not wrap or ellipsize, so an oversized <text> draws straight over
  // its neighbour — silently, and at every render size. Plex Mono advances
  // 0.6em per glyph, so the drawn width of each label is exactly computable
  // from the emitted markup, and this fails the build rather than shipping a
  // diagram that reads as a smudge. Anyone lengthening a node label finds out
  // here.
  const PAD = 14;
  let widest = 0;
  for (const [, g] of index.matchAll(/<g class="ar-node"[^>]*>([\s\S]*?)<\/g>/g)) {
    const w = Number(g.match(/<rect[^>]*\swidth="([\d.]+)"/)?.[1]);
    if (!w) {
      fail("an ar-node group has no rect width");
      continue;
    }
    for (const [, size, text] of g.matchAll(/<text[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) {
      const drawn = text.length * 0.6 * Number(size);
      const room = w - PAD * 2;
      widest = Math.max(widest, drawn / room);
      if (drawn > room + 0.5) {
        fail(`architecture label "${text}" draws ${drawn.toFixed(1)} units wide in a ${room.toFixed(1)}-unit box`);
      }
    }
  }
  pass(`architecture labels fit their boxes (widest fills ${(widest * 100).toFixed(0)}%)`);

  // Every inline style the page ships is covered by the CSP that will serve it.
  //
  // This is the failure that cannot be seen locally: `astro dev` and `astro
  // preview` ignore _headers, so a blocked <style> looks perfect right up to
  // the moment it is live. It blocked the @font-face block once, and since
  // --font-display is declared inside that block, the page rendered in Times
  // New Roman rather than merely losing a webfont.
  const shipped = readFileSync(join(dist, "_headers"), "utf8");
  const styleSrc = shipped.match(/style-src ([^;]+)/)?.[1] ?? "";
  if (styleSrc.includes("'unsafe-inline'")) {
    pass("style-src allows inline styles outright, so no hashes are needed");
  } else {
    const need = requiredHashes();
    const missing = need.filter((h) => !styleSrc.includes(h));
    if (missing.length) {
      fail(
        `${missing.length} inline style(s) in the build are not covered by style-src — ` +
          `the browser will block them. Run scripts/csp.mjs after the build.`,
      );
    } else {
      pass(`${need.length} inline style hash(es) present in the shipped style-src`);
    }
  }

  // The CV link is the one thing a recruiter is most likely to click.
  const redirects = read("public/_redirects");
  if (!redirects.includes("/cv.pdf")) fail("public/_redirects has no /cv.pdf rule");

  // External hosts, against an allowlist — catches a typo with no network call.
  const allowed = ["github.com", "linkedin.com", "alex-krasnoshtanov.github.io", "krasnoshtanov.com"];
  const hosts = new Set(
    [...index.matchAll(/https?:\/\/([^/"'\s)]+)/g)].map((m) => m[1]).filter((h) => !h.startsWith("www.w3.org")),
  );
  for (const h of hosts) {
    if (!allowed.some((a) => h === a || h.endsWith("." + a))) fail(`unexpected external host: ${h}`);
  }
  pass(`external hosts: ${[...hosts].join(", ") || "none"}`);
}

// ---------------------------------------------------------------------------
const mode = process.argv[2] ?? "--data";
if (mode === "--data") checkData();
else if (mode === "--dist") checkDist();
else {
  console.error("usage: check.mjs --data | --dist");
  process.exit(2);
}

for (const line of ok) console.log(`  ok    ${line}`);
if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? "s" : ""}:`);
  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.error(`\nRefusing to continue. Publishing a contradiction is worse than publishing nothing.`);
  process.exit(1);
}
console.log(`\n${mode.slice(2)} checks passed.`);
