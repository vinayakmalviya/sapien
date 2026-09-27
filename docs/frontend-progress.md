# Frontend Progress — Sapien

**Status:** Milestones 0 through 6 are complete. Milestone 7 is open, and is optional.
**Audience:** Any developer or agent session that continues the Sapien frontend build.
**Prerequisite reading:** `docs/frontend-handoff.md` and `docs/ui-contract.md`. This document does not repeat their rules. This document reports what exists now, and gives the exact next step for the one open milestone.

This document follows **ASD-STE100 (Simplified Technical English)**. Each sentence gives one instruction or one fact.

A new session can read this document and continue the build. Prior chat history is not needed.

See also `docs/frontend-deferred-fixes.md` — a living list of known, non-urgent issues, each with its root cause and its exact fix. Check it before starting new work; it may already explain something you notice.

---

## 1. Rules that apply to every session

Use `pnpm`. Do not use `npm`.

Build one milestone at a time. Do not start a new milestone before the current milestone runs.

Do not run a git command. The project owner runs git commands. Stop and ask if a task seems to need one.

Keep every threshold and every limit in `frontend/src/scoring/constants.ts`. Do not write a number inline in a component.

The accent colour lives in one place: `frontend/src/index.css`, in the `--brand-accent` variable. Do not add a second colour definition elsewhere.

---

## 2. What is built (Milestones 0 through 6)

### 2.1 Project setup

The project lives in `frontend/`, at the repository root.

The stack matches `docs/frontend-handoff.md`: Vite, React, TypeScript, TanStack Router with file-based routes, TanStack Query, shadcn/ui, Tailwind CSS v4, MSW.

Node version 22.17.0 is pinned in `frontend/.nvmrc`.

`frontend/vite.config.ts` holds the Tailwind plugin, the TanStack Router plugin, the `@` path alias to `frontend/src`, the fixed port `5173`, and the `/api` proxy to `http://localhost:8000`.

`frontend/.env.development` holds `VITE_API_BASE_URL=/api` and `VITE_USE_MOCK_API=true`. **This flag is still `true`.** No `backend/` folder exists in this repository yet. Nobody has confirmed a real request against a real backend. Flip this flag, and confirm the flip, once a backend exists at `http://localhost:8000`.

The MediaPipe assets are in place: `frontend/public/mediapipe/wasm/` and `frontend/public/mediapipe/face_landmarker.task`. Both load from the local path.

### 2.2 A known shadcn CLI bug

Running `pnpm dlx shadcn@latest add <component>` writes new files to a literal folder named `@` at the repository root, for example `frontend/@/components/ui/card.tsx`. Move each new file into `frontend/src/components/ui/` by hand after the command runs, then delete the stray `frontend/@` folder. Run this check after every `shadcn add` command:

```bash
find . -maxdepth 1 -name "@"
```

### 2.3 The accent colour and the reserved verdict colours

The colour decision is not final. The accent colour lives in exactly one place:

```css
/* frontend/src/index.css */
:root {
    --brand-accent: #99582a;
    --brand-accent-foreground: oklch(0.985 0 0);
}
```

`--primary` and `--ring` read from `--brand-accent`, in both the light and dark theme blocks. Utility classes `bg-brand`, `text-brand`, `border-brand` are available.

Three more colours are reserved for the verdict only (Section 9.1 of `frontend-handoff.md`):

```css
--verdict-real: oklch(0.6 0.16 155);        /* emerald */
--verdict-synthetic: oklch(0.58 0.22 25);   /* red */
--verdict-uncertain: oklch(0.75 0.16 75);   /* amber */
```

**`SignalVerdict` (Section 2.8) is the only component in the whole app allowed to use `text-verdict-real` / `text-verdict-synthetic` / `text-verdict-uncertain`.** Two real violations of this rule were found and fixed during the build — a generic form error on the launcher, and a generic network error on the console, both once used `text-verdict-synthetic` for an unrelated red colour. Check any new error state against this rule before shipping it.

### 2.4 The API layer

`frontend/src/api/types.ts` holds every type from `docs/ui-contract.md`.

`frontend/src/api/client.ts` holds the one fetch wrapper, `apiRequest`. Every API call goes through this function.

`frontend/src/api/queries.ts` holds four TanStack Query hooks: `useStartSession`, `useSubmitResponse`, `useSessionStatus` (polls once a second), `useGetResult` (retries a `409 RESULT_NOT_READY`, nothing else).

