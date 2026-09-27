# UI Contract — Sapien

**Status:** Ready for build.
**Audience:** The backend team, and any agent session that builds or changes the API layer.
**Relation to other documents:** This document extends Section 6 of `handoff.md`. Section 6 gives the shape of the API. This document gives the exact fields. If the two documents disagree, this document is correct.

This document follows **ASD-STE100 (Simplified Technical English)**. Each sentence gives one instruction or one fact.

---

## 1. Scope

This document defines every request and every response between the frontend and the API layer. The frontend calls no other service. The frontend calls no detection service directly.

The contract has four endpoints. Section 6 of `handoff.md` defines three of them. This document adds a fourth endpoint, `GET /session-status`. Section 4 of this document explains the reason for the fourth endpoint.

---

## 2. Transport rules

The API server runs at `http://localhost:8000`.
The frontend dev server runs at `http://localhost:5173`.
The API server must allow CORS requests from `http://localhost:5173`.
The API server must allow the `POST`, `GET`, and `OPTIONS` methods.
The API server must allow the `Content-Type` header.

All request bodies use JSON. All response bodies use JSON.
All timestamps use ISO 8601 format, in UTC. Example: `"2026-09-26T23:41:07Z"`.
All scores are floating point numbers, from `0.0` to `1.0`.
A score of `1.0` means "confidently real". A score of `0.0` means "confidently synthetic".

Do not use HTTPS for this build. The demo runs both surfaces on one machine. The browser accepts `http://localhost` as a secure context. The camera API works without a certificate.

---

## 3. Shared objects

### 3.1 The `Prompt` object

The API returns this object in `POST /start-session` and in `POST /submit-response`.

```json
{
  "index": 1,
  "of": 3,
  "type": "head_turn_right",
  "instruction": "Turn your head slightly to the right, then say 'orange'.",
  "expected_word": "orange",
  "duration_ms": 4000
}
```

| Field | Type | Required | Purpose |
|---|---|---|---|
| `index` | integer | yes | The position of this prompt. The first prompt has index `1`. |
| `of` | integer | yes | The total number of prompts in the session. Set this value to `3`. |
| `type` | string enum | yes | Selects the scorer function in the frontend. Section 3.2 lists the values. |
| `instruction` | string | yes | The text on the candidate's screen. |
| `expected_word` | string or null | yes | The word the candidate must speak. Set this field to `null` for a prompt with no spoken word. |
| `duration_ms` | integer | yes | The length of the recording window, in milliseconds. Use a value from `3000` to `6000`. |

The frontend must not read the `instruction` field to find the prompt type. The frontend reads the `type` field only. A writer can then change the wording of an instruction. That change does not break the frontend.

### 3.2 The `prompt.type` enum

| Value | What the candidate does | What the frontend measures |
|---|---|---|
| `head_turn_right` | The candidate turns the head to the right. | The head yaw angle. |
| `head_turn_left` | The candidate turns the head to the left. | The head yaw angle. |
| `speak_word` | The candidate speaks the expected word. | The jaw movement over time. |
| `blink` | The candidate blinks two times. | The number of blink events. |

The frontend supports these four values. The backend must not send another value. The frontend rejects an unknown value and shows an error state.

Use this prompt set for the demo session:

| Index | Type | Expected word |
|---|---|---|
| 1 | `head_turn_right` | `"orange"` |
| 2 | `speak_word` | `"harbour"` |
| 3 | `blink` | `null` |

### 3.3 The `EnabledModules` object

The operator can turn a detection module off. Section 8 explains the effect on the Decision Engine.

```json
{ "liveness": true, "frame": true, "voice": true }
```

All three fields are booleans. The default value of each field is `true`.

### 3.4 The error object

