# Video Call Scenario — Frontend Handoff

**Status:** Ready for build. Target: the demo tonight.
**Audience:** Any developer or agent session that builds the video call scenario in the Sapien frontend.
**Prerequisite reading:**
- `docs/ui-contract.md`, Revision 2. Sections 3.5, 3.6, 12, 13, and 14 define the new API behaviour.
- `docs/frontend-progress.md`. It describes the frontend that exists now.
- `docs/frontend-handoff.md`. Its rules still apply.

A new session can start from these documents alone. Prior chat history is not needed.

This document follows **ASD-STE100 (Simplified Technical English)**. Each sentence gives one instruction or one fact.

**Start with Section 0.** Complete both tasks in Section 0 before any other work in this document.

---

## 0. First tasks

These two tasks come before the video call work. Both tasks change the existing ATS interview flow. Neither task needs a backend change.

### 0.1 Restore the synthetic candidate clip switch

The launcher has no "Use synthetic candidate clip" switch. The audio integration merge (commit `47bd84a`) removed it. That merge also removed the rule that skips the camera permission prompt for the file source.

The rest of the file source path still exists:
- `routes/interview.$sessionId.tsx` reads `?source=file`.
- `capture/useVideoSource.ts` supports the `file` source type.
- `components/ui/switch.tsx` exists.

Only the launcher control is missing. Restore it in `frontend/src/routes/index.tsx`:

1. Import `Switch` from `@/components/ui/switch`.
2. Add a `useSyntheticClip` state value. The default is `false`.
3. Add the switch row below the candidate label field. The label is "Use synthetic candidate clip". The helper text is "Plays a prepared MP4 instead of the webcam".
4. Skip `primeCameraPermission()` when the switch is on. The file source needs no camera and no microphone.
5. Add `?source=file` to the candidate URL when the switch is on.
6. Keep the current `window.open("about:blank")` call before the `await`. The browser ties a window to the click only if the window opens before the first `await`. A window opened later is blocked as a popup.
7. Build the candidate URL in one helper, `buildCandidateUrl(sessionId, useSyntheticClip)`. Milestone 1 adds a `scenario` argument to this helper.

The file source fails against the live backend until the audio fix in Section 4.2 is done. The backend rejects a voice prompt with no audio clip. This failure is expected after this task. Section 4.2 removes it.

**Done when:** with the switch on, the candidate window opens at `/interview/$sessionId?source=file`. The window plays the MP4, or a blank video if the clip is still missing. The browser shows no permission prompt. With the switch off, the flow is the same as before.

### 0.2 Apply the final design system

The platform colour is final: **Rose, `#E86B78`**. The platform icon is `frontend/public/sapien-icon.jpeg`.

#### Colour

1. In `frontend/src/index.css`, set `--brand-accent: #E86B78`.
2. Set `--brand-accent-foreground` to a dark value, for example `oklch(0.145 0 0)`. Do not keep the white value. White text on `#E86B78` has a contrast ratio of about 3.1 to 1. Normal text needs 4.5 to 1. Dark text on the rose gives about 6 to 1.
3. Do not add a second colour definition. `--primary`, `--ring`, and the `bg-brand` utilities already read from `--brand-accent`.

#### Keep the rose off the candidate surfaces

Sapien must not be visible to the candidate. Today `--primary` reads `--brand-accent` in both theme blocks. The shadcn `Button` on the ATS screen ("Start interview") therefore shows the Sapien colour.

4. In `index.css`, add a scoped class, `.surface-ats`. It sets `--primary` to a slate near-black, `--primary-foreground` to white, and `--ring` to a light slate.
5. Apply `.surface-ats` on the root element of `CandidateShell`.
6. Milestone 2 adds a second class, `.surface-call`, for `CallShell`. Use a neutral grey or a conferencing blue. Do not use the rose.

#### Keep the verdict colours distinct from the rose

The synthetic verdict colour is `oklch(0.58 0.22 25)`. The rose has an oklch hue of about 12. The two hues are close. On a projector, a rose button and a red SYNTHETIC verdict can look like the same colour. The verdict then loses its meaning.

7. Move `--verdict-synthetic` toward vermilion. Use `oklch(0.62 0.21 40)` as the start value. The hue distance to the amber verdict (hue 75) stays large.
8. Do not put a rose border, rose background, or rose text next to `SignalVerdict`.
9. Confirm the result on the projector before the demo, if possible. Put a rose primary button and a SYNTHETIC verdict on the same screen. The two colours must look different.

