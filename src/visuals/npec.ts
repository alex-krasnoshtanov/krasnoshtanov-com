/**
 * Root-tip robotics: a PID gain sweep, and the PPO run it beat.
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
  const runs = d.runs;
  const settle = runs.map((r) => r.settling);
  const lo = Math.min(...settle);
  const hi = Math.max(...settle);

  // Sort slowest-first so the eye lands on the failures, which are the point:
  // every combination with integral gain oscillates and never settles.
  const sorted = [...runs].sort((a, b) => b.settling - a.settling);

  const cols = 7;
  const cell = 132;
  const gap = 8;
  const rows = Math.ceil(sorted.length / cols);
  const W = cols * cell + (cols - 1) * gap;
  const H = rows * (cell + gap) - gap;

  const cells = sorted
    .map((r, i) => {
      const cx = (i % cols) * (cell + gap);
      const cy = Math.floor(i / cols) * (cell + gap);
      // One hue, lightness carrying the value: a sequential quantity gets a
      // sequential ramp, never two hues meeting in the middle.
      const t = (r.settling - lo) / (hi - lo);
      const fill = `oklch(${(0.93 - t * 0.38).toFixed(3)} ${(0.02 + t * 0.10).toFixed(3)} 28)`;
      const ink = t > 0.55 ? "oklch(0.97 0.004 250)" : "var(--ink)";
      const failed = r.success_rate < 1;
      return (
        `<g class="np-cell" transform="translate(${cx} ${cy})"` +
        ` data-kp="${r.kp}" data-ki="${r.ki}" data-kd="${r.kd}"` +
        ` data-settling="${r.settling}" data-success="${r.success_rate}" data-error="${r.final_error}">` +
        `<rect width="${cell}" height="${cell}" fill="${fill}"${failed ? ' stroke="var(--warn)" stroke-width="2.5" stroke-dasharray="6 4"' : ""}/>` +
        `<text x="10" y="26" font-size="19" fill="${ink}" font-family="var(--font-mono)">${Math.round(r.settling)}</text>` +
        `<text x="10" y="${cell - 34}" font-size="15" fill="${ink}" opacity="0.8" font-family="var(--font-mono)">kp ${r.kp}</text>` +
        `<text x="10" y="${cell - 18}" font-size="15" fill="${ink}" opacity="0.8" font-family="var(--font-mono)">ki ${r.ki}</text>` +
        `<text x="${cell - 10}" y="${cell - 18}" font-size="15" text-anchor="end" fill="${ink}" opacity="0.8" font-family="var(--font-mono)">kd ${r.kd}</text>` +
        `<title>kp ${r.kp}, ki ${r.ki}, kd ${r.kd} — settles in ${r.settling} steps, success rate ${r.success_rate}</title>` +
        `</g>`
      );
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${runs.length} PID gain settings, shaded by how many steps each takes to settle: from ${Math.round(lo)} steps for the best to ${Math.round(hi)} for the worst. The ${runs.filter((r) => r.success_rate < 1).length} outlined cells never reach the target reliably.">
${cells}
</svg>`;
}

/** The PPO run, as ten dots against the threshold it had to beat. */
export function rlStrip(d: NpecData): string {
  const { detail, threshold_mm } = d.rl;
  const W = 1000;
  const H = 120;
  const max = Math.max(threshold_mm * 1.2, ...detail.map((e) => e[2]));
  const x = (mm: number) => 40 + (mm / max) * (W - 90);

  const dots = detail
    .map((e) => {
      const hit = e[3] === 1;
      return `<circle cx="${x(e[2]).toFixed(1)}" cy="52" r="9" fill="${hit ? "var(--signal)" : "none"}" stroke="${hit ? "var(--signal)" : "var(--warn)"}" stroke-width="2.5"><title>episode ${e[0]}: ${e[2]} mm in ${e[1]} steps</title></circle>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ten PPO test episodes plotted by final distance from the target. ${d.rl.successes} of ${detail.length} land inside the ${threshold_mm} millimetre threshold.">
<line x1="40" y1="52" x2="${W - 50}" y2="52" stroke="var(--rule)" stroke-width="1"/>
<line x1="${x(threshold_mm).toFixed(1)}" y1="20" x2="${x(threshold_mm).toFixed(1)}" y2="84" stroke="var(--warn)" stroke-width="2.5" stroke-dasharray="6 5"/>
<text x="${(x(threshold_mm) + 10).toFixed(1)}" y="30" font-size="19" fill="var(--warn)" font-family="var(--font-mono)">${threshold_mm} mm threshold</text>
${dots}
<text x="40" y="104" font-size="18" fill="var(--ink-soft)" font-family="var(--font-mono)">0</text>
<text x="${W - 50}" y="104" font-size="18" text-anchor="end" fill="var(--ink-soft)" font-family="var(--font-mono)">${max.toFixed(0)} mm final distance</text>
</svg>`;
}

/**
 * The grid is a table of results, not an animation. What the pointer adds is
 * the full row for whichever cell it is over — native <title> tooltips are
 * still there for keyboard and screen-reader users, but they arrive after a
 * delay and only one line at a time.
 */
export function attach(svg: SVGSVGElement, readout?: HTMLElement | null): void {
  if (!readout) return;
  const cells = svg.querySelectorAll<SVGGElement>(".np-cell");
  if (!cells.length) return;

  for (const cell of cells) {
    const show = () => {
      const g = cell.dataset;
      const settled = Number(g.success) >= 1;
      readout.textContent =
        `kp ${g.kp} · ki ${g.ki} · kd ${g.kd} — ` +
        (settled
          ? `settles in ${Math.round(Number(g.settling))} steps, final error ${Number(g.error).toExponential(1)} mm`
          : `never settles reliably (success rate ${g.success})`);
    };
    cell.addEventListener("pointerenter", show);
    // Focus, not just hover, so the readout is reachable without a pointer.
    cell.addEventListener("focus", show);
    cell.setAttribute("tabindex", "0");
  }
  svg.addEventListener("pointerleave", () => {
    readout.textContent = "";
  });
}
