/**
 * CV Pipeline: a training curve that gets drawn as you scroll, and the three
 * targets one trunk ships to.
 *
 * The curve is the section's whole argument — validation F1 does not climb,
 * it collapses to nothing twice and recovers — so it is drawn rather than
 * presented. The drawing is a `stroke-dashoffset` animation on a
 * `view()` timeline, which means the scroll position IS the pen: no
 * JavaScript, no scroll library, and it simply appears finished where
 * scroll-driven animation is unsupported or reduced motion is set.
 *
 * `pathLength="1"` is what makes that possible without measuring the path in
 * JS — the dash array can then be expressed as a fraction.
 */

export interface PlatformData {
  best_epoch: number;
  best_val_f1: number;
  /** [epoch, train_loss, val_f1, val_iou] */
  epochs: number[][];
}

export function render(d: PlatformData): string {
  const W = 1000;
  const H = 320;
  const PAD = { l: 16, r: 16, t: 24, b: 30 };
  const n = (v: number) => (Math.round(v * 100) / 100).toString();

  const last = d.epochs[d.epochs.length - 1][0];
  const x = (e: number) => PAD.l + ((e - 1) / (last - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);

  const line = d.epochs.map((e, i) => `${i ? "L" : "M"}${n(x(e[2] ? e[0] : e[0]))} ${n(y(e[2]))}`).join(" ");

  // The collapses are the story. Marking them stops the eye reading the line
  // as noise on the way up.
  const zeros = d.epochs
    .filter((e) => e[2] === 0)
    .map((e) => `<circle class="pf-zero" cx="${n(x(e[0]))}" cy="${n(y(0))}" r="6" fill="var(--warn)"/>`)
    .join("");

  const best = d.epochs.find((e) => e[0] === d.best_epoch)!;

  return `<svg class="pf" viewBox="0 0 ${W} ${H}"
 role="img" aria-label="Validation F1 across ${last} training epochs. It reaches zero twice before recovering, peaking at ${d.best_val_f1} on epoch ${d.best_epoch}.">
<line x1="${PAD.l}" y1="${n(y(0))}" x2="${W - PAD.r}" y2="${n(y(0))}" stroke="var(--rule-firm)" stroke-width="2"/>
<path class="pf-line" d="${line}" pathLength="1" fill="none" stroke="var(--signal)"
      stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
${zeros}
<circle class="pf-best" cx="${n(x(best[0]))}" cy="${n(y(best[2]))}" r="8" fill="var(--signal)"/>
</svg>`;
}

/** One trunk, three targets. Hand-authored: it is an architecture, not a
 *  measurement, so there is no data file it could come from. */
export function topology(): string {
  const targets: [string, string][] = [
    ["Docker Compose", "a laptop"],
    ["Portainer", "on-premise host"],
    ["Azure Container Apps", "cloud, blue-green"],
  ];
  return `<ol class="topo">
<li class="topo__trunk"><b>one trunk</b><span>tests · coverage gate · image build</span></li>
${targets.map(([t, s]) => `<li><b>${t}</b><span>${s}</span></li>`).join("")}
</ol>`;
}
