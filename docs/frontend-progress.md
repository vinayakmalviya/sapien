# Frontend Progress — Sapien

**Status:** Milestones 0 and 1 are complete. Milestones 2 through 7 are open.
**Audience:** Any developer or agent session that continues the Sapien frontend build.
**Prerequisite reading:** `docs/frontend-handoff.md` and `docs/ui-contract.md`. This document does not repeat their rules. This document reports what exists now, and gives the exact next step for each open milestone.

This document follows **ASD-STE100 (Simplified Technical English)**. Each sentence gives one instruction or one fact.

A new session can read this document and continue the build. Prior chat history is not needed.

---

## 1. Rules that apply to every session

Use `pnpm`. Do not use `npm`.

Build one milestone at a time. Do not start a new milestone before the current milestone runs.

Do not run a git command. The project owner runs git commands. Stop and ask if a task seems to need one.

Keep every threshold and every limit in `frontend/src/scoring/constants.ts`. Do not write a number inline in a component.

The accent colour lives in one place: `frontend/src/index.css`, in the `--brand-accent` variable. Section 4 of this document gives the exact line. Do not add a second colour definition elsewhere.

---

## 2. What is built (Milestones 0 and 1)

### 2.1 Project setup

The project lives in `frontend/`, at the repository root.

The stack matches `docs/frontend-handoff.md`: Vite, React, TypeScript, TanStack Router with file-based routes, TanStack Query, shadcn/ui, Tailwind CSS v4, MSW.

Node version 22.17.0 is pinned in `frontend/.nvmrc`.

`frontend/vite.config.ts` holds the Tailwind plugin, the TanStack Router plugin, the `@` path alias to `frontend/src`, the fixed port `5173`, and the `/api` proxy to `http://localhost:8000`.

`frontend/.env.development` holds `VITE_API_BASE_URL=/api` and `VITE_USE_MOCK_API=true`.

The MediaPipe assets are already in place. `frontend/public/mediapipe/wasm/` holds the WASM files. `frontend/public/mediapipe/face_landmarker.task` holds the model file. Both load from the local path already. No milestone needs to fetch these again.

The MSW worker script exists at `frontend/public/mockServiceWorker.js`.

### 2.2 The accent colour

The colour decision is not final. The colour lives in exactly one place, so a change is a one-line edit.

```css
/* frontend/src/index.css */
:root {
    --brand-accent: #99582a;
    --brand-accent-foreground: oklch(0.985 0 0);
}
```

`--primary` and `--ring` read from `--brand-accent`, in both the light theme and the dark theme blocks of `frontend/src/index.css`. Every shadcn component that uses `--primary` or `--ring` therefore follows this one variable. A Tailwind utility class also exists: `bg-brand`, `text-brand`, `border-brand`.

Three more colours are already defined, and are reserved for the verdict only. Section 9.1 of `frontend-handoff.md` states this rule.

```css
--verdict-real: oklch(0.6 0.16 155);        /* emerald */
--verdict-synthetic: oklch(0.58 0.22 25);   /* red */
--verdict-uncertain: oklch(0.75 0.16 75);   /* amber */
```

Tailwind utility classes exist for these too: `text-verdict-real`, `bg-verdict-synthetic`, and so on. Milestone 6 is the first milestone that should use them.

### 2.3 A known shadcn CLI bug

Running `pnpm dlx shadcn@latest add <component>` writes new files to a literal folder named `@` at the repository root, for example `frontend/@/components/ui/card.tsx`. This is wrong. The command must place the file under `frontend/src/`.

Move each new file into `frontend/src/components/ui/` by hand after the command runs. Delete the stray `frontend/@` folder afterward. Run this check after every `shadcn add` command:

```bash
find . -maxdepth 1 -name "@"
```

### 2.4 The API layer

`frontend/src/api/types.ts` holds every type from `docs/ui-contract.md`. This includes `Prompt`, `EnabledModules`, `MotionDetail`, `CaptureMeta`, every request and response body, the error object, and the `FlagReasonCode` and `ApiErrorCode` enums. A helper function `isKnownPromptType` is ready for Milestone 8's registry rejection rule (Section 13 of `frontend-handoff.md`).