Every failed request returns this body. The HTTP status code is `400`, `404`, `409`, or `500`.

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "No session exists with this ID.",
    "detail": null
  }
}
```

| Field | Type | Purpose |
|---|---|---|
| `code` | string enum | A machine-readable code. Section 7 lists the values. |
| `message` | string | A short sentence for the operator's screen. |
| `detail` | object or null | Extra data for debug work. The frontend does not show this field. |

---

## 4. `POST /start-session`

This endpoint starts a session. This endpoint returns the session ID and the first prompt.

The operator surface calls this endpoint. The candidate surface does not call this endpoint.

### 4.1 Request body

```json
{
  "candidate_id": "demo-candidate-1",
  "enabled_modules": { "liveness": true, "frame": true, "voice": true }
}
```

| Field | Type | Required | Purpose |
|---|---|---|---|
| `candidate_id` | string | no | A label for the demo. The backend stores this value. The backend does not validate it. |
| `enabled_modules` | object | no | Section 3.3 defines this object. The backend uses all three modules if the field is absent. |

### 4.2 Response body — HTTP 200

```json
{
  "session_id": "8f14e45f-ea8d-4c1e-9b3a-6d2f1a7c5e90",
  "created_at": "2026-09-26T23:41:07Z",
  "total_prompts": 3,
  "enabled_modules": { "liveness": true, "frame": true, "voice": true },
  "prompt": {
    "index": 1,
    "of": 3,
    "type": "head_turn_right",
    "instruction": "Turn your head slightly to the right, then say 'orange'.",
    "expected_word": "orange",
    "duration_ms": 4000
  }
}
```

The `session_id` field holds a UUID version 4 string. The frontend puts this value in the route path. Both surfaces then read the same session.

---

## 5. `POST /submit-response`

This endpoint receives one prompt's response. This endpoint returns the next prompt, or it reports that the session is complete.

The candidate surface calls this endpoint one time for each prompt. The candidate surface calls this endpoint three times in a full session.

### 5.1 Request body

```json
{
  "session_id": "8f14e45f-ea8d-4c1e-9b3a-6d2f1a7c5e90",
  "prompt_index": 1,
  "prompt_type": "head_turn_right",
  "landmark_motion_score": 0.87,
  "motion_detail": {
    "yaw_peak_degrees": 21.4,
    "yaw_direction": "right",
    "nose_dx_normalized": 0.061,
    "jaw_open_variance": 0.0143,
    "blink_count": 0,
    "frames_analyzed": 118,
    "tracking_loss_ratio": 0.02
  },
  "frames": ["<base64>", "<base64>"],
  "audio_clip": "<base64>",
  "audio_mime": "audio/webm;codecs=opus",
  "capture_meta": {
    "duration_ms": 4120,
    "video_width": 640,
    "video_height": 480,
    "landmarker_fps": 27.5
  }
}
```

| Field | Type | Required | Purpose |
|---|---|---|---|
| `session_id` | string | yes | The session UUID. |
| `prompt_index` | integer | yes | The index of the answered prompt. |
| `prompt_type` | string enum | yes | The type of the answered prompt. The backend uses this value to select the rule set. |
| `landmark_motion_score` | float | yes | The frontend's own score, from `0.0` to `1.0`. |
| `motion_detail` | object | yes | The raw measurements. Section 5.2 defines the fields. |
| `frames` | array of string | yes | Sampled video frames. Section 5.3 defines the format. |
| `audio_clip` | string or null | yes | The recorded audio clip. Section 5.4 defines the format. |
| `audio_mime` | string | yes | The MIME type of the audio clip. |
| `capture_meta` | object | yes | Facts about the capture. The operator surface shows these facts. |

### 5.2 The `motion_detail` object

The frontend sends the raw measurements beside the score. The Liveness Scorer can then apply its own rule logic. A team member can change a backend rule without a frontend change.

| Field | Type | Meaning |
|---|---|---|
| `yaw_peak_degrees` | float | The largest head rotation in the window. A positive value means a turn to the right. |
| `yaw_direction` | string | The direction of the largest rotation. The values are `"right"`, `"left"`, and `"none"`. |
| `nose_dx_normalized` | float | The movement of the nose tip on the x axis. The value is a fraction of the frame width. |
| `jaw_open_variance` | float | The variance of the jaw-open value over the window. Speech raises this value. |
| `blink_count` | integer | The number of blink events in the window. |
| `frames_analyzed` | integer | The number of video frames the landmarker processed. |
| `tracking_loss_ratio` | float | The fraction of frames with no detected face. |

The frontend sends all seven fields for every prompt type. A field that does not apply to the prompt type holds a measured value anyway. The backend reads only the fields the rule set needs.

The `tracking_loss_ratio` field is a quality signal. A value above `0.25` means the capture is poor. The backend should lower the liveness score in that case.

### 5.3 The `frames` array

Each array item is a base64-encoded JPEG image.
Do not add a `data:image/jpeg;base64,` prefix. Send the bare base64 string.
The frontend sends 2 frames for each prompt. A full session therefore carries 6 frames.
Each frame is 640 pixels wide at most.
The frontend encodes each frame at JPEG quality `0.8`.
The backend must accept an array of 1 to 5 items.

The backend classifies every frame it receives. The backend averages the per-frame scores across the whole session, not across one prompt.

### 5.4 The `audio_clip` field

The field holds a base64-encoded audio clip. Do not add a data URI prefix.

The browser's `MediaRecorder` API produces WebM audio with the Opus codec. The browser does not produce WAV audio. The `audio_mime` field reports the exact type.

**Action for the backend team:** confirm that `librosa` loads WebM and Opus audio. `librosa` needs `ffmpeg` on the machine for this format. Report the result to the frontend owner. The frontend must encode WAV audio in the browser if the backend cannot read WebM. That change adds significant work. Confirm this item early.

The field holds `null` when the prompt has no expected word. The `blink` prompt sends `null`. The backend must accept `null` and must skip the voice checks for that prompt.

### 5.5 Response body — HTTP 200, session in progress

```json
{
  "session_id": "8f14e45f-ea8d-4c1e-9b3a-6d2f1a7c5e90",
  "status": "in_progress",
  "accepted": true,
  "prompt_result": {
    "index": 1,
    "liveness_score": 0.91,
    "frame_score": 0.88,
    "voice_score": 0.84,
    "word_match": true,
    "latency_ms": 940
  },
  "next_prompt": {
    "index": 2,
    "of": 3,
    "type": "speak_word",
    "instruction": "Say the word 'harbour' now.",
    "expected_word": "harbour",
    "duration_ms": 4000
  },
  "warnings": []
}
```

### 5.6 Response body — HTTP 200, session complete

```json
{
  "session_id": "8f14e45f-ea8d-4c1e-9b3a-6d2f1a7c5e90",
  "status": "complete",
  "accepted": true,
  "prompt_result": { "index": 3, "liveness_score": 0.93, "frame_score": 0.9, "voice_score": null, "word_match": null, "latency_ms": 610 },
  "next_prompt": null,
  "warnings": []
}
```

The `status` field holds `"in_progress"` or `"complete"`.
The `next_prompt` field holds a `Prompt` object, or it holds `null`. The field holds `null` when `status` is `"complete"`.
The `voice_score` field holds `null` when the request sends no audio clip.
The `word_match` field holds `null` when the prompt has no expected word.
The `warnings` array holds zero or more strings. The frontend shows each string to the operator. Use a warning for a non-fatal problem. Example: `"audio_clip_under_1_second"`.

The frontend calls `GET /get-result` after it receives `"complete"`.

---

## 6. `GET /session-status?session_id=<uuid>`

This endpoint reports the live state of a session. This endpoint is new. Section 6 of `handoff.md` does not list it.

**Why this endpoint is needed:** the operator surface runs in a second browser window. That window does not receive the responses from `POST /submit-response`. The candidate surface receives those responses. The operator surface therefore has no other way to show progress during the session. Without this endpoint the operator's panel stays empty, and then shows a final answer with no build-up. The demo loses its strongest moment.

The operator surface polls this endpoint one time each second. The endpoint must be cheap. Read the session state from memory. Do not run a model in this endpoint.

### 6.1 Response body — HTTP 200

```json
{
  "session_id": "8f14e45f-ea8d-4c1e-9b3a-6d2f1a7c5e90",
  "status": "in_progress",
  "current_prompt_index": 2,
  "total_prompts": 3,
  "enabled_modules": { "liveness": true, "frame": true, "voice": true },
  "completed_prompts": [
    {
      "index": 1,
      "type": "head_turn_right",
      "submitted_at": "2026-09-26T23:41:19Z",
      "liveness_score": 0.91,
      "frame_score": 0.88,
      "voice_score": 0.84,
      "word_match": true,
      "latency_ms": 940
    }
  ],
  "result": null
}
```

| Field | Type | Purpose |
|---|---|---|
| `status` | string enum | Section 6.2 lists the values. |
| `current_prompt_index` | integer | The prompt the candidate is answering now. |
| `completed_prompts` | array | One entry for each submitted prompt. The array grows during the session. |
| `result` | object or null | The full result object from Section 7. The field holds `null` until `status` is `"complete"`. |

The `result` field lets the operator surface finish with one poll. The operator surface does not need a second call. The frontend still calls `GET /get-result` as the documented path. Both routes must return the same data.

### 6.2 The `status` enum

| Value | Meaning |
|---|---|
| `awaiting_start` | The session exists. The candidate has not answered prompt 1. |
| `in_progress` | The candidate is answering the prompts. |
| `scoring` | The last prompt arrived. A detection service is still running. |
| `complete` | The Decision Engine produced a signal. |
| `error` | A detection service failed. The `result` field holds `null`. |

Set the status to `"scoring"` during model inference. The operator surface then shows a "scoring" state instead of a frozen panel.

---

## 7. `GET /get-result?session_id=<uuid>`

This endpoint returns the combined decision. Call this endpoint after the last prompt.

### 7.1 Response body — HTTP 200

```json
{
  "session_id": "8f14e45f-ea8d-4c1e-9b3a-6d2f1a7c5e90",
  "signal": "synthetic",
  "confidence": 0.41,
  "completed_at": "2026-09-26T23:41:52Z",
  "component_scores": {
    "liveness_scorer": 0.92,
    "frame_classifier": 0.09,
    "voice_detection": 0.22
  },
  "module_detail": {
    "liveness_scorer": { "enabled": true, "prompts_passed": 3, "prompts_total": 3 },
    "frame_classifier": { "enabled": true, "frames_scored": 6, "mean_real_probability": 0.09 },
    "voice_detection": { "enabled": true, "label": "deepfake", "word_match": true }
  },
  "thresholds": {
    "decision": 0.5,
    "frame_fake": 0.15,
    "voice_real": 0.35,
    "voice_fake": 0.65
  },
  "weights": { "liveness": 0.4, "frame": 0.35, "voice": 0.25 },
  "flag_reason": "frame_classifier_below_threshold"
}
```

| Field | Type | Purpose |
|---|---|---|
| `signal` | string enum | The values are `"real"` and `"synthetic"`. |
| `confidence` | float | The combined score from the Decision Engine. |
| `component_scores` | object | One score for each module. A disabled module holds `null`. |
| `module_detail` | object | Supporting facts. The operator surface shows these facts under each score. |
| `thresholds` | object | The active threshold values. Section 7.2 explains the reason. |
| `weights` | object | The active Decision Engine weights. |
| `flag_reason` | string or null | A machine-readable code. The field holds `null` when `signal` is `"real"`. |

### 7.2 Return the thresholds in the response

The operator surface draws a threshold marker on each score bar. The marker shows the reason for a failed check. A judge then sees that the frame score of `0.09` sits below the line at `0.15`.

The frontend must not hold these numbers in its own code. A backend change would then break the display, with no error. Send the active values in every result. The frontend reads them from the response.

Return the same `weights` object for the same reason. The operator surface shows the weight beside each score.

### 7.3 The `flag_reason` codes

Use one of these values. Add a new value only with a frontend change.

| Code | Meaning |
|---|---|
| `frame_classifier_below_threshold` | The mean real-probability of the frames is under the frame threshold. |
| `voice_detection_deepfake` | The voice score marks the clip as synthetic. |
| `voice_detection_uncertain` | The voice score falls between the two voice thresholds. |
| `liveness_timing_mismatch` | The motion did not match the prompt inside the time window. |
| `liveness_no_face_detected` | The tracking loss ratio was too high. |
| `word_mismatch` | The voice score passed. The spoken word did not match the expected word. |
| `multiple_signals_failed` | Two or more modules failed. |

Section 15.5 of `handoff.md` defines the word-match rule. The word-match result is not a fourth weighted score. Use it to set `flag_reason` only.

---

## 8. Disabled modules and the Decision Engine

The operator can turn a module off. Section 3.3 defines the request field.

**The Decision Engine must renormalize its weights over the enabled modules.** The fixed weights in Section 7 of `handoff.md` add up to `1.0`. A disabled voice module removes `0.25` of the possible total. A real candidate would then score `0.75` at most. A session with two disabled modules could never reach the `0.5` threshold. Every candidate would read as synthetic.

Divide each active weight by the sum of the active weights. Example: the voice module is off. The liveness weight becomes `0.4 / 0.75 = 0.533`. The frame weight becomes `0.35 / 0.75 = 0.467`.

Return the renormalized values in the `weights` field of the result. Set the `component_scores` entry of a disabled module to `null`. Set the `enabled` field of that module to `false` in `module_detail`.

---

## 9. Error codes

| Code | HTTP status | When the backend returns it |
|---|---|---|
| `SESSION_NOT_FOUND` | 404 | No session holds this ID. |
| `SESSION_ALREADY_COMPLETE` | 409 | The session received all prompts already. |
| `PROMPT_OUT_OF_ORDER` | 409 | The `prompt_index` is not the expected index. |
| `RESULT_NOT_READY` | 409 | The session is not complete. The frontend must poll again. |
| `AUDIO_TOO_SHORT` | 400 | The clip holds under 1 second of speech. |
| `AUDIO_DECODE_FAILED` | 400 | The backend could not read the audio format. |
| `FRAME_DECODE_FAILED` | 400 | The backend could not read a frame. |
| `MODEL_UNAVAILABLE` | 500 | A detection model did not load. |
| `VALIDATION_ERROR` | 400 | A required field is absent or holds a wrong type. |

The frontend retries a `409 RESULT_NOT_READY` response. The frontend does not retry any other error.

---

## 10. Limits

| Item | Limit | Reason |
|---|---|---|
| Frames for each request | 5 | Section 4.2 of `handoff.md` sets the session budget. |
| Frame width | 640 pixels | The classifier resizes the image anyway. A larger frame only adds transfer time. |
| Audio clip length | 15 seconds | Section 15.1 of `handoff.md` reports the latency at this length. |
| Request body size | 8 MB | Base64 encoding adds about 33% to the byte count. Raise the FastAPI limit if needed. |
| Session lifetime | 1 hour | An in-memory dictionary is enough. Do not build a database. |

---

## 11. Checklist for the backend team

Complete these items in this order. The frontend can start after item 1.

1. Return the four endpoints with stub data. Use the exact field names in this document.
2. Add `type`, `expected_word`, and `duration_ms` to the `Prompt` object.
3. Add the `GET /session-status` endpoint. Read from memory only.
4. Return `thresholds` and `weights` in the result body.
5. Confirm that the backend reads WebM and Opus audio. Report the result.
6. Renormalize the Decision Engine weights over the enabled modules.
7. Replace each stub score with a real score, one module at a time.

---

*Project: Sapien. Built for Origin Weekend, Fall 2026.*
