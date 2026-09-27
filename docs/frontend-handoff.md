# Frontend Handoff — Sapien

**Status:** Ready for build.
**Audience:** Any developer or agent session that builds the Sapien frontend.
**Prerequisite reading:** `docs/ui-contract.md`. That document defines every request and response. This document defines the screens, the components, and the build order.

A new session should be able to start coding from these two files alone. Prior chat history is not needed.

This document follows **ASD-STE100 (Simplified Technical English)**. Each sentence gives one instruction or one fact.

---

## 1. What the frontend is

The frontend is one Vite application. The application serves two surfaces.

| Surface | Route prefix | Who looks at it |
|---|---|---|
| Candidate surface | `/interview` | The candidate |
| Operator surface | `/` and `/console` | The recruiter, and the demo operator |

The candidate surface looks like a standard ATS interview screen. Sapien is not visible on this surface. The surface holds the camera, MediaPipe, the frame sampler, and the audio recorder.

The operator surface looks like a security console. The surface shows the scores and the verdict. **The candidate must never see this surface.** Section 5.1 step 13 of `handoff.md` states this rule.

The two surfaces must look like two different products. This difference supports the pitch. The pitch states that Sapien runs inside the customer's own product.

The demo runs both surfaces on one machine, in two browser windows. The operator opens the candidate window from the launcher screen.

---

## 2. Tech stack

| Layer | Tool |
|---|---|
| Build tool | Vite |
| Language | TypeScript |
| Framework | React |
| Routing | TanStack Router, file-based routes |
| Server state | TanStack Query |
| Components | shadcn/ui |
| Styling | Tailwind CSS |
| Face tracking | `@mediapipe/tasks-vision`, Face Landmarker |
| Mock API | MSW (Mock Service Worker) |

Do not add a state management library. Section 7 explains the state plan. TanStack Query holds the server state. One reducer holds the session state.

---

## 3. Project setup

Run these commands from the repository root.

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @tanstack/react-router @tanstack/react-query
npm install @mediapipe/tasks-vision
npm install -D @tanstack/router-plugin tailwindcss @tailwindcss/vite msw
npx shadcn@latest init
```

Add the Tailwind plugin and the TanStack Router plugin to `vite.config.ts`.
Set the dev server port to `5173`.
Add a proxy entry for `/api` to `http://localhost:8000`. The browser then sends no cross-origin request in development.

Add this environment file as `frontend/.env.development`:

```
VITE_API_BASE_URL=/api
VITE_USE_MOCK_API=true
```

Set `VITE_USE_MOCK_API` to `false` after the backend returns real data.

### 3.1 MediaPipe assets

Download two asset groups. Put both groups in `frontend/public/mediapipe/`.

1. The WASM files from the `@mediapipe/tasks-vision` package, folder `wasm`.
2. The model file `face_landmarker.task`.

Load both from the local path. Do not load either from a CDN. The venue network may be slow or blocked during the demo.

---

## 4. File layout

Create this structure under `frontend/src/`.

```
src/
  routes/
    __root.tsx                 Root layout. Holds the QueryClient provider.
    index.tsx                  Operator launcher. Starts a session.
    interview.$sessionId.tsx   Candidate surface.
    console.$sessionId.tsx     Operator console.
    console.$sessionId.settings.tsx   Module toggles. Optional.
  api/
    client.ts                  fetch wrapper. Reads VITE_API_BASE_URL.
    types.ts                   TypeScript types from docs/ui-contract.md.
    queries.ts                 TanStack Query hooks.
  capture/
    useMediaStream.ts          Camera and microphone access.
    useFaceLandmarker.ts       MediaPipe loop. Holds landmarks in a ref.
    useFrameSampler.ts         Video frame to base64 JPEG.
    useAudioRecorder.ts        MediaRecorder to base64.
    useVideoSource.ts          Webcam source, or MP4 file source.
  scoring/
    constants.ts               Every threshold and every limit.
    scorers.ts                 One scorer function for each prompt type.
    registry.ts               Maps prompt.type to a scorer.
  session/
    machine.ts                 The session reducer.
    useSessionRunner.ts        Drives the machine. Calls the API.
  components/
    ui/                        shadcn output. Do not edit by hand.
    candidate/                 Candidate surface components.
    console/                   Operator surface components.
  mocks/
    handlers.ts                MSW handlers.
    fixtures.ts                A real payload and a synthetic payload.
  lib/
    utils.ts                   shadcn helper.
```

