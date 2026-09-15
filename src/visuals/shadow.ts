/**
 * Detection by Shadow — the figure you can move the light in.
 *
 * The project's whole premise is that a shadow reaching into the frame tells
 * you where someone is standing outside it. So the cursor here is the light:
 * move it and the shadow swings, the subject has to be on the other side, and
 * the box that appears is a REAL prediction for that side, read out of
 * results/submission_v5_ensemble.csv.
 *
 * What is real and what is not, because a figure that blurs this is worse
 * than no figure: the BOXES and their coordinates are real model output. The
 * light, the subject silhouette and the cast shadow are a diagram of the
 * setup — the source frames are the dataset authors' and are not
 * redistributed. The caption says so, and so does the readout.
 *
 * `render` runs at build time and returns the whole figure. With no
 * JavaScript it is a static diagram with one real box per side, which is
 * still the point of the section. `attach` only moves what is already there.
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
  const left = d.drawn.filter((b) => b.side === "left");
  const right = d.drawn.filter((b) => b.side === "right");

  // The drawing has to hold the frame plus the boxes on both sides of it.
  const xs = d.drawn.flatMap((b) => [b.v5[0], b.v5[2]]);
  const minX = Math.min(0, ...xs) - 60;
  const maxX = Math.max(fw, ...xs) + 60;
  const vb = { x: minX, y: -120, w: maxX - minX, h: fh + 200 };

  // Serialised for `attach`, so the client never re-fetches or recomputes it.
  const payload = JSON.stringify({
    frame: d.frame,
    left: left.map((b) => ({ id: b.id, box: b.v5 })),
    right: right.map((b) => ({ id: b.id, box: b.v5 })),
  });

  const startLeft = left[Math.floor(left.length / 2)] ?? d.drawn[0];

  return `<svg class="sh" viewBox="${n(vb.x)} ${vb.y} ${n(vb.w)} ${n(vb.h)}" data-shadow='${payload}'
 role="img" aria-label="A diagram of the camera frame with a subject standing outside it. The subject's shadow reaches into the frame, and the box drawn around the subject is a real model prediction. Moving the pointer over this figure moves the light source.">
<defs>
  <pattern id="sh-hatch" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
    <line x1="0" y1="0" x2="0" y2="9" stroke="var(--rule)" stroke-width="1.4"/>
  </pattern>
  <radialGradient id="sh-sun">
    <stop offset="0%" stop-color="var(--signal)" stop-opacity="0.95"/>
    <stop offset="100%" stop-color="var(--signal)" stop-opacity="0"/>
  </radialGradient>
</defs>

<rect x="${n(vb.x)}" y="${vb.y}" width="${n(-vb.x)}" height="${vb.h}" fill="url(#sh-hatch)" opacity="0.6"/>
<rect x="${fw}" y="${vb.y}" width="${n(vb.x + vb.w - fw)}" height="${vb.h}" fill="url(#sh-hatch)" opacity="0.6"/>

<text x="${n(vb.x + 16)}" y="${vb.y + 46}" font-size="30" fill="var(--ink-soft)" font-family="var(--font-mono)">outside the sensor</text>
<text x="16" y="${vb.y + 46}" font-size="30" fill="var(--ink-soft)" font-family="var(--font-mono)">${fw} × ${fh} — what the camera sees</text>

<g class="sh-shadow">
  <polygon points="0,${fh} 0,${fh}" fill="var(--signal)" opacity="0.13"/>
</g>

<rect x="0" y="0" width="${fw}" height="${fh}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-dasharray="18 14"/>

<g class="sh-subject" opacity="0.85">
  <circle cx="0" cy="0" r="0" fill="var(--ink-soft)"/>
  <rect x="0" y="0" width="0" height="0" rx="0" fill="var(--ink-soft)"/>
</g>

<rect class="sh-box" x="${n(startLeft.v5[0])}" y="${n(startLeft.v5[1])}"
 width="${n(startLeft.v5[2] - startLeft.v5[0])}" height="${n(startLeft.v5[3] - startLeft.v5[1])}"
 fill="none" stroke="var(--signal)" stroke-width="4"/>

<g class="sh-sun" opacity="0">
  <circle cx="0" cy="0" r="120" fill="url(#sh-sun)"/>
  <circle cx="0" cy="0" r="13" fill="var(--signal)"/>
</g>
</svg>`;
}

interface Payload {
  frame: [number, number];
  left: { id: string; box: number[] }[];
  right: { id: string; box: number[] }[];
}

export function attach(svg: SVGSVGElement, readout?: HTMLElement | null): void {
  const raw = svg.dataset.shadow;
  if (!raw) return;
  const d: Payload = JSON.parse(raw);
  const [fw, fh] = d.frame;

  const shadow = svg.querySelector<SVGPolygonElement>(".sh-shadow polygon");
  const sun = svg.querySelector<SVGGElement>(".sh-sun");
  const box = svg.querySelector<SVGRectElement>(".sh-box");
  const subject = svg.querySelector<SVGGElement>(".sh-subject");
  if (!shadow || !sun || !box || !subject) return;
  const head = subject.querySelector("circle")!;
  const body = subject.querySelector("rect")!;

  const vb = svg.viewBox.baseVal;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function paint(px: number, py: number) {
    // px/py are 0..1 across the figure. Left of centre puts the light on the
    // left, which can only throw a shadow INTO the frame if the subject is
    // further left still — so the side follows the light, it is not a
    // separate control.
    const onLeft = px < 0.5;
    const pool = onLeft ? d.left : d.right;
    if (!pool.length) return;

    // Vertical position walks through the real predictions for that side, so
    // moving the cursor explores actual model output rather than one example.
    const i = Math.min(pool.length - 1, Math.max(0, Math.round(py * (pool.length - 1))));
    const pick = pool[i];
    const [x0, y0, x1, y1] = pick.box;

    box.setAttribute("x", n(x0));
    box.setAttribute("y", n(y0));
    box.setAttribute("width", n(x1 - x0));
    box.setAttribute("height", n(y1 - y0));

    // The subject stands inside its own predicted box, feet at its bottom.
    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    head.setAttribute("cx", n(cx));
    head.setAttribute("cy", n(y0 + w * 0.32));
    head.setAttribute("r", n(w * 0.26));
    body.setAttribute("x", n(cx - w * 0.28));
    body.setAttribute("y", n(y0 + w * 0.62));
    body.setAttribute("width", n(w * 0.56));
    body.setAttribute("height", n(y1 - y0 - w * 0.62));
    body.setAttribute("rx", n(w * 0.2));

    // Sun position in scene units, clamped to the drawing.
    const sx = vb.x + px * vb.width;
    const sy = vb.y + py * vb.height * 0.62;
    sun.setAttribute("transform", `translate(${n(sx)} ${n(sy)})`);
    sun.setAttribute("opacity", "1");

    // The shadow runs along the ground from the subject's feet, directly away
    // from the light. A higher sun gives a shorter shadow — that is the whole
    // reason the vertical axis does anything here.
    const feet = y1;
    const height = Math.max(0.12, 1 - py) * 2.1;
    const dir = onLeft ? 1 : -1;
    const reach = w * 2.4 * height;
    const tipX = cx + dir * reach;
    const spread = w * 0.42;

    shadow.setAttribute(
      "points",
      [
        `${n(cx - spread * 0.5)},${n(feet)}`,
        `${n(cx + spread * 0.5)},${n(feet)}`,
        `${n(tipX + spread * 0.9)},${n(fh)}`,
        `${n(tipX - spread * 0.9)},${n(fh)}`,
      ].join(" "),
    );

    if (readout) {
      const deg = Math.round((1 - py) * 78 + 6);
      readout.textContent =
        `light ${deg}° · subject off-frame ${onLeft ? "left" : "right"} · ` +
        `real prediction ${pick.id} · xmin ${x0} xmax ${x1}`;
    }
  }

  // Start lit, before any pointer arrives — and this is also the only state a
  // touch visitor ever sees, so it has to be a good one.
  paint(0.3, 0.34);

  if (reduce) return;

  let queued = false;
  let lastX = 0.3;
  let lastY = 0.34;
  const onMove = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    lastX = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    lastY = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    if (queued) return;
    queued = true;
    // One paint per frame at most. A pointermove handler that writes SVG
    // attributes on every event is how a figure like this starts dropping
    // frames on a trackpad.
    requestAnimationFrame(() => {
      queued = false;
      paint(lastX, lastY);
    });
  };

  svg.addEventListener("pointermove", onMove, { passive: true });
  svg.addEventListener("pointerleave", () => {
    paint(0.3, 0.34);
    if (readout) readout.textContent = "";
  });
  svg.style.touchAction = "pan-y";
}
