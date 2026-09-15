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

const H = { trackA: 0, band: 124, trackB: 202, tick: 330, total: 372 };

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

  const a = atSecond(d.scenes);
  const b = atSecond(d.scenes_whisper);

  // Bands are NOT coloured by emotion any more. Seven hues plus a seven-entry
  // legend asked a reader to learn a key before the figure said anything, and
  // the figure's point is not which emotion it picked — it is that changing
  // the transcriber changes the answer. So the tracks carry coverage and the
  // strip between them carries disagreement, which is the sentence above it,
  // drawn. Which emotions, specifically, is what the cursor is for.
  const band = (track: number[][], y: number) =>
    track
      .map((s) => {
        const differs = (() => {
          for (let t = Math.ceil(s[0]); t < s[1]; t++) {
            if (a.has(t) && b.has(t) && a.get(t) !== b.get(t)) return true;
          }
          return false;
        })();
        const w = Math.max(s[1] - s[0], 2);
        return `<rect x="${s[0].toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="110" fill="${
          differs ? "var(--warn)" : "var(--ink-soft)"
        }" opacity="${differs ? 0.85 : 0.3}"/>`;
      })
      .join("");

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
    .map(([s, e]) => `<rect x="${s}" y="${H.band}" width="${Math.max(e - s, 2)}" height="66" fill="var(--warn)"/>`)
    .join("");

  // Ticks, no labels. The timestamps used to be set inside the drawing, where
  // they rendered around 7 CSS px once the viewBox was scaled to fit —
  // unreadable, and eleven more things competing with the bands.
  let axis = "";
  for (let t = 0; t <= Math.floor(W / 300) * 300; t += 300) {
    const major = t % 900 === 0;
    axis += `<line x1="${t}" y1="${H.tick}" x2="${t}" y2="${H.tick + (major ? 26 : 14)}" stroke="var(--rule-firm)" stroke-width="3"/>`;
  }

  const payload = JSON.stringify({
    W,
    emotions: d.emotions,
    a: d.scenes.map((s) => [s[0], s[1], s[2]]),
    b: d.scenes_whisper.map((s) => [s[0], s[1], s[2]]),
  });

  return `<svg class="tl" viewBox="0 0 ${W} ${H.total}" data-timeline='${payload}' data-cursor="drag across the recording"
 role="img" aria-label="Two tracks over the same ${Math.round(d.duration_s / 60)}-minute recording, one per speech-to-text engine. The warm sections are where the two lead to a different answer, and they cover most of the recording.">
<defs></defs>
${band(d.scenes, H.trackA)}${hatch}${band(d.scenes_whisper, H.trackB)}${axis}
<line class="tl-play" x1="0" y1="0" x2="0" y2="${H.trackB + 110}" stroke="var(--signal)" stroke-width="5" opacity="0"/>
</svg>`;
}

/** Two entries, not eight. A key a reader has to learn before the figure
 *  says anything is a cost the figure has to earn, and this one did not. */
export function legend(): string {
  return (
    `<span class="chip"><i style="background:var(--ink-soft);opacity:.45"></i>both engines agree</span>` +
    `<span class="chip"><i style="background:var(--warn)"></i>they lead to different answers</span>`
  );
}

/**
 * Nothing here animates: a 51-minute timeline is a thing to read, not to
 * watch. What the pointer adds is the ability to ASK it something — at this
 * moment in the recording, what did each engine's transcript lead the
 * classifier to say, and did they agree?
 */
export function attach(svg: SVGSVGElement, label?: (text: string) => void): void {
  const raw = svg.dataset.timeline;
  if (!raw) return;
  const d: { W: number; emotions: string[]; a: number[][]; b: number[][] } = JSON.parse(raw);
  const play = svg.querySelector<SVGLineElement>(".tl-play");
  if (!play) return;

  const at = (track: number[][], t: number) => track.find((s) => t >= s[0] && t < s[1]);
  const clock = (t: number) =>
    `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  let queued = false;
  let lastT = 0;
  const paint = () => {
    queued = false;
    const t = lastT;
    play.setAttribute("x1", String(t));
    play.setAttribute("x2", String(t));
    play.setAttribute("opacity", "1");
    if (!label) return;
    const sa = at(d.a, t);
    const sb = at(d.b, t);
    const name = (s?: number[]) => (s ? d.emotions[s[2]] : "—");
    label(
      sa && sb
        ? `${clock(t)} · ${name(sa)} / ${name(sb)} · ${sa[2] === sb[2] ? "agree" : "differ"}`
        : `${clock(t)} · only one engine reaches here`,
    );
  };

  svg.addEventListener(
    "pointermove",
    (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      lastT = Math.min(d.W, Math.max(0, ((e.clientX - r.left) / r.width) * d.W));
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    },
    { passive: true },
  );
  svg.addEventListener("pointerleave", () => play.setAttribute("opacity", "0"));
  svg.style.touchAction = "pan-y";
}