Keep every threshold in `scoring/constants.ts`. Do not write a number inline in a component. A teammate must find and change a value in one place.

---

## 5. Routes

| Route | Purpose |
|---|---|
| `/` | Show the launcher. Start a session. Open the candidate window. |
| `/interview/$sessionId` | Run the live session. Show the camera and the prompts. |
| `/console/$sessionId` | Show the live scores and the verdict. |
| `/console/$sessionId/settings` | Turn a detection module on or off. Optional. |

The `$sessionId` parameter joins the two surfaces. TanStack Router types this parameter.

The launcher calls `POST /start-session`. The launcher then opens two windows. The launcher opens `/console/$sessionId` in the current window. The launcher opens `/interview/$sessionId` with `window.open`.

Do not add a join code. Do not add a QR code. Both surfaces run on the same machine. A link is enough.

---

## 6. The capture layer

Write the capture layer as hooks. Do not write it as components.

### 6.1 `useFaceLandmarker`

This hook owns a `requestAnimationFrame` loop. The loop runs about 30 times each second.

**The loop must not set React state.** A state update at 30 frames each second re-renders the whole tree and drops the frame rate. The loop writes each result into a ref. The hook publishes a small snapshot 8 times each second. The UI meters read the snapshot.

Create the landmarker with these options:

```ts
{
  baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "GPU" },
  runningMode: "VIDEO",
  numFaces: 1,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true,
}
```

Set `outputFaceBlendshapes` to `true`. The blendshape values are more stable than raw landmark arithmetic. Use `jawOpen` for speech. Use `eyeBlinkLeft` and `eyeBlinkRight` for blinks.

Set `outputFacialTransformationMatrixes` to `true`. The matrix gives the head rotation directly. Read the yaw angle from the 4×4 matrix. A pixel distance between two landmarks is not reliable, because the candidate can move closer to the camera.

Keep a fallback measurement. Use the normalized x position of landmark index `1`, the nose tip. Send this value as `nose_dx_normalized`.

Fall back to `delegate: "CPU"` when the GPU delegate fails to start.

### 6.2 `useMediaStream`

The hook calls `getUserMedia`. The hook requests video at 640×480. The hook requests audio.

The hook reports one of four states: `idle`, `prompting`, `granted`, and `denied`.

Request the permission on the launcher screen. Do not request the permission during the demo.

### 6.3 `useVideoSource`

The hook returns a `<video>` element source. The hook accepts two source types.

| Source | Use |
|---|---|
| `webcam` | The real candidate |
| `file` | The prepared MP4 clip of the synthetic candidate |

MediaPipe accepts any `<video>` element. The frame sampler accepts the same element. The two source types therefore run through the same code path.

Section 10 of `handoff.md` suggests a screen recording as the synthetic input. The file source replaces that method. The file source gives the same result in every rehearsal. The file source also removes screen glare from the frames.

### 6.4 `useFrameSampler`

The hook draws the current video frame onto a canvas. The hook returns a base64 JPEG string.

Set the frame width to 640 pixels. Set the JPEG quality to `0.8`. Remove the `data:` prefix from the string.

Sample 2 frames for each prompt. Sample the first frame at 40% of the window. Sample the second frame at 80% of the window.

### 6.5 `useAudioRecorder`

The hook records the microphone with `MediaRecorder`. The hook returns a base64 string and the MIME type.

The browser produces WebM audio with the Opus codec. Send the exact MIME type in the `audio_mime` field.

The hook returns `null` for a prompt with no expected word.

---

## 7. Session state

Hold the session state in one reducer, in `session/machine.ts`. Do not use separate boolean flags. Nine states with separate flags produce bugs on demo day.

| State | What happens next |
|---|---|
| `idle` | The candidate presses Start. |
| `requesting_permission` | The browser asks for the camera. |
| `calibrating` | The landmarker finds a face. The state waits for 5 good frames. |
| `prompt_shown` | The prompt appears. A 2-second lead-in runs. |
| `recording` | The recording window runs for `prompt.duration_ms`. |
| `uploading` | `POST /submit-response` runs. |
| `next_prompt` | The response holds a next prompt. Return to `prompt_shown`. |
| `complete` | The response holds `status: "complete"`. |
| `error` | An API call or the camera failed. |