**The operator console reads the final result from `useSessionStatus`'s embedded `result` field, not from a second `useGetResult` call.** Section 6.1 of `ui-contract.md` states both routes return the same data, and that the operator surface does not need a second call. `useGetResult` exists and is correct, and is free to use if a future screen needs the result without already polling `session-status`.

### 2.5 The mock backend

`frontend/src/mocks/handlers.ts` is a full in-memory mock backend behind MSW, not only static fixtures.

**Its session store is backed by `localStorage`, not a plain `Map`.** The launcher and the candidate interview run in two different browser tabs, each with its own JS module instance — a `Map` in one tab is invisible to the other. This was a real bug, found while testing Milestone 2's full two-window flow, not a theoretical concern.

The mock backend picks a `"real"` or `"synthetic"` profile from the candidate label at `start-session` time: a label containing the word "synthetic" (any case) gets the synthetic fixture; every other label gets the real fixture. It renormalizes weights over enabled modules (Section 8 of `ui-contract.md`), and holds `status: "scoring"` for ~1.2 seconds after the last prompt before completing, so the console's `ScoringState` has something real to show.

`frontend/src/mocks/fixtures.ts` holds the demo prompt set, the thresholds, the base weights, and the two result fixtures — matching the Section 7.1 example in `ui-contract.md` exactly.

### 2.6 Routes

All four routes render, and now carry real content:

| Route | File | State |
|---|---|---|
| `/` | `routes/index.tsx` | The launcher. Starts a session, primes the camera permission, stores the first prompt for the candidate window (Section 2.7), opens the interview window, and has a switch for the synthetic-candidate MP4 path (Section 2.9). |
| `/interview/$sessionId` | `routes/interview.$sessionId.tsx` | The full candidate flow: idle → permission → calibration → 3 prompts (camera + mesh overlay + countdown) → `SessionCompleteCard`, or an error card. Reads `?source=file` to switch to the MP4 clip. |
| `/console/$sessionId` | `routes/console.$sessionId.tsx` | The full operator flow: live status badge, latency badge, session timeline, scoring state, and — once the result arrives — `SignalVerdict`, `ConfidenceGauge`, `FlagReasonCard`, and `ComponentScorePanel`. |
| `/console/$sessionId/settings` | `routes/console.$sessionId.settings.tsx` | Still a stub. Milestone 7. |

### 2.7 The session bootstrap bridge

`POST /start-session` returns the first prompt to the operator surface only. The candidate window opens fresh, at a URL with no prompt data in it (Section 5 of `frontend-handoff.md`: no join code, no QR code).

`frontend/src/lib/sessionBootstrap.ts` bridges this gap with `localStorage`, shared by both tabs on the same origin. The launcher writes `{ totalPrompts, enabledModules, firstPrompt }` right after `start-session` succeeds. `useSessionRunner` reads it back once calibration finishes.

### 2.8 The session runner, the scoring layer, and the capture layer

`frontend/src/session/machine.ts` — the 9-state reducer from Section 7 of `frontend-handoff.md`.

`frontend/src/session/useSessionRunner.ts` — drives the machine, calls the API, and now sends a **real, full request body**: a real score and real `motion_detail` from the scorer registry, two real sampled frames, and a real recorded audio clip (`null` for a prompt with no expected word).

`frontend/src/scoring/` — `types.ts` (`LandmarkSample` / `LandmarkWindow`), `constants.ts` (every threshold, named, with a reason), `scorers.ts` (one function for each `prompt.type`, matching the Section 8 table), `registry.ts` (maps `prompt.type` to its scorer, throws `UnknownPromptTypeError` for anything else).

`frontend/src/capture/`:
- `useMediaStream.ts` — camera and mic permission states. Requests `640x480` with `frameRate: { ideal: 30, max: 30 }` — a real fix for a real bug (see `frontend-deferred-fixes.md` entry 1 for the one part of this that is *not* fully fixed).
- `useFaceLandmarker.ts` — the detection loop. Runs on `requestVideoFrameCallback` (falls back to a `currentTime`-deduped `requestAnimationFrame` loop where unsupported). Never sets React state inside the loop; publishes a snapshot 8 times a second. GPU delegate with a CPU fallback, verified against a real headless run.
- `useFrameSampler.ts` — canvas → base64 JPEG, 640px wide, quality 0.8, no `data:` prefix.
- `useAudioRecorder.ts` — `MediaRecorder` → base64, reports the browser's actual negotiated MIME type.
- `useVideoSource.ts` — Milestone 6. Switches between the webcam (`useMediaStream`) and a prepared MP4 file. See Section 2.9 — **no MP4 file has been added yet.**

