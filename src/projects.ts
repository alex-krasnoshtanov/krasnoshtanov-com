/**
 * The copy. Prose is adapted from the GitHub profile README, which was already
 * written and already good; this file is the single place it lives.
 *
 * Every number here also has a row in data/claims.json giving its evidence
 * class and, where it is recomputable, the function that recomputes it.
 * scripts/check.mjs asserts each claim's text appears verbatim in the built
 * HTML, which is what catches a number drifting in the PROSE rather than in a
 * data file — the place numbers actually rot.
 *
 * Two numbers that appear on the GitHub profile are deliberately absent:
 *   - NPEC "0.88 F1 on root instance segmentation". No repository records it.
 *   - DSL "~95% / ~92% validation accuracy". Nothing committed backs either.
 * Both are named as denied strings in data/claims.json, so the build fails if
 * they reappear. Where a number was cut, the qualitative finding is stated
 * instead — a hedged number is worse than an honest sentence.
 */

const GH = "https://github.com/alex-krasnoshtanov";

export type Tone = "signal" | "warn" | undefined;

export interface Stat {
  label: string;
  value: string;
  tone?: Tone;
}

export interface Project {
  id: string;
  name: string;
  meta: string;
  finding: string;
  body: string[];
  stats: Stat[];
  repo: string;
  /** Name of the module under src/visuals/ that draws this one, if any. */
  visual?: string;
  /** Shown under the figure: where the drawn numbers came from. */
  source?: { label: string; href: string };
  note?: string;
}

export interface Brief {
  id: string;
  name: string;
  meta: string;
  body: string;
  repo?: string;
}

export const projects: Project[] = [
  {
    id: "shadow",
    name: "Detection by Shadow",
    meta: "BrabantHack 2026 · DEMCON deep tech track · won · team of three",
    finding: "The person is outside the frame. Their shadow isn’t.",
    body: [
      "Given a frame where the pedestrian is entirely out of shot, predict the box they occupy anyway. The first model regressed the four corners directly. Re-describing the same box against the frame edge it hides behind — which side, how far out, how wide, how tall — is what moved the number, because a distance and a width cannot describe an impossible box the way two loose corners can.",
      "The second head, which way they are walking, never became learnable: 0.606 against a 48.3% base rate. It abstains on almost every frame rather than guessing, and that is the honest outcome rather than a missing feature.",
    ],
    stats: [
      { label: "predict-the-mean floor, per side", value: "0.4295" },
      { label: "direct regression", value: "0.4675" },
      { label: "decomposed targets + TTA", value: "0.6096" },
      { label: "organisers’ hidden test set", value: "0.626", tone: "signal" },
      { label: "predicted left of frame / right of frame", value: "229 / 185" },
      { label: "direction: declines to answer", value: "407 / 414", tone: "warn" },
    ],
    note: "Every subject is fully outside the 720×480 frame, never clipped by its edge, so which side they are on has no ambiguous middle case — and one mean box for all 1,692 training frames scores 0.0000, because the boxes sit on both sides. Splitting by side is what creates a floor at all, and it is the same idea the model needed.",
    repo: `${GH}/Detection-by-Shadow`,
    visual: "shadow",
    source: {
      label: "results/submission_v5_ensemble.csv",
      href: `${GH}/Detection-by-Shadow/blob/main/results/submission_v5_ensemble.csv`,
    },
  },
  {
    id: "timeline",
    name: "Emotion Timeline",
    meta: "Content Intelligence Agency · Sep–Nov 2025 · rebuilt solo",
    finding: "Swap the transcriber and 38% of the timeline moves.",
    body: [
      "Speech to text, then chunk, then split into scenes, then classify each one. The figure above is what happens when you change only the first of those: the same classifier over a transcript from a different engine returns a different emotion for 38% of the seconds both engines covered. A component nobody thinks of as part of the model moves more than a third of the output.",
      "There is a second disagreement underneath it. The classifier also runs twice on the same transcript — once on the Russian directly, once on an English translation — and those two agree on only 17 of the 47 scenes. Where they do agree, held-out accuracy is higher, which makes disagreement a place to look rather than a number to average away.",
    ],
    stats: [
      { label: "agreement over shared seconds", value: "61.9% of 2,737" },
      { label: "scenes where the two classifiers agree", value: "17 / 47" },
      { label: "primary model, held-out accuracy", value: "0.4816", tone: "warn" },
      { label: "word error rate, chosen STT", value: "0.81%" },
      { label: "training rows, in → out", value: "552,821 → 428,331" },
    ],
    note: "359 of the 3,096 seconds are covered by one transcriber only and are excluded from the agreement figure. Of the 428,331 training rows, 419,180 rebuild from source today: 9,151 synthetic rows did not survive, and the class they belonged to is therefore not compared.",
    repo: `${GH}/Emotion-Timeline`,
    visual: "timeline",
    source: {
      label: "benchmarks/pipeline/timeline.json",
      href: `${GH}/Emotion-Timeline/blob/main/benchmarks/pipeline/timeline.json`,
    },
  },
  {
    id: "platform",
    name: "CV Pipeline Deployment Platform",
    meta: "BUas group project, five people · Apr–Jun 2026",
    finding: "One codebase, three deployment targets, and a curve that collapsed twice before it worked.",
    body: [
      "A plant-organ segmentation service with the machinery around it: FastAPI behind auth, a Next.js front end for the researchers, Postgres, Prometheus, and Airflow DAGs running the data lifecycle — versioned staging, training on Azure ML, drift detection, and retraining triggered by a researcher flagging a bad prediction.",
      "The part worth showing is the deployment: the same trunk ships to Docker Compose, to an on-premise Portainer host and to Azure Container Apps, with blue-green cutover and a health-gated rollback. I owned that and the CI.",
    ],
    stats: [
      { label: "deployment targets, one trunk", value: "3" },
      { label: "tests, line coverage", value: "430 · 92.6%" },
      { label: "CI coverage gate", value: "85%" },
      { label: "best val F1, epoch 39 of 50", value: "0.6693" },
    ],
    note: "The run recorded here reached 0.6693 only after val F1 collapsed to zero twice. The evidence is a build from 2026-06-08; the cloud endpoints are not claimed to be up today.",
    repo: `${GH}/CV-Pipeline-Deployment-Platform`,
    visual: "platform",
    source: {
      label: "docs/evidence/training-run/run_metrics.json",
      href: `${GH}/CV-Pipeline-Deployment-Platform/blob/main/docs/evidence/training-run/run_metrics.json`,
    },
  },
  {
    id: "npec",
    name: "Root-tip robotics",
    meta: "Individual project · Nov 2025 – Jan 2026 · Kaggle #2 of 77",
    finding: "A swept PID controller beat the reinforcement-learning one.",
    body: [
      "Find the root tips in an image of a petri dish, then drive a simulated Opentrons OT-2 pipette to each one and dispense. The vision half and the control half were built and benchmarked separately, which is how the comparison below became possible.",
      "28 gain settings, five trials each. The best combination settles in 136 steps; the ones with integral gain oscillate and never settle. A PPO policy trained on the same task reached the 5 mm threshold in two episodes out of ten. Sweeping three numbers beat learning the controller, and saying so is more useful than picking the answer that sounds more modern.",
    ],
    stats: [
      { label: "gain settings swept, 5 trials each", value: "28" },
      { label: "best settling time", value: "136 steps", tone: "signal" },
      { label: "PPO episodes reaching 5 mm", value: "2 / 10", tone: "warn" },
      { label: "PPO mean final distance", value: "14.873 ± 6.351 mm" },
    ],
    note: "The 28 runs cover 27 distinct settings, because one was swept twice by accident — and the two runs disagree by 21%, settling in 165.8 and 137.0 steps on identical gains. That is the run-to-run variance, so both are drawn rather than averaged into one cell. No plate images appear here or anywhere in the repository: the source imagery is NPEC research data and is not mine to republish. Everything drawn is simulator output.",
    repo: `${GH}/NPEC-Plant-Phenotyping`,
    visual: "npec",
    source: {
      label: "robot_control/pid/tuning_results.json",
      href: `${GH}/NPEC-Plant-Phenotyping/blob/main/robot_control/pid/tuning_results.json`,
    },
  },
];

