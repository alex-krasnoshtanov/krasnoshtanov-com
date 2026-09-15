/**
 * Detection by Shadow — the figure where you hold the light.
 *
 * The project's premise: a shadow reaching into frame tells you where someone
 * is standing outside it. So the sun sits exactly under your cursor, and the
 * shadow is a real 2D projection from it — not an approximation that happens
 * to look shadow-ish. Move the light down toward the horizon and the shadow
 * stretches, because that is what the projection does.
 *
 * Real: the box and its coordinates, straight out of
 * results/submission_v5_ensemble.csv. A diagram: the light, the silhouette
 * and the cast shadow. The source frames are the dataset authors' and are
 * not redistributed.
 *
 * There is no text inside the drawing. One shape, one reading — the box is
 * outside the frame, the shadow is inside it. Anything a viewer might want
 * to know beyond that rides the cursor.
 */

export interface ShadowData {
  frame: [number, number];
  total: number;
  predicted_left: number;
  predicted_right: number;
  direction_abstains: number;
  drawn: { id: string; side: "left" | "right"; v2: number[] | null; v5: number[] }[];
}

const n = (v: number) => (Math.round(v * 10) / 10).toString();

export function render(d: ShadowData): string {
  const [fw, fh] = d.frame;
  // One box per side: the pair closest to the frame, so the light always has
  // room to sit outside the subject where the projection needs it.
  const pick = (side: "left" | "right") => {
    const pool = d.drawn.filter((b) => b.side === side);
    return side === "left"
      ? pool.reduce((m, b) => (b.v5[2] > m.v5[2] ? b : m))
      : pool.reduce((m, b) => (b.v5[0] < m.v5[0] ? b : m));
  };
  const L = pick("left");
  const R = pick("right");

  const xs = [L.v5[0], L.v5[2], R.v5[0], R.v5[2]];
  const minX = Math.min(0, ...xs) - 120;
  const maxX = Math.max(fw, ...xs) + 120;
  const vb = { x: minX, y: -170, w: maxX - minX, h: fh + 230 };

  const payload = JSON.stringify({ frame: d.frame, left: { id: L.id, box: L.v5 }, right: { id: R.id, box: R.v5 } });

  return `<svg class="sh" viewBox="${n(vb.x)} ${vb.y} ${n(vb.w)} ${n(vb.h)}" data-shadow='${payload}'
 data-cursor="move the light"
 role="img" aria-label="A camera frame with a person standing outside it. Their shadow stretches into the frame, and the box around them is a real model prediction. Move the pointer to move the light.">
<defs>
  <radialGradient id="sh-glow">
    <stop offset="0%" stop-color="var(--signal)" stop-opacity="0.75"/>
    <stop offset="45%" stop-color="var(--signal)" stop-opacity="0.12"/>
    <stop offset="100%" stop-color="var(--signal)" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sh-cast" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="var(--ink)" stop-opacity="0.42"/>
    <stop offset="100%" stop-color="var(--ink)" stop-opacity="0.04"/>
  </linearGradient>
</defs>

<g class="sh-glow"><circle cx="0" cy="0" r="${n(vb.w * 0.42)}" fill="url(#sh-glow)" opacity="0"/></g>

<polygon class="sh-cast" points="0,0 0,0 0,0 0,0" fill="url(#sh-cast)"/>

<rect class="sh-frame" x="0" y="0" width="${fw}" height="${fh}" fill="none"
      stroke="var(--ink)" stroke-width="3.5" stroke-dasharray="20 16"/>

<g class="sh-subject">
  <circle cx="0" cy="0" r="0" fill="var(--ink)"/>
  <rect x="0" y="0" width="0" height="0" rx="0" fill="var(--ink)"/>
</g>

<rect class="sh-box" x="${n(L.v5[0])}" y="${n(L.v5[1])}"
      width="${n(L.v5[2] - L.v5[0])}" height="${n(L.v5[3] - L.v5[1])}"
      fill="none" stroke="var(--signal)" stroke-width="5"/>

<g class="sh-sun" opacity="0">
  <circle cx="0" cy="0" r="17" fill="var(--signal)"/>
</g>
</svg>`;
}

interface Payload {
  frame: [number, number];
  left: { id: string; box: number[] };
  right: { id: string; box: number[] };
}

