/**
 * Derives the small JSON the page draws from, out of the sibling project
 * repositories, and writes a provenance ledger beside it.
 *
 * THIS RUNS LOCALLY AND NEVER IN CI. A runner has none of these repositories,
 * and some of the sources are large (NPEC's tuning file is 21 MB) or
 * gitignored in their own repo. What CI does instead is recompute every
 * published claim from the small vendored files — see scripts/check.mjs.
 *
 * The vendored file is the "committed input"; data/manifest.json is its
 * provenance note, recording for each source the repo, the commit it was read
 * at, whether that working tree was clean, and a hash of both input and
 * output. A hand-edit to a data file therefore fails the build, and a stale
 * derivation is visible in the page footer rather than only to CI.
 *
 *   node scripts/prep.mjs            # expects the repos as siblings, at ../
 *   node scripts/prep.mjs --repos /some/where
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argRepos = process.argv.indexOf("--repos");
const REPOS = resolve(argRepos > -1 ? process.argv[argRepos + 1] : join(ROOT, ".."));

const sha256 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Records one source file and returns its text. */
const ledger = [];
function source(repo, relPath) {
  const abs = join(REPOS, repo, relPath);
  if (!existsSync(abs)) {
    throw new Error(
      `missing source: ${abs}\n` +
        `Expected the project repos as siblings of this one. Pass --repos <dir> if they are elsewhere.`,
    );
  }
  const git = (...args) => {
    try {
      return execFileSync("git", ["-C", join(REPOS, repo), ...args], {
        encoding: "utf8",
      }).trim();
    } catch {
      return null;
    }
  };
  const text = readFileSync(abs, "utf8");
  ledger.push({
    repo,
    path: relPath,
    commit: git("rev-parse", "HEAD"),
    // A source read out of a dirty tree is not reproducible from the commit
    // recorded above, so it is called out rather than quietly recorded.
    dirty: git("status", "--porcelain", "--", relPath) !== "",
    bytes: Buffer.byteLength(text),
    sha256: sha256(text),
  });
  return text;
}

const outputs = {};
function emit(name, obj) {
  const text = JSON.stringify(obj, null, 1);
  writeFileSync(join(ROOT, "data", `${name}.json`), text + "\n");
  outputs[`${name}.json`] = { bytes: Buffer.byteLength(text) + 1, sha256: sha256(text + "\n") };
  console.log(`data/${name}.json  ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`);
}

/** Minimal CSV reader: these files are numeric and have no quoted fields. */
function csv(text) {
  const [head, ...rest] = text.trim().split(/\r?\n/);
  const keys = head.split(",");
  return rest.map((line) => Object.fromEntries(line.split(",").map((v, i) => [keys[i], v])));
}
const r1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Emotion Timeline — two tracks over one recording.
// ---------------------------------------------------------------------------
{
  const a = JSON.parse(source("Emotion-Timeline", "benchmarks/pipeline/timeline.json"));
  const w = JSON.parse(source("Emotion-Timeline", "benchmarks/pipeline/timeline-whisper.json"));
  const ds = JSON.parse(source("Emotion-Timeline", "benchmarks/dataset/build-record.json"));

  const emotions = ["Anger", "Disgust", "Fear", "Joy", "Neutral", "Sadness", "Surprise"];
  const idx = (name) => {
    const i = emotions.indexOf(name);
    if (i < 0) throw new Error(`unknown emotion ${name} — the label set changed upstream`);
    return i;
  };
  const band = (s) => [r1(s.start_s), r1(s.end_s), idx(s.emotion), idx(s.second_opinion), s.agreed ? 1 : 0];

  emit("emotion-timeline", {
    _comment: [
      "Per-scene emotion over one public 51-minute documentary, from the two",
      "committed timeline files. Scene TEXT is deliberately not carried here:",
      "it stays in the transcript the source file names, so this page renders",
      "bands and never the recording's words.",
      "Rows are [start_s, end_s, emotion, second_opinion, agreed], emotion as",
      "an index into `emotions`.",
    ],
    emotions,
    duration_s: a.duration_s,
    stages: {
      segments: a.segments,
      chunks: a.chunks,
      chunk_chars: a.chunk_chars,
      scenes: a.scenes,
      gap_seconds: a.gap_seconds,
    },
    primary: { name: a.primary.name, held_out_accuracy: a.primary.held_out_accuracy, temperature: a.primary.temperature },
    agreement: a.agreement,
    // `source_composition` is carried through so the "552,821 rows in" figure
    // can be recomputed by summing it rather than copied forward. The three
    // totals mean different things and are easy to conflate:
    //   published 428,331 = what the model was trained on
    //   reproducible 419,180 = what a rebuild reaches today
    //   the 9,151 synthetic Disgust rows in the gap did not survive
    dataset: {
      source_composition: ds.source_composition,
      published_rows: ds.published?.rows ?? null,
      reproducible_rows: ds.rows ?? null,
      synthetic_disgust_rows: ds.published?.synthetic_disgust_rows ?? null,
      held_out_rows: ds.published?.held_out_rows ?? null,
    },
    // The same recording through the other transcriber; the two side by side
    // are the result this section is about.
    scenes: a.timeline.map(band),
    scenes_whisper: w.timeline.map(band),
  });
}