`frontend/src/api/client.ts` holds the one fetch wrapper, `apiRequest`. Every API call must go through this function. It reads `VITE_API_BASE_URL`. It throws a typed `ApiError` for a non-2xx response, with the `code` field from Section 3.4 of `docs/ui-contract.md`.

`frontend/src/api/queries.ts` holds four TanStack Query hooks:
- `useStartSession` — a mutation for `POST /start-session`.
- `useSubmitResponse` — a mutation for `POST /submit-response`.
- `useSessionStatus` — a query for `GET /session-status`. Polls once each second. Used by the console route already.
- `useGetResult` — a query for `GET /get-result`. Retries a `409 RESULT_NOT_READY` response up to 10 times, with a 500ms delay. Does not retry any other error.

### 2.5 The mock backend

`frontend/src/mocks/handlers.ts` holds a full in-memory mock backend, not only static fixtures. It runs behind MSW, in the browser, when `VITE_USE_MOCK_API=true`.

The mock backend:
- Creates a session on `POST /start-session`. Stores it in a `Map`, keyed by a generated UUID.
- Validates prompt order on `POST /submit-response`. Returns `409 PROMPT_OUT_OF_ORDER` for a wrong index, and `409 SESSION_ALREADY_COMPLETE` for a session that already finished.
- Generates a mock `liveness_score`, `frame_score`, and `voice_score` for each prompt.
- Sets the session status to `"scoring"` after the last prompt, waits 1200ms, then sets the status to `"complete"` and computes the final result. This lets the console show a `scoring` state, not only a frozen panel followed by a sudden answer.
- Renormalizes the Decision Engine weights over the enabled modules, following Section 8 of `docs/ui-contract.md`.
- Reads `GET /session-status` and `GET /get-result` from the same in-memory record.

**The mock backend picks a "real" or "synthetic" profile from the candidate label.** A candidate label that contains the word "synthetic" (any case) gets the synthetic fixture. Every other label gets the real fixture. Type `synthetic-demo` on the launcher screen to see the synthetic path.

`frontend/src/mocks/fixtures.ts` holds the two fixtures — `REAL_RESULT_FIXTURE` and `SYNTHETIC_RESULT_FIXTURE` — plus the demo prompt set (`DEMO_PROMPTS`), the thresholds (`MOCK_THRESHOLDS`), and the base weights (`MOCK_BASE_WEIGHTS`). These match the Section 7.1 example in `docs/ui-contract.md` exactly.

**When a teammate's backend is ready:** set `VITE_USE_MOCK_API=false` in `frontend/.env.development`. Do not delete the mock files. Section 11 of `frontend-handoff.md` keeps MSW as a fallback for the demo.

### 2.6 Routes

All four routes from Section 5 of `frontend-handoff.md` exist and render:

| Route | File | State |
|---|---|---|
| `/` | `frontend/src/routes/index.tsx` | The launcher. Calls `useStartSession`, opens the interview window, navigates to the console. |
| `/interview/$sessionId` | `frontend/src/routes/interview.$sessionId.tsx` | A placeholder card inside `CandidateShell`. No camera yet. |
| `/console/$sessionId` | `frontend/src/routes/console.$sessionId.tsx` | Polls `useSessionStatus`. Shows the raw status and the prompt count inside `ConsoleShell`. No score bars yet. |
| `/console/$sessionId/settings` | `frontend/src/routes/console.$sessionId.settings.tsx` | A stub. Milestone 7 fills this in. |

`frontend/src/routes/__root.tsx` holds the one `QueryClientProvider`. Every route sits under it.

### 2.7 The two surface shells

`frontend/src/components/candidate/CandidateShell.tsx` gives the candidate surface its ordinary ATS look: light background, a fake company header, a fake job title, a fake interviewer name. The fake identity constants live in `frontend/src/lib/fakeCompany.ts`.

`frontend/src/components/console/ConsoleShell.tsx` gives the operator surface its security-console look: a dark background, a session ID badge, and the brand accent as a status dot.

Every future candidate component goes in `frontend/src/components/candidate/`. Every future console component goes in `frontend/src/components/console/`. This split is already in place. Follow it.

### 2.8 Directories already created, still empty

These directories exist and are ready for the milestones below. An empty directory does not appear in git; do not worry about that.

```
frontend/src/capture/
frontend/src/scoring/
frontend/src/session/
```

---

## 3. Open milestones

