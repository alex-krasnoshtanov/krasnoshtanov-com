/**
 * CV Pipeline: the deployment topology, and a training curve that collapsed.
 *
 * No JavaScript at all. Both halves are static by nature, so there is no
 * `attach` — the module exports only `render`, and index.astro mounts no
 * island for it.
 */

export interface PlatformData {
  best_epoch: number;
  best_val_f1: number;
  /** [epoch, train_loss, val_f1, val_iou] */
  epochs: number[][];
}

export function render(d: PlatformData): string {
  const W = 1000;
  const H = 360;
  const PAD = { l: 58, r: 14, t: 18, b: 44 };
  const n = (v: number) => (Math.round(v * 100) / 100).toString();

  const last = d.epochs[d.epochs.length - 1][0];
  const x = (e: number) => PAD.l + ((e - 1) / (last - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);

  const path = (col: number) =>
    d.epochs.map((e, i) => `${i ? "L" : "M"}${n(x(e[0]))} ${n(y(e[col]))}`).join(" ");

  // The zero points are the story: val F1 does not climb, it collapses to
  // nothing twice and recovers. Marking them is more honest than a smooth
  // line the eye reads straight through.
  const zeros = d.epochs
    .filter((e) => e[2] === 0)
    .map((e) => `<circle cx="${n(x(e[0]))}" cy="${n(y(0))}" r="5" fill="var(--warn)"/>`)
    .join("");

  const best = d.epochs.find((e) => e[0] === d.best_epoch)!;

  let ticks = "";
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    ticks +=
      `<line x1="${PAD.l}" y1="${n(y(v))}" x2="${W - PAD.r}" y2="${n(y(v))}" stroke="var(--rule)" stroke-width="1"/>` +
      `<text x="${PAD.l - 10}" y="${n(y(v) + 5)}" font-size="15" text-anchor="end" fill="var(--ink-soft)" font-family="var(--font-mono)">${v.toFixed(2)}</text>`;
  }
  for (const e of [1, 10, 20, 30, 40, 50]) {
    ticks += `<text x="${n(x(e))}" y="${H - 14}" font-size="15" text-anchor="middle" fill="var(--ink-soft)" font-family="var(--font-mono)">${e}</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Validation F1 over 50 training epochs. It collapses to zero twice before settling, reaching ${d.best_val_f1} at epoch ${d.best_epoch}.">
${ticks}
<path d="${path(2)}" fill="none" stroke="var(--signal)" stroke-width="3" stroke-linejoin="round"/>
${zeros}
<circle cx="${n(x(best[0]))}" cy="${n(y(best[2]))}" r="6" fill="var(--signal)"/>
<text x="${n(x(best[0]) - 12)}" y="${n(y(best[2]) - 14)}" font-size="20" text-anchor="end" fill="var(--ink)" font-family="var(--font-mono)">${d.best_val_f1} @ ${d.best_epoch}</text>
<text x="${PAD.l}" y="${H - 14}" font-size="15" fill="var(--ink-soft)" font-family="var(--font-mono)">epoch</text>
</svg>`;
}

/** One trunk, three targets. Hand-authored because it is an architecture,
 *  not a measurement — there is no data file this could be derived from. */
export function topology(): string {
  const targets = [
    ["Docker Compose", "a laptop"],
    ["Portainer", "on-premise host"],
    ["Azure Container Apps", "cloud, blue-green"],
  ];
  return `<ol class="topo">
<li class="topo__trunk"><b>one trunk</b><span>tests, coverage gate, image build</span></li>
${targets.map(([t, s]) => `<li><b>${t}</b><span>${s}</span></li>`).join("")}
</ol>`;
}