Step 7 changes a verdict colour. Confirm the new value with the project owner before the demo.

#### Icon

The icon is a JPEG, 82 by 124 pixels. It has a white background and no transparency. One stroke of the icon is black. That stroke disappears on a dark background.

10. In `ConsoleShell`, replace the `bg-brand` dot with the icon. Put the icon on a small white tile with rounded corners. Set the height to about 28 pixels. Set the width to `auto`. Do not force a square shape. The icon is taller than it is wide.
11. On the launcher card, show the icon above the card title, on the same white tile. Keep the icon at 48 pixels tall or less. The file is small. A larger size looks blurred on a high-density screen.
12. In `frontend/index.html`, change the favicon link to `href="/sapien-icon.jpeg"` and `type="image/jpeg"`. The browser fits the tall image into a square. This result is acceptable for tonight.
13. Do not show the icon on either candidate surface.
14. Add an entry to `docs/frontend-deferred-fixes.md`: replace the JPEG with a square PNG or SVG with a transparent background.

#### Records

15. Update Section 2.3 of `docs/frontend-progress.md`. State that the colour is final. Record the rose, the dark foreground, the new synthetic verdict value, and the `.surface-ats` rule.

**Done when:** the console header and the launcher show the icon on a white tile. The primary buttons on the console and the launcher are rose, with dark text. The ATS "Start interview" button is slate, not rose. A SYNTHETIC verdict and a rose button look clearly different on the same screen. The browser tab shows the icon.

---

## 1. What this scenario adds

The launcher gets a scenario dropdown. The dropdown has two values:

| Scenario | Default | Candidate surface |
|---|---|---|
| ATS interview | Yes | The existing `/interview/$sessionId` route. No change. |
| Video call | No | A new `/call/$sessionId` route. It looks like a Zoom or Google Meet call. |

In the video call, the candidate follows no list of instructions. The frontend records the call in 5-second windows. Sapien scores each window in the background. The operator console shows a verdict that updates after each window.

At one point in the call, the host asks for a quick check. This check is the **challenge**. The challenge arrives at a random slot, or when the operator presses a button. A prepared clip cannot answer an instruction it did not expect. The challenge is therefore the moment the synthetic candidate fails.

The pitch point: the same API and the same SDK now run inside a conferencing product. Section 13 of `handoff.md` names this as the secondary delivery model.

---

## 2. Decisions already made

Do not reopen these decisions tonight.

| Decision | Value |
|---|---|
| Scope | All three tiers (Section 6). Build them in order. Each tier must run before the next tier starts. |
| Call layout | Picture in picture. The interviewer is the large tile. The candidate's self view is a small tile. |
| Main projector screen | The operator console. |
| Challenge trigger | Both. The backend schedules an auto challenge. The operator can also request one earlier. |
| Challenges for each call | One at most. |
| Call length | 8 slots, fixed. About 50 seconds. |
| Captions | Out of scope. |
| Face mesh overlay in the call | Off. A real conferencing product shows no mesh. |

---

## 3. Rules that apply to this work

The rules in Section 1 of `docs/frontend-progress.md` still apply:
- Use `pnpm`. Do not use `npm`.
- Do not run a git command. The project owner runs git commands.
- Keep every threshold and every limit in `frontend/src/scoring/constants.ts`.
- The verdict colours (`text-verdict-real`, `text-verdict-synthetic`, `text-verdict-uncertain`) belong to `SignalVerdict` only.

The last rule affects this work directly. The trust timeline (Section 5.3) must not use the verdict colours. Use bar height, a threshold line, and neutral colours. The call's red "Leave" button uses a plain Tailwind red such as `bg-red-600`. It does not use a verdict token.

---

## 4. Prerequisite — the synthetic clip and its audio

Complete this step before Tier 1. Both scenarios need it.

### 4.1 The clip

`frontend/public/media/synthetic-candidate.mp4` does not exist yet. `frontend/public/media/README.md` states the filename.

For the video call, the clip needs:
- A visible, centred face. Calibration needs 5 frames with a face.
- Synthetic audio, from a TTS tool or a voice clone. The voice check is the passive signal most likely to catch the clip. The frame classifier is off on the backend.
- About 60 seconds of natural talk. The call takes about 50 seconds. `CameraFeed` loops the clip, but a visible loop looks false.
- Ordinary interview talk. Do not put a challenge phrase in the script.
- H.264 video in an MP4 container.