// ---------------------------------------------------------------------------
// Detection by Shadow — boxes that sit outside the camera frame.
// ---------------------------------------------------------------------------
{
  const v2 = csv(source("Detection-by-Shadow", "results/submission_v2_giou.csv"));
  const v5 = csv(source("Detection-by-Shadow", "results/submission_v5_ensemble.csv"));
  const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
  const m2 = byId(v2);
  const box = (r) => [r1(+r.xmin), r1(+r.ymin), r1(+r.xmax), r1(+r.ymax)];

  // Frame is 720 x 480, constant (docs/dataset.md). Every person is FULLY
  // outside it, so `xmin < 0` alone identifies the side with no ambiguous
  // middle case — which is why `side` is the first decomposed target.
  const FRAME = [720, 480];
  const isLeft = (x) => x < 0;
  const predLeft = v5.filter((r) => isLeft(+r.xmin)).sort((p, q) => +p.xmin - +q.xmin);
  const predRight = v5.filter((r) => !isLeft(+r.xmin)).sort((p, q) => +q.xmax - +p.xmax);
  const abstains = v5.filter((r) => r.direction === "-1").length;

  // The 1692 training annotations, as [xmin, ymin, xmax, ymax, walking].
  // Vendored so the two most interesting numbers on this section — the
  // per-side floor and the direction base rate — are RECOMPUTED in CI rather
  // than read back from a summary that stored the answer. These files are
  // gitignored in their own repo, which is exactly why the derived copy has
  // to travel with the site. Coordinates only; no imagery.
  const gt = [];
  for (let i = 0; ; i++) {
    const rel = `data/train_data/train_data/image_${i}.json`;
    if (!existsSync(join(REPOS, "Detection-by-Shadow", rel))) {
      if (i > 0 && gt.length >= 1692) break;
      if (i > 4000) break;
      continue;
    }
    const o = JSON.parse(readFileSync(join(REPOS, "Detection-by-Shadow", rel), "utf8"));
    const b = o.bbox;
    gt.push([
      r1(b.top_left[0]), r1(b.top_left[1]),
      r1(b.top_right[0]), r1(b.bottom_left[1]),
      o.walking_into_frame_bool ? 1 : 0,
    ]);
  }
  if (gt.length !== 1692) throw new Error(`expected 1692 annotations, read ${gt.length}`);
  // One ledger entry for the set rather than 1692; the hash covers all of it.
  ledger.push({
    repo: "Detection-by-Shadow",
    path: "data/train_data/train_data/image_*.json",
    commit: null,
    note: "gitignored in its own repo — local only, so no commit pins it",
    dirty: false,
    bytes: null,
    sha256: sha256(JSON.stringify(gt)),
  });

  emit("shadow", {
    _comment: [
      "Predicted boxes for frames where the pedestrian stands entirely outside",
      "the camera's field of view, from two committed submission generations",
      "over the same 414 frames. Coordinates only — the source frames are the",
      "dataset authors' and are not redistributed here.",
      "Frame is 720x480 constant; every subject is FULLY off-frame, so",
      "xmin < 0 identifies the side. `drawn` is a mix of both sides.",
      "NOTE: results/submission_v1_direct.csv is NOT read. Every one of its",
      "414 rows has xmin >= xmax, which is either a column-order artefact of",
      "that export or an unconstrained-regression one. Until that is settled",
      "it is not something to draw or cite.",
    ],
    frame: FRAME,
    total: v5.length,
    predicted_left: predLeft.length,
    predicted_right: predRight.length,
    min_xmin: r1(Math.min(...v5.map((r) => +r.xmin))),
    max_xmax: r1(Math.max(...v5.map((r) => +r.xmax))),
    direction_abstains: abstains,
    // [xmin, direction] for all 414 test predictions, so the side split and
    // "abstains on 407" are recomputed rather than asserted.
    v5_all: v5.map((r) => [r1(+r.xmin), +r.direction]),
    // [xmin, ymin, xmax, ymax, walking] x 1692 training annotations.
    gt,
    // Both sides, because the side is the first thing the model has to get
    // right and a left-only picture would hide that half of the problem.
    drawn: [...predLeft.slice(0, 6), ...predRight.slice(0, 6)].map((r) => ({
      id: r.id,
      side: isLeft(+r.xmin) ? "left" : "right",
      v2: m2.has(r.id) ? box(m2.get(r.id)) : null,
      v5: box(r),
    })),
  });
}