Add the `calibrating` state before the first prompt. A candidate who is off-centre would fail prompt 1 without it.

Add the 2-second lead-in before each recording window. The candidate needs time to read the instruction. Scoring must not start during reading.

`useSessionRunner` drives the machine. The hook calls the API. The hook collects the score, the frames, and the audio clip for each prompt.

---

## 8. Scoring

Each prompt type needs its own scorer function. `scoring/registry.ts` maps `prompt.type` to a function.

```ts
type Scorer = (window: LandmarkWindow) => { score: number; detail: MotionDetail };
```

| Prompt type | Rule | Full score at |
|---|---|---|
| `head_turn_right` | Read the peak positive yaw angle. | 18 degrees |
| `head_turn_left` | Read the peak negative yaw angle. | 18 degrees |
| `speak_word` | Read the variance of `jawOpen`. | A variance of 0.01 |
| `blink` | Count the `eyeBlink` peaks over the threshold. | 2 blinks |

Each scorer returns a value from `0.0` to `1.0`. Each scorer returns the full `motion_detail` object from Section 5.2 of `docs/ui-contract.md`. Every scorer fills all seven detail fields.

Lower the score when `tracking_loss_ratio` is above `0.25`. The capture is poor in that case.

Put every number in `scoring/constants.ts`. Name each constant. Add a comment with the reason for the value.

The frontend must reject an unknown `prompt.type`. Show an error state. Do not guess a scorer.

---

## 9. Design system

### 9.1 Colours

Use a light base colour on the operator surface. Use one accent colour.

Reserve three colours for the verdict only. No other element uses these three colours.

| Colour | Meaning |
|---|---|
| Emerald | The signal is `real`. |
| Red | The signal is `synthetic`. |
| Amber | A score falls in the uncertain band. |

Section 15.3 of `handoff.md` defines an uncertain band for the voice score. The UI must show a third state. Do not build only two states.

Set the theme one time, in CSS variables. shadcn reads these variables.

### 9.2 Legibility

A judge reads the console from 3 metres away. A projector lowers the contrast.

Set the body text to 16px at least.
Set the verdict text to 72px at least.
Do not use a font weight under 400.
Do not put important text on a low-contrast background.

### 9.3 The candidate surface look

Use a light theme. Use a neutral corporate style. Add a fake company name and a fake job title. Add a fake interviewer name.

The candidate surface must look ordinary. An ordinary look proves the pitch.

---

## 10. Components

Take these primitives from shadcn: Button, Card, Badge, Progress, Alert, Dialog, Switch, Tabs, Tooltip, Separator, Skeleton, and Sonner.

### 10.1 Candidate components

| Component | What it does |
|---|---|
| `CameraFeed` | Shows the video element. |
| `LandmarkOverlay` | Draws the face mesh on a canvas above the video. |
| `PromptCard` | Shows the instruction and the expected word. |
| `CountdownRing` | Shows the time left in the recording window. |
| `PermissionGate` | Shows the camera permission state. |
| `CalibrationHint` | Tells the candidate to centre the face. |
| `SessionCompleteCard` | Thanks the candidate. Shows no score. |

`LandmarkOverlay` has no effect on the result. The overlay shows that the check is running. The overlay is the visible proof of the client-side work.

`SessionCompleteCard` must not show a score. The candidate must not learn the verdict.

### 10.2 Console components

| Component | What it does |
|---|---|
| `SignalVerdict` | Shows REAL or SYNTHETIC in large type. |
| `ConfidenceGauge` | Shows the combined confidence value. |
| `ScoreBar` | Shows one component score and its threshold marker. |
| `ComponentScorePanel` | Groups the three score bars. |
| `SessionTimeline` | Shows the state of each of the three prompts. |
| `FlagReasonCard` | Shows the `flag_reason` code as a readable sentence. |
| `ModuleToggleRow` | Turns one detection module on or off. |
| `LatencyBadge` | Shows the response time of the last API call. |
| `ScoringState` | Shows a progress state while the backend runs a model. |

`ScoreBar` must draw the threshold marker on the track. The marker shows the reason for the verdict. A frame score of `0.09` then appears below a line at `0.15`. This single element carries the technical story to the judges.