An AI avatar tool (HeyGen, Synthesia, or D-ID) makes the face and the voice in one file. Avoid ElevenLabs audio if possible. Section 15.1 of `handoff.md` reports it as the voice model's weak spot.

Run the clip's audio through Vishield's `training/check_file.py` before the demo. Section 15.6 of `handoff.md` gives the method. The clip must score as synthetic. If it does not, the synthetic demo depends on the challenge alone.

### 4.2 The audio capture fix

**The current code sends no audio for the file source.** `useSessionRunner` starts the recorder only when `videoSource.stream` exists. The file source has no stream. The live backend then rejects prompt 1 with `VALIDATION_ERROR`, because a voice-enabled prompt needs an audio clip. The candidate window goes to the error state.

Fix it as follows:

1. In `CameraFeed`, remove the `muted` attribute for the file source only. Keep `muted` for the webcam. A webcam that plays its own microphone causes echo.
2. Start playback after the candidate's button press. The press counts as a user gesture. The browser then allows playback with sound.
3. After playback starts, call `video.captureStream()` one time. Keep the result in a ref. Pass its audio tracks to `audioRecorder.startRecording`.
4. Add this capture to `useVideoSource`. Return an `audioStream` for both source types. For the webcam, it is the webcam stream. For the file, it is the captured stream.
5. In `useSessionRunner`, read `videoSource.audioStream` instead of `videoSource.stream` for recording.

The demo browser is Chrome. Chrome supports `HTMLMediaElement.captureStream()`.

**Verify this step in Chrome.** Record one prompt with the file source. Decode the `audio_clip` from the request body in the Network tab. Confirm that the audio is not silent. If the clip is silent, use the fallback: create an `AudioContext`, call `createMediaElementSource(video)`, and connect it to a `MediaStreamAudioDestinationNode`. Also connect it to `audioContext.destination`, or the audience hears nothing.

**Done when:** the ATS interview scenario runs end to end with the file source against the live backend. The console shows a voice score for the synthetic run.

---

## 5. The design

### 5.1 The launcher

Add a shadcn `Select` for the scenario. The project has no `Select` component yet. Run `pnpm dlx shadcn@latest add select`. Then apply the fix from Section 2.2 of `docs/frontend-progress.md`: move the new file out of the stray `frontend/@` folder, into `frontend/src/components/ui/`.

The dropdown reads from a scenario registry, `frontend/src/lib/scenarios.ts`:

```ts
export const SCENARIOS = [
  {
    id: "ats_interview",
    label: "ATS interview",
    description: "Three scripted liveness and voice prompts inside a recruiting portal.",
  },
  {
    id: "video_call",
    label: "Video call",
    description: "A conferencing call with passive monitoring and one surprise challenge.",
  },
] as const satisfies readonly { id: Scenario; label: string; description: string }[];

export const DEFAULT_SCENARIO: Scenario = "ats_interview";
```

The launcher does these steps:
1. It sends `scenario` in `POST /start-session`.
2. It stores `scenario` in the session bootstrap, beside the existing fields in `frontend/src/lib/sessionBootstrap.ts`.
3. It opens `/interview/$sessionId` or `/call/$sessionId`, from the `scenario` in the response.
4. It adds `?source=file` when the "Use synthetic candidate clip" switch is on. This step does not change.

Show the description of the selected scenario under the dropdown.

### 5.2 The call surface — `/call/$sessionId`

Create a new route file, `frontend/src/routes/call.$sessionId.tsx`. Do not add a mode to the interview route. The two layouts share no markup. The two routes share the capture hooks and the session runner.

Copy `validateSearch` from the interview route. The `source` search parameter works the same way.

Add the fake identity to `frontend/src/lib/fakeCompany.ts`:

```ts
export const FAKE_CALL_PRODUCT = "Huddle";
export const FAKE_MEETING_TITLE = "Final round — Senior Platform Engineer";
```

The host is `FAKE_INTERVIEWER_NAME`. The meeting belongs to `FAKE_COMPANY_NAME`. The customer's ATS and its conferencing tool then tell one story.

The screens, in order:

| Session state | What the call shows |
|---|---|
| `idle` | A pre-join screen: "Ready to join?", a camera preview, and a "Join now" button. The button dispatches `START`. It is also the user gesture that allows audio playback for the file source. |
| `requesting_permission`, `calibrating` | The call stage. The self tile shows "Joining…". |
| `prompt_shown`, `recording`, `uploading`, `next_prompt` | The call stage. A passive window shows nothing extra. A challenge shows the host request banner. |
| `complete` | "The meeting has ended." Show no score. |
| `error` | A plain conferencing error card. Show the error message. |

