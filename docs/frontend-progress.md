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

The colour decision is final: **Rose, `#E86B78`**. The accent colour lives in exactly one place:

```css
/* frontend/src/index.css */
:root {
    --brand-accent: #E86B78;
    --brand-accent-foreground: oklch(0.145 0 0);
}
```

The foreground is dark. White text on the rose has a contrast ratio of about 3.1 to 1. Dark text gives about 6 to 1.

`--primary` and `--ring` read from `--brand-accent`, in both the light and dark theme blocks. Utility classes `bg-brand`, `text-brand`, `border-brand` are available. Do not add a second colour definition.

**Keep the rose off the candidate surfaces.** The `.surface-ats` class in `index.css` sets `--primary` to a slate near-black, `--primary-foreground` to white, and `--ring` to a light slate. `CandidateShell` applies `.surface-ats` on its root element. Candidate components use `primary`, not `brand`. The one exception is `LandmarkOverlay`, the demo face mesh. The video call surface gets its own class, `.surface-call` (Milestone 2 of `docs/video-call-scenario.md`).

**The icon** is `frontend/public/sapien-icon.jpeg`. `SapienIcon` (`components/console/SapienIcon.tsx`) shows it on a white tile. The console header shows it at 28 pixels tall. The launcher card shows it at 48 pixels tall. It is also the favicon. Do not show the icon on a candidate surface. Entry 2 of `docs/frontend-deferred-fixes.md` replaces the JPEG.

Three more colours are reserved for the verdict only (Section 9.1 of `frontend-handoff.md`):

```css
--verdict-real: oklch(0.6 0.16 155);        /* emerald */
--verdict-synthetic: oklch(0.62 0.21 40);   /* vermilion */
--verdict-uncertain: oklch(0.75 0.16 75);   /* amber */
```

The synthetic colour moved from red (hue 25) to vermilion (hue 40). The rose has a hue of about 12. A red verdict next to a rose button looks like the same colour on a projector. Do not put a rose border, rose background, or rose text next to `SignalVerdict`.

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
| `/call/$sessionId` | `routes/call.$sessionId.tsx` | The video call candidate surface (Milestones 2 and 3 of `docs/video-call-scenario.md`): pre-join → call stage (host tile, picture-in-picture self tile, decorative controls, `HostRequestBanner` for a challenge) → "The meeting has ended", or an error card. No face mesh. Components are in `components/call/`. The launcher opens it when the `scenario` in the `start-session` response is `video_call`. `session/presentation.ts` reads `prompt.kind` to set the lead-in, the prompt visibility, and the audio recording. |
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
- `useVideoSource.ts` — Milestone 6. Switches between the webcam (`useMediaStream`) and a prepared MP4 file. It also returns `audioStream`, the stream the audio recorder reads, for both source types. See Section 2.9.

Candidate components in `frontend/src/components/candidate/`: `CameraFeed`, `PermissionGate`, `PromptCard`, `CountdownRing`, `CalibrationHint`, `LandmarkOverlay`, `SessionCompleteCard` (shows no score, by construction — it takes no score-shaped prop at all).

Console components in `frontend/src/components/console/`: `SessionTimeline`, `ScoreBar`, `ComponentScorePanel`, `LatencyBadge`, `ScoringState`, `SignalVerdict`, `ConfidenceGauge`, `FlagReasonCard`.

The console route selects the body from `data.scenario` (Milestones 4 and 5 of `docs/video-call-scenario.md`):
- `InterviewConsole` — the ATS body. Its markup is the same as before the split.
- `CallConsole` — the rolling verdict (`SignalVerdict size="compact"`, shown after `MIN_SLOTS_FOR_ROLLING_VERDICT` slots), `TrustTimeline` (8 columns, neutral bars, a dashed decision line, an outlined challenge slot), and `ChallengePanel` with its request button.
- `FinalResult` — the large verdict, `FlagReasonCard`, and `ComponentScorePanel`. Both bodies use it.

The mock implements the challenge flow from Sections 12 and 13 of `ui-contract.md`. One rule needs a decision by the backend team. Section 12.6 says to use `multiple_signals_failed` when "another check also failed". The synthetic clip always has a low voice score, so a literal reading never gives `challenge_failed`, and the demo story needs it. The mock uses `multiple_signals_failed` only when the combined score was already synthetic before the challenge rule. The backend must use the same reading, or the demo shows `multiple_signals_failed`.

One contract gap worth knowing about: `thresholds` in `ui-contract.md` Section 7.1 has no liveness-specific value — only `frame_fake`, `voice_real`, `voice_fake`. `ComponentScorePanel`'s liveness bar therefore draws no threshold marker; its caption shows `prompts_passed`/`prompts_total` instead of inventing a number. The voice bar draws two markers (`voice_real` and `voice_fake`), framing Section 15.3's uncertain band.

### 2.9 The synthetic-candidate video path

The clip is at `frontend/public/media/synthetic-candidate.mp4`. It is H.264 video with AAC audio, 848 by 480 pixels, and 10 seconds long. `CameraFeed` loops it. Section 4.1 of `docs/video-call-scenario.md` asks for about 60 seconds for the video call. A 10-second loop is visible in a 50-second call.

The launcher has a "Use synthetic candidate clip" switch. With the switch on, the launcher does not ask for the camera permission, and the candidate window opens at `/interview/$sessionId?source=file`.

**The file source sends audio.** The flow is:
1. The candidate presses "Start interview". The press is the user gesture that allows playback with sound.
2. `useVideoSource` calls `video.play()`, then calls `video.captureStream()` one time. It keeps the result and returns it as `audioStream`.
3. If the captured stream has no audio track, `useVideoSource` routes the element through Web Audio (`createMediaElementSource` to a `MediaStreamAudioDestinationNode`, and to the speakers).
4. `useSessionRunner` records from `videoSource.audioStream` for both source types.

`CameraFeed` mutes the webcam only. A webcam that plays its own microphone causes echo. The file plays with sound.

`CameraFeed` assigns `src` and `srcObject` only when the value changes. An assignment with the same value restarts the load of the element and stops a pending `play()` with an `AbortError`.

Verified in headless Chrome against the mock: both voice prompts carried a WebM/Opus clip of about 6 seconds, with an RMS level of about 0.023. The audio is not silent. The live backend check (the "done when" of Section 4.2) is still open.

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