Candidate components in `frontend/src/components/candidate/`: `CameraFeed`, `PermissionGate`, `PromptCard`, `CountdownRing`, `CalibrationHint`, `LandmarkOverlay`, `SessionCompleteCard` (shows no score, by construction — it takes no score-shaped prop at all).

Console components in `frontend/src/components/console/`: `SessionTimeline`, `ScoreBar`, `ComponentScorePanel`, `LatencyBadge`, `ScoringState`, `SignalVerdict`, `ConfidenceGauge`, `FlagReasonCard`.

One contract gap worth knowing about: `thresholds` in `ui-contract.md` Section 7.1 has no liveness-specific value — only `frame_fake`, `voice_real`, `voice_fake`. `ComponentScorePanel`'s liveness bar therefore draws no threshold marker; its caption shows `prompts_passed`/`prompts_total` instead of inventing a number. The voice bar draws two markers (`voice_real` and `voice_fake`), framing Section 15.3's uncertain band.

### 2.9 The synthetic-candidate video path — MP4 file missing

`useVideoSource` expects a file at `frontend/public/media/synthetic-candidate.mp4`. **This file does not exist in the repository.** `frontend/public/media/README.md` documents the exact filename and the two things the clip needs (a visible face, for calibration to pass; H.264 in an MP4 container).

The launcher has a "Use synthetic candidate clip" switch, wired end to end — it opens `/interview/$sessionId?source=file`, and `CameraFeed` will attempt to play whatever is at that path. Until the file is added, this path shows a broken video and calibration never completes (there is no face to detect). This is expected, not a bug in the code.

**Adding the clip and confirming this path end to end is the most useful thing a future session could do before Milestone 6 is fully demo-ready.**

### 2.10 Legibility

Section 9.2 of `frontend-handoff.md` sets a 16px floor for body text and a 72px floor for verdict text, reasoned specifically for the operator console (a judge reads it from 3 metres away, through a projector). Every console-facing body text size was audited and bumped to `text-base` (16px) or above; `SignalVerdict` renders at 80px. The candidate surface was not held to this rule — it is read up close by the candidate, not projected, and Section 9.2's own reasoning does not apply to it. Small print there (the fake company header/footer) is left alone and is arguably good for realism.

---

## 3. The one open milestone

### Milestone 7 — Module toggles (optional)

**Goal:** the operator can turn a detection module off before the session starts.

Add:
- `frontend/src/components/console/ModuleToggleRow.tsx` — one switch for one module (`liveness`, `frame`, `voice`). A `Switch` component from shadcn already exists at `frontend/src/components/ui/switch.tsx` (added in Milestone 6 for the launcher's synthetic-clip toggle) — reuse it.
- Wire three switches into `frontend/src/routes/console.$sessionId.settings.tsx`, replacing the stub card.
- The `enabled_modules` object needs to reach `POST /start-session`, which the launcher (`routes/index.tsx`) calls, not the settings route. Either move the three switches up to the launcher itself, or add a step before the launcher opens the two windows where the operator visits settings first, then starts. The settings route today takes a `sessionId` param that does not exist until after `start-session` runs — this ordering problem is the main design decision for this milestone, not the switch UI itself.

**Done when:** the operator turns the voice module off before starting a session. The result shows `null` for `voice_score` and for `component_scores.voice_detection`. The mock backend in `mocks/handlers.ts` already renormalizes weights correctly for a disabled module (Section 2.5) — this milestone is frontend wiring only, not a backend change.

---

## 4. Priority note for backend testing

Milestones 2 through 4 are what produce real request traffic; Milestone 5 makes it observable. All four are complete. A teammate with a real backend at `http://localhost:8000` can flip `VITE_USE_MOCK_API=false` today and should get fully contract-shaped requests. Nobody has confirmed this against a real server yet — see Section 2.1.

---

*This document tracks build progress only. `docs/frontend-handoff.md` and `docs/ui-contract.md` remain the source of truth for every rule. `docs/frontend-deferred-fixes.md` tracks known non-urgent issues. Project: Sapien. Built for Origin Weekend, Fall 2026.*