The call stage holds these components. Put them in `frontend/src/components/call/`:

| Component | What it does |
|---|---|
| `CallShell` | The dark conferencing frame: product name, meeting title, and a call timer. Use neutral greys. Apply the `.surface-call` class from Section 0.2. Do not use the rose. |
| `RemoteTile` | The large tile. It shows the host's initials in a circle and the host's name. |
| `SelfTile` | The small picture-in-picture tile, bottom right, about 240 by 180 pixels. It holds `CameraFeed`. Its label is "You". |
| `CallControls` | The bottom bar: microphone, camera, and a red "Leave" button. These controls are decorative. They do nothing. |
| `HostRequestBanner` | A card at the top of the stage: "Morgan Ellis asked for a quick identity check". It shows the instruction, the phrase, and `CountdownRing`. |
| `CallEndedCard` | The `complete` state. It shows no score. |

`CameraFeed` has a fixed width class, `w-[480px]`. Add a `className` prop. `SelfTile` passes a smaller width.

The small tile changes only the CSS size. The `<video>` element still decodes at 640 by 480. MediaPipe and the frame sampler read the decoded frame, not the displayed size. Tracking quality does not change.

Do not render `LandmarkOverlay` in the call. The candidate must not see any sign of Sapien.

### 5.3 The console

`frontend/src/routes/console.$sessionId.tsx` reads `data.scenario` from `GET /session-status`. Split the page body into two components:

| Component | Scenario | Contents |
|---|---|---|
| `InterviewConsole` | `ats_interview` | The current page body. Move it with no change. |
| `CallConsole` | `video_call` | The components below. |

Put both components in `frontend/src/components/console/`. Show the scenario as a badge beside the status badge, for both scenarios.

`CallConsole` holds these parts, from top to bottom:

| Part | What it shows |
|---|---|
| Rolling verdict | `SignalVerdict` and `ConfidenceGauge`, read from `rolling_result`. Add a `size` prop to `SignalVerdict`, with `"large"` and `"compact"` values. Use `"compact"` here. |
| `TrustTimeline` | 8 columns, one for each slot. Each column shows the liveness score as a bar and the voice score as a second bar. A horizontal line marks `thresholds.decision`. The challenge slot has an outline and a "Challenge" label. A silent window shows a dash for voice. |
| `ChallengePanel` | The challenge state, its source, and `RequestChallengeButton`. Before a challenge, it shows "Auto challenge at window N", from `challenge.auto_index`. |
| Final result | After `status` is `"complete"`: the large `SignalVerdict`, `FlagReasonCard`, and `ComponentScorePanel`. Reuse the existing components. |

Show the rolling verdict only after 2 slots are complete. One window with the head turned away can give a low score. A verdict that flips on the first window looks broken. Add `MIN_SLOTS_FOR_ROLLING_VERDICT = 2` to `scoring/constants.ts`. Before that, show "Gathering signal…".

`RequestChallengeButton` is enabled only when `challenge.state` is `"none"` and the session is not complete. After a press, show "Challenge queued — arrives after the current window". Show the error message for a `409` response.

Add `challenge_failed` to `FLAG_REASON_SENTENCES` in `FlagReasonCard.tsx`. The TypeScript `Record` type makes this step required. The build fails without it.

### 5.4 The session runner

Generalize `useSessionRunner`. Do not write a second runner. The reducer states do not change.

Add `frontend/src/session/presentation.ts`:

```ts
export interface PromptPresentation {
  leadInMs: number;
  showsPrompt: boolean;
  recordsAudio: boolean;
}

export function getPromptPresentation(prompt: Prompt): PromptPresentation;
```

| `prompt.kind` | `leadInMs` | `showsPrompt` | `recordsAudio` |
|---|---|---|---|
| `scripted` | `LEAD_IN_MS` | `true` | `prompt.expected_word !== null` |
| `passive` | `0` | `false` | `true` |
| `challenge` | `LEAD_IN_MS` | `true` | `true` |

Move `LEAD_IN_MS` from `useSessionRunner.ts` into `scoring/constants.ts`.

Change `useSessionRunner` in three places:
1. The `prompt_shown` effect waits for `presentation.leadInMs`, not the fixed constant.
2. The `recording` effect starts audio when `presentation.recordsAudio` is true. It records from `videoSource.audioStream` (Section 4.2).
3. The runner returns the presentation of the current prompt. The routes read `showsPrompt` to decide on the prompt card or the banner.

