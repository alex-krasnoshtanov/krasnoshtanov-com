/**
 * Root-tip robotics: 28 gain settings, ranked by how long each takes to
 * settle, and the PPO run that lost to the best of them.
 *
 * This was a heatmap grid once. It encoded the value as cell lightness, which
 * measured 1.01:1 against its own label text after the page went dark — a
 * ramp designed for white paper and never re-derived. Bar height cannot do
 * that: the value is geometry, and colour only says whether the run ever
 * settled at all.
 *
 * Simulator output only. No plate imagery is derived or included anywhere —
 * the source images are NPEC research data and are not redistributable.
 */

export interface NpecData {
  runs: { kp: number; ki: number; kd: number; success_rate: number; settling: number; final_error: number }[];
  unique_settings: number;
  rl: { episodes: number; successes: number; mean_final_distance_mm: number; threshold_mm: number; detail: number[][] };
}

export function render(d: NpecData): string {
  const runs = [...d.runs].sort((a, b) => a.settling - b.settling);
  const hi = Math.max(...runs.map((r) => r.settling));

  const W = 1000;
  const H = 300;
  const base = H - 30;
  const slot = W / runs.length;
  const bw = slot * 0.62;

  const bars = runs
    .map((r, i) => {
      const h = (r.settling / hi) * (base - 14);
      const x = i * slot + (slot - bw) / 2;
      const settles = r.success_rate >= 1;
      return (
        `<g class="np-bar" data-kp="${r.kp}" data-ki="${r.ki}" data-kd="${r.kd}"` +
        ` data-settling="${r.settling}" data-success="${r.success_rate}" tabindex="0">` +
        `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"` +
        (settles
          ? ` fill="var(--signal)" opacity="${(0.95 - (r.settling / hi) * 0.45).toFixed(2)}"`
          : ` fill="none" stroke="var(--warn)" stroke-width="2.5" stroke-dasharray="5 4"`) +
        `/>` +
        `<title>kp ${r.kp}, ki ${r.ki}, kd ${r.kd} — ${Math.round(r.settling)} steps` +
        (settles ? "" : `, never settles reliably`) +
        `</title></g>`
      );
    })
    .join("");

  const failed = runs.filter((r) => r.success_rate < 1).length;

  return `<svg class="np" viewBox="0 0 ${W} ${H}" data-cursor="hover a run"
 role="img" aria-label="Settling time for ${runs.length} PID gain settings, shortest first. The best settles in ${Math.round(runs[0].settling)} steps; the worst takes ${Math.round(hi)}. ${failed} outlined bars never settle reliably.">
<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="var(--rule-firm)" stroke-width="2"/>
${bars}
</svg>`;
}

/** The PPO run: ten episodes against the threshold they had to reach. */
export function rlStrip(d: NpecData): string {
  const { detail, threshold_mm } = d.rl;
  const W = 1000;
  const H = 96;
  const max = Math.max(threshold_mm * 1.15, ...detail.map((e) => e[2]));
  const x = (mm: number) => 26 + (mm / max) * (W - 52);
  const tx = x(threshold_mm);

  const dots = detail
    .map((e) => {
      const hit = e[3] === 1;
      return (
        `<circle cx="${x(e[2]).toFixed(1)}" cy="46" r="11"` +
        (hit
          ? ` fill="var(--signal)"`
          : ` fill="none" stroke="var(--warn)" stroke-width="2.5"`) +
        `><title>episode ${e[0]}: ${e[2]} mm after ${e[1]} steps</title></circle>`
      );
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}"
 role="img" aria-label="Ten reinforcement-learning episodes by final distance from the target. ${d.rl.successes} of ${detail.length} reach the ${threshold_mm} millimetre threshold; the rest stop short.">
<line x1="26" y1="46" x2="${W - 26}" y2="46" stroke="var(--rule)" stroke-width="1.5"/>
<rect x="26" y="26" width="${(tx - 26).toFixed(1)}" height="40" fill="var(--signal)" opacity="0.10"/>
<line x1="${tx.toFixed(1)}" y1="18" x2="${tx.toFixed(1)}" y2="74" stroke="var(--warn)" stroke-width="3"/>
${dots}
</svg>`;
}

export function attach(svg: SVGSVGElement, label?: (text: string) => void): void {
  if (!label) return;
  for (const bar of svg.querySelectorAll<SVGGElement>(".np-bar")) {
    const show = () => {
      const g = bar.dataset;
      label(
        `kp ${g.kp} · ki ${g.ki} · kd ${g.kd} — ` +
          (Number(g.success) >= 1
            ? `${Math.round(Number(g.settling))} steps`
            : `never settles`),
      );
    };
    bar.addEventListener("pointerenter", show);
    // Focus as well as hover, so the readings are reachable without a pointer.
    bar.addEventListener("focus", show);
  }
}
