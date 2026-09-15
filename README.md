# krasnoshtanov.com

One page. Four projects with a figure built from that project's real output,
three more as text. Astro 7, no UI framework, hand-written CSS, deployed to
Cloudflare Workers with Static Assets.

The whole page is **129 KB** including self-hosted fonts, of which **2.1 KB is
JavaScript** — and that JS only animates one figure that is already fully drawn.

## Why it is built this way

Every figure is rendered to SVG **at build time**, in `src/pages/index.astro`,
by the modules under `src/visuals/`. Each of those exports two functions:

- `render(data) → string` runs on the build machine. Its output *is* the page.
- `attach(svg)` only adds motion to markup that already exists.

So there is no poster image to keep in sync with a live canvas, nothing to go
blank on a locked-down work laptop, and nothing to do for
`prefers-reduced-motion` except skip `attach`. If the island never loads, the
page is unchanged.

## The evidence rule

This repo takes a rule from `Emotion-Timeline/.claude/skills/add-stage`:

> Every published number is reproducible or cross-checked. No exceptions. A
> figure in the README that nobody can regenerate is decoration.

`data/claims.json` lists every number on the page with an evidence class:

| class | meaning |
| --- | --- |
| `recompute` | `scripts/check.mjs` recomputes it from the vendored data and fails the build on a mismatch |
| `crosscheck` | not recomputable from raw rows, but must agree with a second independently-recorded value |
| `attested` | recorded in a named source file, not recomputable here. Shown as a figure, never described as reproduced |

It also lists `denied` patterns — numbers that must never appear. Two are
figures from my own projects that did not survive re-derivation: an NPEC
segmentation F1 that no repository records at all, and a pair of sign-language
accuracies with nothing committed behind them. The build fails if either comes
back.

The gate that matters most asserts each claim's text **verbatim in the built
HTML**, because numbers rot in prose, not in data files.

### It has already earned its keep

Three real errors caught before publishing:

- The camera frame in the shadow figure was drawn 1280×720. The dataset is
  720×480, which had every right-side box rendering *inside* the frame — the
  exact opposite of what the section is about.
- The emotion chart showed two classifiers over one transcript while the
  heading above it talked about swapping the transcriber. Different comparison,
  different number.
- Cross-transcriber agreement was written as "62.0% of 2,740 seconds". It
  recomputes to 61.9% of 2,737, and the method matters: truncating a scene's
  end second instead of including it moves the figure to 62.1% of 2,667.

## Layout

```
data/           vendored JSON + manifest.json (provenance) + claims.json (evidence)
scripts/prep.mjs   LOCAL ONLY — derives data/ from the sibling project repos
scripts/check.mjs  the gate: --data before the build, --dist after
src/projects.ts    all the copy, in one place
src/visuals/       one module per figure: render() at build, attach() for motion
src/pages/index.astro
design/            the design canvas working files (see below)
```

## Commands

```bash
npm run prep      # re-derive data/ from ../<project repos>. Needs them checked out.
npm run build     # check --data -> astro build -> csp.mjs -> check --dist
npm run dev       # fast loop. NOT what a visitor gets — see below.
npm run preview   # build, then serve dist/ the way it ships
npm run deploy    # build, then wrangler deploy
```

### `npm run dev` lies, twice

Both of these have already shipped broken while the dev server looked perfect,
so check anything visual against `npm run preview`, not `npm run dev`:

- **Dev serves unminified CSS.** The minifier once folded `animation-timeline`
  into the `animation` shorthand, where no browser accepts it, and every
  scroll-driven animation on the page was silently dropped in production.
- **Dev does not read `public/_headers`.** The CSP there once blocked the
  inlined `@font-face` block, and since `--font-display` is declared inside
  it, the live page rendered in Times New Roman.

`check.mjs --dist` now fails the build on both, but it can only catch the
cases it knows about. If a change is visual, look at the built output.

Astro keeps one dev and one preview server per project. If a start fails with
*"Another … server is already running"*, that one is probably serving the
current `dist/` already — open the URL it prints, or replace it:

```bash
npx astro preview --force     # or: npx astro preview stop
npx astro dev stop
```

`prep.mjs` runs **only on a machine that has the project repos**. A CI runner
has none of them, and some sources are gitignored in their own repo or 21 MB.
CI therefore never re-derives — it recomputes the published claims from the
small vendored files, and `data/manifest.json` records the commit, the working
-tree cleanliness and a hash for every source so a hand-edit or a stale
derivation fails the build.

## Deploying

Cloudflare Workers + Static Assets, config in `wrangler.jsonc`. The apex is the
only hostname: `workers_dev` and `preview_urls` are both off, so there is no
second address for a search engine to index instead of the real one.

**Leave the Worker's git integration in the Cloudflare dashboard OFF.** With it
on, Cloudflare builds straight from the push and every gate in `check.mjs` is
skipped without saying so. GitHub Actions is the only thing that should run
`wrangler deploy`. It needs two repository secrets:

- `CLOUDFLARE_API_TOKEN` — scoped to Workers Scripts: Edit
- `CLOUDFLARE_ACCOUNT_ID`

`/cv.pdf` is a redirect, not a copy. The CV is built and published by the
[CV repo](https://github.com/alex-krasnoshtanov/CV)'s own Action; redirecting
keeps one publisher, so there is no second PDF to go stale and no cache to
purge. The workflow checks the live redirect after every deploy.

## Known gaps

- **No `og:image`.** Link previews are text-only. A card with a 404'd image is
  worse than one with no image, and rasterising 1200×630 text needs a headless
  browser this build does not have. To add one: put it at `public/og.png` and
  declare `og:image` — `check.mjs` then enforces that the file exists at the
  declared dimensions.
- **`results/submission_v1_direct.csv` in Detection-by-Shadow is not used.**
  All 414 of its rows have `xmin >= xmax`, while v2 and v5 have none. That is
  either a column-order artefact of that export or an unconstrained-regression
  one, and until it is settled it is not something to draw or cite.
- **The IoU ladder (0.4675 → 0.6096) is `attested`, not recomputed.** Those
  numbers live only in `docs/experiments.md`; the run logs record loss. They
  would become recomputable by re-evaluating the holdout from the committed
  seed weights.

## design/

`design/parts/*.html` are the working files for the design canvas, assembled by
`design/build-artboards.mjs`. The artboards read the **same** `data/*.json` the
site does, via a `/*@DATA*/` marker, because the mockup and the site had already
drifted once — that is how the 1280×720 frame got in. Hand-copied numbers
drift; derived ones cannot.