The runner already handles a challenge. The backend sends the challenge as `next_prompt`. The runner shows it like any other prompt.

Do not overlap uploads. The backend checks the prompt order and the prompt type. A new window recorded during an upload would carry the wrong type if the response holds a challenge. The upload gap is under 1 second for a passive window. The call video keeps playing during the gap.

Ignore the `no_speech_in_window` warning on the candidate surface. It is not an error.

### 5.5 Scoring

Add `passive_window` to the `PromptType` union and to `isKnownPromptType` in `api/types.ts`. Add a scorer to the registry.

`scorePassiveWindow` measures three facts. A frozen feed, a static photo, or an absent face fails. A replayed video of a real person passes. The challenge exists for that case.

| Fact | Measurement | Full value at |
|---|---|---|
| Face presence | `1 - tracking_loss_ratio` | A ratio of `0` |
| Natural motion | The standard deviation of the yaw values in the window | `PASSIVE_MIN_YAW_STDDEV_DEG = 0.5` |
| Natural blinks | `blink_count` in the window | 1 blink. Give `PASSIVE_NO_BLINK_FACTOR = 0.6` for 0 blinks. A person does not blink in every 5-second window. |

Score: `presence × (motionFactor + blinkFactor) / 2`.

Put each value in `scoring/constants.ts`, with a comment that gives the reason.

Fill all seven `motion_detail` fields, as for every other scorer.

### 5.6 The API layer

Add to `api/types.ts`, from `docs/ui-contract.md` Revision 2:
- The `Scenario` type and the `PromptKind` type.
- `kind` on `Prompt` and on `CompletedPromptSummary`.
- `scenario` on `StartSessionRequest`, `StartSessionResponse`, and `SessionStatusResponse`.
- `rolling_result` and `challenge` on `SessionStatusResponse`.
- The `Challenge` type, with `ChallengeState` and `ChallengeSource`.
- `challenge_failed` in `FlagReasonCode`.
- The three new `CHALLENGE_*` codes in `ApiErrorCode`.
- `RequestChallengeRequest` and `RequestChallengeResponse`.

Add `useRequestChallenge` to `api/queries.ts`. It is a mutation. On success, invalidate the `useSessionStatus` query, so the console shows the new state at once.

### 5.7 The mock backend

Extend `mocks/handlers.ts` in every tier. The frontend must never wait for the backend team.

The mock must follow `docs/ui-contract.md` Sections 12 and 13. The existing profile rule still applies: a candidate label with the word "synthetic" gets the synthetic profile. For the synthetic profile in a call:
- The passive windows score well. A replayed clip looks alive.
- The voice scores are low.
- The challenge fails: a low liveness score and `word_match: false`.

The mock then shows the intended story: a call that looks normal, then a flip to SYNTHETIC at the challenge.

---

## 6. Build order

Complete Section 0 first. Complete Section 4 second. Then build the tiers in order. Each milestone produces a runnable application. If time runs out, stop at the end of a milestone. Do not demo half a milestone.

Build each milestone against the mock first. Then confirm it against the live backend, after the backend team completes the matching tier in Section 14 of `docs/ui-contract.md`.

### Tier 1 — Scenario switch

**Milestone 1 — Types, registry, and launcher.**
Add the Tier 1 types (Section 5.6): `Scenario`, `PromptKind`, `kind`, and `scenario`. Add `lib/scenarios.ts`. Add the `Select` to the launcher. Store `scenario` in the bootstrap. Add a `scenario` argument to `buildCandidateUrl` (Section 0.1). Open the route that matches the scenario. The synthetic clip switch applies to both scenarios. Update the mock: accept `scenario`, and add `kind` to every prompt.
**Done when:** the dropdown shows two scenarios. "ATS interview" is the default and runs as before. "Video call" opens `/call/$sessionId`. That route can be a stub at this point.

**Milestone 2 — The call surface.**
Build the components in Section 5.2. Add `session/presentation.ts` (Section 5.4). For a `video_call` session in Tier 1, the backend sends the three ATS prompts with `kind: "challenge"`. The call therefore shows three host request banners. Add a scenario badge to the console. Leave the console body as it is.
**Done when:** a video call session runs from "Join now" to "The meeting has ended". The self tile is picture in picture. No mesh is visible. The console shows the result as for an ATS session.

### Tier 2 — Passive monitoring