Each section below gives the goal, the files to add, and the done-when check. Read the matching section of `docs/frontend-handoff.md` before starting — this document gives the plan, that document gives the full rule set.

### Milestone 2 — Candidate surface, mock scoring

**Goal:** the candidate answers three prompts with a fixed score. The session reaches `complete`.

Add:
- `frontend/src/session/machine.ts` — the reducer from Section 7 of `frontend-handoff.md`. Nine states: `idle`, `requesting_permission`, `calibrating`, `prompt_shown`, `recording`, `uploading`, `next_prompt`, `complete`, `error`.
- `frontend/src/session/useSessionRunner.ts` — drives the machine. Calls `useStartSession` and `useSubmitResponse` from `frontend/src/api/queries.ts`. Sends a fixed `landmark_motion_score` of `0.9` for every prompt. Fill `motion_detail` with placeholder numbers; Milestone 3 replaces them.
- `frontend/src/capture/useMediaStream.ts` — calls `getUserMedia`. Reports `idle`, `prompting`, `granted`, `denied`.
- `frontend/src/components/candidate/CameraFeed.tsx` — shows the video element.
- `frontend/src/components/candidate/PermissionGate.tsx` — shows the camera permission state.
- `frontend/src/components/candidate/PromptCard.tsx` — shows `instruction` and `expected_word`. Read `prompt.type` for logic. Do not read `instruction` for logic (Section 13 of `frontend-handoff.md`).
- `frontend/src/components/candidate/CountdownRing.tsx` — shows the time left in the recording window.

Wire these into `frontend/src/routes/interview.$sessionId.tsx`, replacing the placeholder card.

**Done when:** the candidate answers three prompts in the browser. The session reaches `complete`. The camera shows the live feed. The network tab shows three `POST /submit-response` calls (check against the mock, or the real backend once available).

### Milestone 3 — MediaPipe and real scoring

**Goal:** replace the fixed score with a real one, from the face landmarker.

Add:
- `frontend/src/capture/useFaceLandmarker.ts` — the `requestAnimationFrame` loop. Follow Section 6.1 of `frontend-handoff.md` exactly: the loop writes to a ref, never to React state; the hook publishes a snapshot 8 times each second; `outputFaceBlendshapes: true`; `outputFacialTransformationMatrixes: true`; GPU delegate with a CPU fallback; model path `/mediapipe/face_landmarker.task` (already in `public/`).
- `frontend/src/components/candidate/LandmarkOverlay.tsx` — draws the face mesh on a canvas above the video. This component has no effect on the score. It is visible proof that the check is running.
- `frontend/src/components/candidate/CalibrationHint.tsx` — tells the candidate to centre the face. Feeds the `calibrating` state in the machine.
- `frontend/src/scoring/constants.ts` — every threshold, named, with a comment for the reason. Start from the table in Section 8 of `frontend-handoff.md`: 18 degrees of yaw for a full head-turn score, a jaw-open variance of 0.01 for a full speak-word score, 2 blinks for a full blink score, and the 0.25 `tracking_loss_ratio` penalty line.
- `frontend/src/scoring/scorers.ts` — one function for each `prompt.type`: `head_turn_right`, `head_turn_left`, `speak_word`, `blink`. Each function returns a score from `0.0` to `1.0`, and a full `motion_detail` object with all seven fields filled.
- `frontend/src/scoring/registry.ts` — maps `prompt.type` to the matching scorer. Throws or returns an error state for any other value. Use `isKnownPromptType` from `frontend/src/api/types.ts` for the check.

Update `useSessionRunner` to call the registry instead of sending the fixed `0.9` value.

**Done when:** the mesh draws on the candidate's face. A head turn raises the score. A still head lowers the score. The frame rate stays above 20, measured with the browser's performance panel.

### Milestone 4 — Capture and submit

**Goal:** send a real, full request body to `POST /submit-response`. This is the milestone that unblocks backend testing — see Section 5 of this document.

Add:
- `frontend/src/capture/useFrameSampler.ts` — draws the current video frame to a canvas, returns a base64 JPEG string, no `data:` prefix, 640px wide, quality `0.8`. Two frames for each prompt: one at 40% of the window, one at 80%.
- `frontend/src/capture/useAudioRecorder.ts` — records the microphone with `MediaRecorder`. Returns a base64 string and the exact MIME type (WebM, Opus codec). Returns `null` for a prompt with no `expected_word`.

