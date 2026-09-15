/**
 * Detection by Shadow: predicted boxes that sit entirely outside the frame.
 *
 * `render` runs at BUILD time and returns SVG. That SVG is the page — it works
 * with JavaScript off, it is the final state, and it is deterministic because
 * it is string templating over committed data by committed code. There is no
 * separate poster to keep in sync, and nothing to go blank if `attach` throws.
 *
 * `attach` only adds the v2 -> v5 morph. It never rebuilds the markup.
 */

export interface ShadowData {
  frame: [number, number];
  total: number;
  predicted_left: number;
  predicted_right: number;
  direction_abstains: number;
  drawn: { id: string; side: "left" | "right"; v2: number[] | null; v5: number[] }[];
}

const geom = (q: number[]) => ({ x: q[0], y: q[1], w: q[2] - q[0], h: q[3] - q[1] });
const n = (v: number) => (Math.round(v * 10) / 10).toString();

export function render(d: ShadowData): string {
  const [fw, fh] = d.frame;
  // The subjects sit off both edges, so the drawing has to be wider than the
  // frame on both sides. Margins come from the data, not from a guess.
  const minX = Math.min(0, ...d.drawn.map((b) => b.v5[0], )) - 45;
  const maxX = Math.max(fw, ...d.drawn.map((b) => b.v5[2])) + 105;
  const vb = { x: minX, y: -50, w: maxX - minX, h: fh + 100 };

  // SVG text is in user units and this drawing is scaled down hard, so a
  // label sized like body copy would render at about 7px. 28 user units lands
  // near 13 CSS px at the width this figure actually occupies.
  const label = (x: number, y: number, fill: string, text: string) =>
    `<text x="${n(x)}" y="${n(y)}" font-size="28" fill="${fill}" font-family="var(--font-mono)">${text}</text>`;

  const outside = (x: number, w: number) =>
    `<rect x="${n(x)}" y="${vb.y}" width="${n(w)}" height="${vb.h}" fill="url(#sh-hatch)" opacity="0.55"/>`;

  const ghosts = d.drawn
    .filter((b) => b.v2)
    .map((b) => {
      const g = geom(b.v2!);
      return `<rect x="${n(g.x)}" y="${n(g.y)}" width="${n(g.w)}" height="${n(g.h)}" fill="none" stroke="var(--rule-firm)" stroke-width="2.5" stroke-dasharray="9 7"/>`;
    })
    .join("");

  const boxes = d.drawn
    .map((b) => {
      const g = geom(b.v5);
      const from = b.v2 ? geom(b.v2) : g;
      return (
        `<rect class="sh-box" x="${n(from.x)}" y="${n(from.y)}" width="${n(from.w)}" height="${n(from.h)}"` +
        ` data-x="${n(g.x)}" data-y="${n(g.y)}" data-w="${n(g.w)}" data-h="${n(g.h)}"` +
        ` fill="none" stroke="var(--signal)" stroke-width="3.5">` +
        `<title>${b.id} — ${b.side} of frame</title></rect>`
      );
    })
    .join("");

  return `<svg viewBox="${n(vb.x)} ${vb.y} ${n(vb.w)} ${n(vb.h)}" role="img" aria-label="A dashed ${fw} by ${fh} camera frame. ${d.drawn.length} predicted bounding boxes sit entirely outside it, half beyond the left edge and half beyond the right, none touching the frame.">
<defs><pattern id="sh-hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="8" stroke="var(--rule-firm)" stroke-width="1.1"/></pattern></defs>
${outside(vb.x, -vb.x)}${outside(fw, vb.x + vb.w - fw)}
${label(vb.x + 14, -18, "var(--ink-soft)", "outside the sensor")}
<rect x="0" y="0" width="${fw}" height="${fh}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-dasharray="17 13"/>
${label(14, -18, "var(--ink-soft)", `${fw} × ${fh} — what the camera sees`)}
<polygon points="0,${n(fh * 0.62)} ${n(fw * 0.35)},${fh} 0,${fh}" fill="var(--signal)" opacity="0.12"/>
${label(20, fh - 16, "var(--signal)", "shadow (indicative — frames not shown)")}
${ghosts}${boxes}
</svg>`;
}

export function attach(svg: SVGElement): void {
  const boxes = [...svg.querySelectorAll<SVGRectElement>(".sh-box")];
  if (!boxes.length) return;
  // Motion only. Under reduced motion the boxes are already drawn at their v2
  // position and the caption explains the pair, so doing nothing is correct.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  boxes.forEach((b, i) => {
    b.style.transition = "x 900ms cubic-bezier(.2,.7,.2,1), y 900ms cubic-bezier(.2,.7,.2,1), width 900ms cubic-bezier(.2,.7,.2,1), height 900ms cubic-bezier(.2,.7,.2,1)";
    b.style.transitionDelay = `${i * 45}ms`;
  });
  // One frame later, so the transition has an initial value to move from.
  requestAnimationFrame(() => {
    for (const b of boxes) {
      for (const k of ["x", "y", "w", "h"] as const) {
        const v = b.dataset[k];
        if (v) b.setAttribute(k === "w" ? "width" : k === "h" ? "height" : k, v);
      }
    }
  });
}