export const briefs: Brief[] = [
  {
    id: "marbet",
    name: "MARBET event assistant",
    meta: "Two-person sprint · Apr – May 2025 · in production for the client",
    body: "A self-hosted retrieval assistant answering questions about a corporate event from the client’s own documents and nothing else — Llama 3.3 70B through Ollama, LangChain, FAISS, a Gradio front end, multi-format ingestion with semantic chunking. Two of us built it in two weeks and the client put it into production. There is no data in the repository, deliberately: the event material was theirs, not mine to publish.",
    repo: `${GH}/MARBET-Chatbot`,
  },
  {
    id: "uk-transcribe",
    name: "UK-Transcribe",
    meta: "Personal project · Jul 2026 · running on a GPU rack",
    body: "Ukrainian lecture transcription I host myself, so the audio never leaves the machine and there is no per-minute cloud bill. faster-whisper behind FastAPI in a CUDA 12 image, picking whichever GPU has the most free memory at startup. One model instance sits behind a lock, so a second upload queues instead of two requests thrashing the same VRAM, and the progress bar is driven by the decoder’s real position in the audio rather than by a timer pretending to be one.",
    repo: `${GH}/UK-Transcribe`,
  },
  {
    id: "dsl",
    name: "Dutch Sign Language trainer",
    meta: "Solo rebuild of a group project · May – Sep 2026",
    body: "A real-time NGT fingerspelling trainer, rebuilt alone from a three-person university project with no shared commit history. MediaPipe hand landmarks feed a small residual network for the 24 letters that hold still; J and Z need movement, so they get a sequence model over a window of frames instead. FastAPI over WebSockets behind a typed Next.js front end, bilingual, containerised, tested in CI. The accuracy figures I recorded at the time are not backed by anything committed, so they are not quoted here.",
    repo: `${GH}/DSL-Learning`,
  },
];