// ---------------------------------------------------------------------------
// CV Pipeline — a training run that collapsed twice.
// ---------------------------------------------------------------------------
{
  const m = JSON.parse(
    source("CV-Pipeline-Deployment-Platform", "docs/evidence/training-run/run_metrics.json"),
  );
  emit("cv-platform", {
    _comment: [
      "The committed evidence run: 50 epochs of train loss, val F1 and val",
      "IoU. Vendored nearly as-is because it is already small, and because",
      "the shape is the point — val F1 reaches zero twice before it settles.",
    ],
    run_name: m.run_name,
    best_epoch: m.best_epoch,
    best_val_f1: m.best_val_f1,
    completed: m.training_completed,
    epochs: m.epochs.map((e) => [e.epoch, e.train_loss, e.val_f1, e.val_iou]),
  });
}

// ---------------------------------------------------------------------------
// NPEC — 28 gain settings, and the four trajectories the page can open.
// ---------------------------------------------------------------------------
{
  const pid = JSON.parse(source("NPEC-Plant-Phenotyping", "robot_control/pid/tuning_results.json"));
  const rl = JSON.parse(
    source("NPEC-Plant-Phenotyping", "robot_control/rl/results/individual/test_results.json"),
  );
  const runs = pid.results.map((r) => ({
    kp: r.kp, ki: r.ki, kd: r.kd,
    success_rate: r.success_rate,
    settling: r.avg_settling_time,
    final_error: r.avg_final_error,
    overshoot: r.avg_overshoot,
  }));

  // Only the cells the visual can open carry a trajectory: downsampling all
  // 28 is ~60 KB of polyline nobody clicks. Best, worst, an oscillator, and
  // one half of the duplicated setting.
  const bySettle = [...pid.results].sort((a, b) => a.avg_settling_time - b.avg_settling_time);
  const wanted = new Set([
    bySettle[0],
    bySettle[bySettle.length - 1],
    pid.results.find((r) => r.ki >= 0.5),
    pid.results.find((r) => r.kp === 15 && r.ki === 0 && r.kd === 3),
  ].filter(Boolean));

  const trace = (r) => {
    const t = r.trials?.[0];
    const pts = t?.positions ?? t?.trajectory ?? null;
    if (!Array.isArray(pts)) return null;
    // every 10th point, 4 dp — enough to see the shape, not the noise
    return pts.filter((_, i) => i % 10 === 0).map((p) =>
      Array.isArray(p) ? p.map((v) => Math.round(v * 1e4) / 1e4) : null,
    ).filter(Boolean);
  };

  // 28 runs over 27 unique settings: (15, 0, 3) appears twice, at 165.8 and
  // 137.0 steps. That 21% spread on identical gains is the run-to-run
  // variance and is kept rather than averaged away.
  const key = (r) => `${r.kp}/${r.ki}/${r.kd}`;
  const unique = new Set(runs.map(key)).size;

  emit("npec", {
    _comment: [
      "PID gain sweep and the PPO comparison, both simulator output. No plate",
      "imagery is derived or included: the source images are NPEC research",
      "data and are not redistributable.",
      `28 runs over ${unique} unique gain settings — one setting was run`,
      "twice, and the two results differ by 21%. Kept deliberately.",
      "Trajectories are included only for the cells the page can open.",
    ],
    runs,
    unique_settings: unique,
    trajectories: Object.fromEntries(
      [...wanted].map((r) => [key(r), trace(r)]).filter(([, v]) => v && v.length),
    ),
    rl: {
      model: rl.model,
      threshold_mm: rl.target_threshold_mm,
      episodes: rl.num_episodes,
      successes: rl.results.success_count,
      mean_final_distance_mm: rl.results.average_final_distance_mm,
      std_final_distance_mm: rl.results.std_final_distance_mm,
      // Per-episode so the success count can be recomputed rather than
      // trusted: [episode, steps, final_distance_mm, success]
      detail: rl.episode_details.map((e) => [e.episode, e.steps, e.final_distance_mm, e.success ? 1 : 0]),
    },
  });
}

// ---------------------------------------------------------------------------
writeFileSync(
  join(ROOT, "data", "manifest.json"),
  JSON.stringify(
    {
      _comment: [
        "Written by scripts/prep.mjs. `generated` is printed in the page",
        "footer so a stale derivation is visible on the page itself, not only",
        "to CI. `sources[].dirty` true means that file was read out of a tree",
        "with uncommitted changes, so the commit recorded next to it does not",
        "reproduce it — scripts/check.mjs fails the build on that.",
      ],
      generated: new Date().toISOString().slice(0, 10),
      sources: ledger,
      outputs,
    },
    null,
    2,
  ) + "\n",
);
console.log(`data/manifest.json  ${ledger.length} sources`);
const dirty = ledger.filter((s) => s.dirty);
if (dirty.length) {
  console.warn(`\nWARNING: read out of a dirty tree: ${dirty.map((s) => s.repo + "/" + s.path).join(", ")}`);
}