Update `useSessionRunner` to collect the frames, the audio clip, and `capture_meta`, and to send the full body shape from Section 5.1 of `docs/ui-contract.md`.

At the end of this milestone, set `VITE_USE_MOCK_API=false` in `frontend/.env.development` and confirm the request reaches a real backend at `http://localhost:8000` through the Vite proxy.

**Done when:** the network tab shows a full `POST /submit-response` body. Every field matches `docs/ui-contract.md`. This is the point where a teammate's Frame Classifier, Voice Detection, or Liveness Scorer module can receive a real request from the browser.

### Milestone 5 — Console

**Goal:** the operator surface shows live progress during a real candidate session, in the second window.

Add:
- `frontend/src/components/console/SessionTimeline.tsx` — shows the state of each of the three prompts. Read from `useSessionStatus`'s `completed_prompts` array, already wired into `frontend/src/routes/console.$sessionId.tsx`.
- `frontend/src/components/console/ScoreBar.tsx` — one component score and its threshold marker. Read the threshold value from the API response's `thresholds` field. Do not hold this value in frontend code (Section 7.2 of `docs/ui-contract.md`).
- `frontend/src/components/console/ComponentScorePanel.tsx` — groups three `ScoreBar` instances.
- `frontend/src/components/console/LatencyBadge.tsx` — shows `latency_ms` from the last `prompt_result`.
- `frontend/src/components/console/ScoringState.tsx` — a progress state shown while `status` is `"scoring"`.

Replace the placeholder text in `frontend/src/routes/console.$sessionId.tsx` with these components.

**Done when:** the console fills in each score during a live candidate session, in the second browser window. This is the point where a teammate can watch their model's output land in the UI without reading the network tab.

### Milestone 6 — Verdict and demo controls

**Goal:** the final signal shows in large, legible type. The synthetic video path works.

Add:
- `frontend/src/components/console/SignalVerdict.tsx` — REAL or SYNTHETIC, at least 72px. Use `text-verdict-real` or `text-verdict-synthetic` from `frontend/src/index.css`. Read `useGetResult`.
- `frontend/src/components/console/ConfidenceGauge.tsx` — the combined `confidence` value.
- `frontend/src/components/console/FlagReasonCard.tsx` — maps each `FlagReasonCode` (in `frontend/src/api/types.ts`) to a readable sentence. Show the raw code beside the sentence.
- `frontend/src/capture/useVideoSource.ts` — returns a `<video>` source, either `webcam` or `file` (a prepared MP4 clip). Both source types must run through the same `useFaceLandmarker` and `useFrameSampler` code path.
- `frontend/src/components/candidate/SessionCompleteCard.tsx` — thanks the candidate. Must not show a score.

Apply the legibility rules from Section 9.2 of `frontend-handoff.md`: body text at least 16px, verdict text at least 72px, no font weight under 400.

**Done when:** a real webcam run reads REAL. An MP4 run reads SYNTHETIC, with a flag reason shown. Both verdicts are readable from 3 metres away, on a projector.

### Milestone 7 — Module toggles (optional)

**Goal:** the operator can turn a detection module off before the session starts.

Add:
- `frontend/src/components/console/ModuleToggleRow.tsx` — one switch for one module (`liveness`, `frame`, `voice`).
- Wire three switches into `frontend/src/routes/console.$sessionId.settings.tsx`, replacing the stub card.
- Send the chosen `enabled_modules` object in the `POST /start-session` call, from `frontend/src/routes/index.tsx`. This requires moving the toggle state up to the launcher, or adding a second step before the launcher opens the two windows.

**Done when:** the operator turns the voice module off before starting a session. The result shows `null` for `voice_score` and for `component_scores.voice_detection`.

---

## 4. Priority note for backend testing

A teammate testing a backend module against real frontend traffic needs Milestones 2, 3, and 4 finished, in that order. Milestone 4 is the one that produces a real request body. Milestone 5 is not required to send traffic, but it makes the traffic easy to watch. Milestones 6 and 7 are not required for backend testing.

---

*This document tracks build progress only. `docs/frontend-handoff.md` and `docs/ui-contract.md` remain the source of truth for every rule. Project: Sapien. Built for Origin Weekend, Fall 2026.*
