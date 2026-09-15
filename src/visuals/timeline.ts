/**
 * Emotion Timeline: the same classifier over two different transcripts.
 *
 * The two tracks are ONE variable apart — the speech-to-text engine — because
 * that is what the section's headline claims. An earlier draft drew the two
 * classifiers on a single transcript instead, which is a different comparison
 * (17 of 47 scenes) and quietly contradicted the heading above it.
 */

export interface TimelineData {
  emotions: string[];
  duration_s: number;
  stages: { segments: number; chunks: number; chunk_chars: number; scenes: number; gap_seconds: number };
  scenes: number[][];
  scenes_whisper: number[][];
}

/** One lightness and one chroma across all seven, hue apart, so no single
 *  emotion shouts. Neutral is the palest deliberately: it is by far the most
 *  common answer here, and a loud fill for it would read as the recording
 *  being mostly *something*. */
const FILL = [
  "oklch(0.66 0.075 25)",
  "oklch(0.66 0.075 130)",
  "oklch(0.66 0.075 310)",
  "oklch(0.66 0.075 70)",
  "oklch(0.82 0.006 250)",
  "oklch(0.66 0.075 255)",
  "oklch(0.66 0.075 195)",
];

const H = { trackA: 0, band: 140, trackB: 230, tick: 362, label: 422, total: 450 };

/** Which emotion a track answers at each whole second. A scene spanning
 *  [start, end) covers every integer t with ceil(start) <= t < end. This
 *  convention is the one scripts/check.mjs pins: truncating `end` instead
 *  drops the last second of every scene and moves the headline by 0.2 points. */
function atSecond(track: number[][]): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of track) for (let t = Math.ceil(s[0]); t < s[1]; t++) m.set(t, s[2]);
  return m;
}

export function render(d: TimelineData): string {
  const W = Math.ceil(Math.max(d.duration_s, ...d.scenes.map((s) => s[1]), ...d.scenes_whisper.map((s) => s[1])));
  const n = (v: number) => (Math.round(v * 10) / 10).toString();

  const bands = (track: number[][], y: number) =>
    track
      .map((s) => `<rect x="${n(s[0])}" y="${y}" width="${n(Math.max(s[1] - s[0], 2))}" height="120" fill="${FILL[s[2]]}"/>`)
      .join("");

  // Merge the disagreeing seconds into runs, so this is tens of rects rather
  // than one per second.
  const a = atSecond(d.scenes);
  const b = atSecond(d.scenes_whisper);
  const runs: [number, number][] = [];
  let open: number | null = null;
  for (let t = 0; t <= W; t++) {
    const differs = a.has(t) && b.has(t) && a.get(t) !== b.get(t);
    if (differs && open === null) open = t;
    if (!differs && open !== null) {
      runs.push([open, t]);
      open = null;
    }
  }
  if (open !== null) runs.push([open, W]);

  const hatch = runs
    .map(([s, e]) => `<rect x="${s}" y="${H.band}" width="${Math.max(e - s, 2)}" height="70" fill="url(#tl-dis)"/>`)
    .join("");

  let axis = "";
  for (let t = 0; t <= Math.floor(W / 300) * 300; t += 300) {
    // Centred, half of "0:00" would fall outside the viewBox and be clipped,
    // so the two ends are anchored inward.
    const anchor = t === 0 ? "start" : t + 300 > W ? "end" : "middle";
    axis +=
      `<line x1="${t}" y1="${H.tick}" x2="${t}" y2="${H.tick + 20}" stroke="var(--rule-firm)" stroke-width="3"/>` +
      `<text x="${t}" y="${H.label}" font-size="36" fill="var(--ink-soft)" text-anchor="${anchor}" font-family="var(--font-mono)">${t / 60}:00</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H.total}" role="img" aria-label="Two emotion tracks over the same ${Math.round(d.duration_s / 60)}-minute recording, one per speech-to-text engine, with a hatched strip between them marking every stretch where the two disagree.">
<defs><pattern id="tl-dis" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="9" stroke="var(--warn)" stroke-width="3.4"/></pattern></defs>
${bands(d.scenes, H.trackA)}${hatch}${bands(d.scenes_whisper, H.trackB)}${axis}
</svg>`;
}

/** The legend is real text, not part of the SVG, so it stays selectable and
 *  scales with the page rather than with the drawing. */
export function legend(d: TimelineData): string {
  const chip = (fill: string, name: string) =>
    `<span class="chip"><i style="background:${fill}"></i>${name}</span>`;
  return (
    d.emotions.map((e, i) => chip(FILL[i], e)).join("") +
    chip("var(--warn)", "the two disagree")
  );
}

export function attach(): void {
  /* Nothing to animate: a 51-minute timeline is a thing to read, not to
     watch, and the disagreement is visible the moment it renders. */
}
