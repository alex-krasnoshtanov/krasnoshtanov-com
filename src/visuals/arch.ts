/**
 * Architecture diagrams for the three projects with no data to plot.
 *
 * A project with nothing to measure still has a shape, and the shape is worth
 * drawing — a text-only entry in a page of figures reads as an apology. Each
 * diagram is five nodes at most and carries no numbers: the one reading is
 * "here is how this thing is put together", and the node drawn in signal
 * colour is the part that was actually interesting to build.
 *
 * Hand-authored, because an architecture is not derived from a data file.
 * Nothing here is a measurement, so nothing here is a claim.
 */

export interface Node {
  label: string;
  sub?: string;
  /** The part worth pointing at. Exactly one per diagram. */
  key?: boolean;
}

export interface Flow {
  nodes: Node[];
  /** Optional second row, branching from the node at `from`. */
  branch?: { from: number; nodes: Node[] };
  note: string;
}

export const flows: Record<string, Flow> = {
  marbet: {
    nodes: [
      { label: "client documents", sub: "pdf · docx · text" },
      { label: "semantic chunks", sub: "800 / 200 overlap" },
      { label: "FAISS index", sub: "mxbai-embed" },
      { label: "fetch 20, keep 10", sub: "two-stage filter", key: true },
      { label: "Llama 3.3 70B", sub: "local, via Ollama" },
    ],
    note: "Answers come from the client's own documents and nothing else. Fetching wider than needed and then filtering is what stopped it answering from the model's own memory.",
  },
  "uk-transcribe": {
    nodes: [
      { label: "upload", sub: "any container" },
      { label: "ffmpeg", sub: "mono 16 kHz" },
      { label: "one model, one lock", sub: "second upload queues", key: true },
      { label: "faster-whisper", sub: "CUDA 12 · large-v3" },
      { label: "segments out", sub: "real decode position" },
    ],
    note: "The lock is the whole design. Two uploads hitting one GPU is not slower, it is a crash — so the second one waits instead, and the progress bar reports where the decoder actually is rather than counting seconds.",
  },
  dsl: {
    nodes: [
      { label: "webcam frame", sub: "over a WebSocket" },
      { label: "MediaPipe", sub: "21 hand landmarks" },
      { label: "residual MLP", sub: "24 letters that hold still" },
    ],
    branch: {
      from: 1,
      nodes: [{ label: "BiLSTM", sub: "J and Z, 30-frame window", key: true }],
    },
    note: "Two letters in the alphabet are movements rather than shapes, so they cannot be classified from one frame. They get a sequence model of their own, and the router in front decides which one a frame belongs to.",
  },
};

export function render(f: Flow): string {
  const W = 1000;
  const nodeH = 74;
  const gap = 16;
  const rows = f.branch ? 2 : 1;
  const H = rows * nodeH + (rows - 1) * 46 + 16;
  const n = f.nodes.length;
  const nw = (W - gap * (n - 1)) / n;

  const box = (node: Node, x: number, y: number, w: number) => {
    const key = node.key;
    return (
      `<g class="ar-node"${key ? ' data-key="1"' : ""}>` +
      `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${nodeH}" rx="2"` +
      ` fill="${key ? "var(--signal-dim)" : "var(--ground-3)"}"` +
      ` stroke="${key ? "var(--signal)" : "var(--rule-firm)"}" stroke-width="${key ? 2.5 : 1.5}"/>` +
      `<text x="${(x + 14).toFixed(1)}" y="${y + 31}" font-size="19"` +
      ` fill="${key ? "var(--signal)" : "var(--ink)"}" font-family="var(--font-mono)">${node.label}</text>` +
      (node.sub
        ? `<text x="${(x + 14).toFixed(1)}" y="${y + 54}" font-size="16" fill="var(--ink-soft)" font-family="var(--font-mono)">${node.sub}</text>`
        : "") +
      `</g>`
    );
  };

  const arrow = (x: number, y: number) =>
    `<path d="M${x.toFixed(1)} ${y} l${gap - 5} 0 m-5 -4 l5 4 l-5 4" fill="none" stroke="var(--rule-firm)" stroke-width="1.5"/>`;

  let out = "";
  f.nodes.forEach((node, i) => {
    const x = i * (nw + gap);
    out += box(node, x, 0, nw);
    if (i < n - 1) out += arrow(x + nw + 2, nodeH / 2);
  });

  if (f.branch) {
    const bx = f.branch.from * (nw + gap);
    const by = nodeH + 46;
    // The elbow makes the split explicit: one router, two destinations.
    out +=
      `<path d="M${(bx + nw / 2).toFixed(1)} ${nodeH} L${(bx + nw / 2).toFixed(1)} ${by - 12}"` +
      ` fill="none" stroke="var(--signal)" stroke-width="2" stroke-dasharray="4 4"/>`;
    f.branch.nodes.forEach((node, i) => {
      out += box(node, bx + i * (nw + gap), by, nw * 1.6);
    });
  }

  return `<svg class="ar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${f.nodes
    .map((x) => x.label)
    .join(", then ")}${f.branch ? `, with ${f.branch.nodes.map((x) => x.label).join(" and ")} branching off` : ""}.">
${out}
</svg>`;
}