Read the threshold value from the `thresholds` field of the API response. Do not hold the value in frontend code. Section 7.2 of `docs/ui-contract.md` states this rule.

`FlagReasonCard` maps each code to a sentence. Section 7.3 of `docs/ui-contract.md` lists the codes. Show the raw code beside the sentence. A judge may ask for the exact value.

---

## 11. Build order

Build in this order. Each milestone produces a runnable application. Do not start a milestone before the previous milestone runs.

### Milestone 0 — Project setup
Run the commands in Section 3. Add the Tailwind and Router plugins. Copy the MediaPipe assets into `public/`.
**Done when:** `npm run dev` serves an empty page at `http://localhost:5173`.

### Milestone 1 — Routes and mock API
Create the four routes from Section 5. Create the types in `api/types.ts` from `docs/ui-contract.md`. Create the MSW handlers and the two fixtures. Add the layout shell for each surface.
**Done when:** each route renders. The launcher starts a mock session. The route parameter carries the session ID.

### Milestone 2 — Candidate surface, mock scoring
Build `CameraFeed`, `PermissionGate`, `PromptCard`, and `CountdownRing`. Build the session reducer from Section 7. Send a fixed `landmark_motion_score` of `0.9`.
**Done when:** the candidate answers three prompts. The session reaches the `complete` state. The camera shows the live feed.

### Milestone 3 — MediaPipe and real scoring
Add `useFaceLandmarker`. Add `LandmarkOverlay`. Add the scorers and the registry from Section 8. Replace the fixed score.
**Done when:** the mesh draws on the face. A head turn raises the score. A still head lowers the score. The frame rate stays above 20.

### Milestone 4 — Capture and submit
Add `useFrameSampler` and `useAudioRecorder`. Send the frames, the audio clip, and the `motion_detail` object.
**Done when:** the network tab shows a full `POST /submit-response` body. Every field matches `docs/ui-contract.md`.

### Milestone 5 — Console
Build `SessionTimeline`, `ScoreBar`, and `ComponentScorePanel`. Poll `GET /session-status` one time each second with TanStack Query.
**Done when:** the console fills in each score during a live candidate session, in the second window.

### Milestone 6 — Verdict and demo controls
Build `SignalVerdict`, `ConfidenceGauge`, and `FlagReasonCard`. Add `useVideoSource` with the MP4 file option. Apply the design rules in Section 9.
**Done when:** the real run reads REAL. The MP4 run reads SYNTHETIC with a flag reason. Both verdicts read from 3 metres away.

### Milestone 7 — Module toggles (optional)
Build the settings route and `ModuleToggleRow`. Send `enabled_modules` in `POST /start-session`.
**Done when:** the operator turns the voice module off. The result shows `null` for that score.

Switch `VITE_USE_MOCK_API` to `false` after Milestone 4. Keep the MSW handlers in the code. The mock mode is the fallback if the network or a model fails during the demo.

---

## 12. Known risks

| Risk | Control |
|---|---|
| The camera fails on a network address | Run both surfaces on `http://localhost`. The browser accepts localhost as a secure context. A LAN IP address over HTTP does not get the camera. |
| The MediaPipe assets load slowly | Serve the assets from `public/`. Do not use a CDN. |
| The browser asks for permission during the demo | Request the permission on the launcher screen, before the demo starts. |
| The backend cannot read WebM audio | Confirm this item with the backend team early. Section 5.4 of `docs/ui-contract.md` states the action. WAV encoding in the browser is a large change. |
| The request body is too large | Keep the frames at 640 pixels wide. Keep the audio clip under 15 seconds. |
| The model inference is slow | Show the `scoring` state. Add `LatencyBadge`. A visible wait is better than a frozen panel. |
| A candidate moves out of frame | Add the `calibrating` state. Report `tracking_loss_ratio` in every request. |

---

## 13. Rules for this build

Do not add a screen the demo does not need.
Do not add user accounts. Do not add a login screen.
Do not store data after the session. The session lives in memory only.
Do not call a detection service directly. Every request goes through the API layer.
Do not show any score on the candidate surface.
Do not write a threshold number inline in a component.
Do not read the `instruction` string to find the prompt type.

---

*This document and `docs/ui-contract.md` together define the frontend build. `docs/handoff.md` defines the whole system. Project: Sapien. Built for Origin Weekend, Fall 2026.*