**Milestone 3 — Passive windows.**
Add `passive_window` to the types, the registry, and `scorePassiveWindow` (Section 5.5). Apply the `passive` row of the presentation table. Update the mock: send 8 passive windows, apply the rules in Section 12.2 of the contract, and return `rolling_result`.
**Done when:** the call runs 8 windows back to back, with no visible prompt. Each passive upload carries an audio clip. A silent window returns HTTP 200 with the `no_speech_in_window` warning.

**Milestone 4 — The live console.**
Split the console into `InterviewConsole` and `CallConsole` (Section 5.3). Add `TrustTimeline`. Add the rolling verdict, with the `size` prop on `SignalVerdict`. Add `MIN_SLOTS_FOR_ROLLING_VERDICT`.
**Done when:** the trust timeline fills in window by window, in the second window. The rolling verdict appears after slot 2. The ATS console looks exactly as before.

### Tier 3 — The challenge

**Milestone 5 — The challenge flow.**
Add the `Challenge` types, `useRequestChallenge`, `ChallengePanel`, and `RequestChallengeButton`. Mark the challenge slot in `TrustTimeline`. Add `challenge_failed` to `FlagReasonCard`. Update the mock: pick the auto slot, add `POST /request-challenge`, replace the slot when `next_prompt` is built, and apply the challenge rule from Section 12.6 of the contract.
**Done when:** with no button press, a challenge banner appears at slot 4, 5, or 6. With a press at slot 2, the banner appears at slot 3. A second press returns `CHALLENGE_ALREADY_ISSUED`, and the console shows the message. A synthetic run ends with SYNTHETIC and `challenge_failed`.

**Milestone 6 — Rehearsal against the live backend.**
Set `VITE_USE_MOCK_API=false`. Run all four combinations: ATS or call, and webcam or file.
**Done when:** each of the four runs ends with the expected verdict. Run the full demo script (Section 7) two times, as Section 9 of `handoff.md` requires.

---

## 7. Demo script for the video call

1. On the launcher, select "Video call". Keep the synthetic switch off. Press Start.
2. In the call window, press "Join now". The call opens. The host tile is large. The candidate's own tile is small.
3. The presenter asks the candidate a normal question, for example: "Tell us about your last project." The candidate answers naturally.
4. On the console, point to the trust timeline as it fills. Point to the rolling verdict after slot 2: REAL.
5. The challenge banner appears. The candidate turns the head and says the phrase. The console marks the challenge as passed. The call ends with REAL.
6. Narrate the pitch: "The same API, the same SDK, now inside a conferencing product."
7. Start a second call. Turn the synthetic switch on. Press Start, then "Join now". The avatar clip plays as the candidate.
8. On the console, show that the passive windows look almost normal. A replayed face still moves and blinks.
9. Press "Request challenge". Say: "We ask for something a recording cannot know in advance."
10. The banner appears. The clip keeps talking. It does not turn or say the phrase. The console flips to SYNTHETIC with `challenge_failed`.

Press the button in step 9 only after slot 2. The rolling verdict is then visible before the flip. The auto challenge is the fallback if nobody presses the button.

---

## 8. Known risks

| Risk | Control |
|---|---|
| The captured MP4 audio is silent | Verify it in Section 4.2. Use the Web Audio fallback. |
| The voice model does not flag the clip | Check the clip with `check_file.py` before the demo. The challenge still flags a clip that does not respond. |
| The rolling verdict flips on one bad window | Show it only after `MIN_SLOTS_FOR_ROLLING_VERDICT` slots. |
| The operator presses the button during slot 8 | The backend returns `CHALLENGE_TOO_LATE`. The auto challenge already ran by slot 6. |
| The real candidate stays silent | A silent window gives a `null` voice score and a warning. It is not an error. Ask the candidate a question in step 3. |
| The loop point of the MP4 is visible | Use a clip of about 60 seconds. |
| A trust timeline colour breaks the verdict colour rule | Use bar height and neutral colours only (Section 3). |
| `shadcn add select` writes to the wrong folder | Apply the fix in Section 2.2 of `docs/frontend-progress.md`. |

---

## 9. Out of scope

Do not build these items tonight:
- Live captions.
- More than one challenge in a call.
- A real remote participant, or a second webcam.
- Chat, screen share, or a participant list.
- An "End call" control on the console. The call ends after slot 8.
- Working microphone, camera, or leave controls in the call.

---

*This document extends `docs/frontend-handoff.md` for the video call scenario. `docs/ui-contract.md` Revision 2 is the source of truth for every request and response. Project: Sapien. Built for Origin Weekend, Fall 2026.*
