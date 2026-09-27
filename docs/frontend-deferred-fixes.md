# Frontend Deferred Fixes — Sapien

**Status:** Living document. Add an entry here instead of fixing it immediately, when a fix is not urgent and the milestone work should keep moving.
**Audience:** Any developer or agent session with spare time before the demo.

Each entry states the symptom, the root cause, why it is safe to defer, and the exact fix to apply. An entry is closed by applying its fix and deleting the entry (or moving it to a "closed" section, if you would rather keep a record).

---

## Open

### 1. `landmarker_fps` reports ~90-100 instead of ~30

**Found in:** Milestone 3, during a live-camera check of the yaw sign.

**Symptom:** `capture_meta.landmarker_fps` in the `POST /submit-response` body reads around 93-103, instead of the expected ~30 (a webcam's usual frame rate).

**Root cause:** `useFaceLandmarker`'s detection loop is driven by `video.requestVideoFrameCallback`, which should fire once per real decoded camera frame. On the machine used for this check, it fires far more often than the camera's real frame rate. Two candidate explanations, not yet distinguished:
1. The camera driver ignores the `frameRate: { ideal: 30, max: 30 }` constraint already set in `useMediaStream.ts` (`src/capture/useMediaStream.ts`), and truly delivers 90-100 frames/sec at 640x480.
2. The browser's compositor re-presents the same decoded camera frame at display refresh rate, and counts each of those re-presentations as a new frame for `requestVideoFrameCallback` purposes — sensor noise means the pixel data is never bit-identical between composites, so the browser cannot coalesce them the way it would for static file playback.

**Why it is safe to defer:** every scorer in `scoring/scorers.ts` works on whatever samples arrive — peak yaw, jaw-open variance, and blink-edge counting are all rate-independent. `landmarker_fps` is a reporting field only; nothing in `docs/ui-contract.md` gates scoring or the Decision Engine on its value. No score, no threshold, and no verdict is affected.

**Why it is worth fixing eventually:**
- Running full face-mesh inference 3x more often than needed burns CPU and battery on the demo machine for no benefit, which raises the risk of thermal throttling during a live run.
- If Milestone 5 or 6 ever surfaces `capture_meta` facts on the operator console, a number like "93.5 fps" reads as a bug to a judge, even though it is harmless.

**Fix to apply:** in `src/capture/useFaceLandmarker.ts`, dedupe on the callback's own frame metadata instead of trusting the callback's firing rate. `requestVideoFrameCallback`'s second argument is a `VideoFrameCallbackMetadata` object with a `mediaTime` field — the actual presentation timestamp of the video frame. Skip `processFrame()` when `metadata.mediaTime` has not changed since the last callback:

```ts
const lastMediaTimeRef = useRef<number | null>(null);

const onVideoFrame: VideoFrameRequestCallback = (_now, metadata) => {
  if (cancelled) return;
  if (metadata.mediaTime !== lastMediaTimeRef.current) {
    lastMediaTimeRef.current = metadata.mediaTime;
    processFrame();
  }
  vfcId = video.requestVideoFrameCallback(onVideoFrame);
};
```

This filters out any duplicate-content callback regardless of which of the two root causes above is the real one, so it does not require diagnosing which one it is first.

**Verification after the fix:** repeat the live-camera check from Milestone 3 (start a session, real webcam, turn the head right on prompt 1, read `capture_meta.landmarker_fps` from the `POST /submit-response` request body in the Network tab). Expect a value close to 30, or close to whatever `navigator.mediaDevices.getUserMedia`'s track `getSettings().frameRate` reports for that camera.

---

## Closed

*(none yet)*

---

*Project: Sapien. Built for Origin Weekend, Fall 2026.*