export function attach(svg: SVGSVGElement, label?: (text: string) => void): void {
  const raw = svg.dataset.shadow;
  if (!raw) return;
  const d: Payload = JSON.parse(raw);
  const [fw, fh] = d.frame;

  const cast = svg.querySelector<SVGPolygonElement>(".sh-cast");
  const glow = svg.querySelector<SVGCircleElement>(".sh-glow circle");
  const sun = svg.querySelector<SVGGElement>(".sh-sun");
  const box = svg.querySelector<SVGRectElement>(".sh-box");
  const subject = svg.querySelector<SVGGElement>(".sh-subject");
  if (!cast || !glow || !sun || !box || !subject) return;
  const head = subject.querySelector("circle")!;
  const body = subject.querySelector("rect")!;

  const vb = svg.viewBox.baseVal;
  const ground = fh;

  const paint = (px: number, py: number) => {
    // The sun IS the pointer, in scene coordinates, with no remapping. It is
    // clamped only to stay above the subject's head, because below that the
    // projection inverts and the shadow would climb upward.
    const sx = vb.x + px * vb.width;
    const onLeft = sx < fw / 2;
    const which = onLeft ? d.left : d.right;
    const [x0, y0, x1, y1] = which.box;
    const sy = Math.min(vb.y + py * vb.height, y0 - 40);

    box.setAttribute("x", n(x0));
    box.setAttribute("y", n(y0));
    box.setAttribute("width", n(x1 - x0));
    box.setAttribute("height", n(y1 - y0));

    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    const headR = w * 0.24;
    head.setAttribute("cx", n(cx));
    head.setAttribute("cy", n(y0 + headR));
    head.setAttribute("r", n(headR));
    body.setAttribute("x", n(cx - w * 0.26));
    body.setAttribute("y", n(y0 + headR * 1.9));
    body.setAttribute("width", n(w * 0.52));
    body.setAttribute("height", n(Math.max(0, y1 - (y0 + headR * 1.9))));
    body.setAttribute("rx", n(w * 0.16));

    sun.setAttribute("transform", `translate(${n(sx)} ${n(sy)})`);
    sun.setAttribute("opacity", "1");
    glow.setAttribute("cx", n(sx));
    glow.setAttribute("cy", n(sy));
    glow.setAttribute("opacity", "1");

    // Exact 2D projection: the line from the light through a point on the
    // subject, continued until it meets the ground. `t` is how far past the
    // subject that lands — a light near the horizon makes it large, which is
    // why the shadow stretches as the pointer drops.
    const project = (tx: number, ty: number) => {
      const denom = ty - sy;
      if (denom <= 0) return tx;
      return sx + ((ground - sy) / denom) * (tx - sx);
    };
    const topY = y0;
    const tipL = project(cx - w * 0.26, topY);
    const tipR = project(cx + w * 0.26, topY);

    cast.setAttribute(
      "points",
      [
        `${n(cx - w * 0.26)},${n(ground)}`,
        `${n(cx + w * 0.26)},${n(ground)}`,
        `${n(tipR)},${n(ground)}`,
        `${n(tipL)},${n(ground)}`,
      ].join(" "),
    );
    // The cast gradient has to run toward the tip, whichever way that is.
    cast.setAttribute("transform", tipL < cx ? `translate(${n(2 * cx)} 0) scale(-1 1)` : "");

    const reach = Math.max(tipL, tipR);
    const enters = onLeft ? reach > 0 : Math.min(tipL, tipR) < fw;
    label?.(
      enters
        ? `shadow reaches into frame · person ${onLeft ? "left" : "right"} of it`
        : `light too steep — no shadow in frame`,
    );
  };

  // Lit before any pointer arrives, and the only state a touch visitor sees.
  paint(0.12, 0.26);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let queued = false;
  let lx = 0.12;
  let ly = 0.26;
  svg.addEventListener(
    "pointermove",
    (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      lx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      ly = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      if (queued) return;
      queued = true;
      // One write per frame. A pointermove handler that sets SVG attributes
      // on every event is how a figure like this starts dropping frames.
      requestAnimationFrame(() => {
        queued = false;
        paint(lx, ly);
      });
    },
    { passive: true },
  );
  svg.addEventListener("pointerleave", () => paint(0.12, 0.26));
  svg.style.touchAction = "pan-y";
}
