/**
 * Every threshold and every limit for the capture and scoring layers.
 *
 * Section 4 of frontend-handoff.md: keep every number here, named, with a
 * comment for the reason. Do not write a number inline in a component.
 */

// ---------------------------------------------------------------------------
// Calibration. Section 7 of frontend-handoff.md.
// ---------------------------------------------------------------------------

/**
 * The candidate must hold a detected face for this many consecutive frames
 * before the first prompt appears. "Waits for 5 good frames."
 */
export const GOOD_FRAMES_FOR_CALIBRATION = 5;

// ---------------------------------------------------------------------------
// Landmarker publish rate. Section 6.1 of frontend-handoff.md.
// ---------------------------------------------------------------------------

/**
 * The `requestAnimationFrame` loop runs near 30 times a second, but the
 * hook only copies its result into React state this many times a second.
 * A state update on every frame would drop the frame rate.
 */
export const LANDMARK_SNAPSHOT_HZ = 8;
export const LANDMARK_SNAPSHOT_INTERVAL_MS = 1000 / LANDMARK_SNAPSHOT_HZ;

// ---------------------------------------------------------------------------
// Yaw sign.
// ---------------------------------------------------------------------------

/**
 * Flip this to -1 if a rightward head turn reports a negative yaw during
 * rehearsal. The sign of the yaw extracted from the facial transformation
 * matrix depends on the camera and the mirroring of the video element, and
 * was not verified against a live camera in this build session. Isolated
 * here so a rehearsal can fix it with a one-line change, with no other
 * file touched.
 */
export const YAW_SIGN: 1 | -1 = 1;

// ---------------------------------------------------------------------------
// head_turn_right / head_turn_left scoring. Section 8 table.
// ---------------------------------------------------------------------------

/** A peak yaw at or above this many degrees earns a full score of 1.0. */
export const FULL_SCORE_YAW_DEGREES = 18;

// ---------------------------------------------------------------------------
// speak_word scoring. Section 8 table.
// ---------------------------------------------------------------------------

/** A jawOpen variance at or above this value, over the window, earns a full score. */
export const FULL_SCORE_JAW_OPEN_VARIANCE = 0.01;

// ---------------------------------------------------------------------------
// blink scoring. Section 8 table.
// ---------------------------------------------------------------------------

/**
 * An eyeBlink blendshape score at or above this counts as "eye closed" for
 * one sample. ARKit-style blendshapes report near 0 when open, near 1 when
 * shut; 0.4 sits well clear of open-eye noise.
 */
export const EYE_BLINK_ACTIVE_THRESHOLD = 0.4;

/** Two blink events, counted as rising edges over the threshold, earn a full score. */
export const FULL_SCORE_BLINK_COUNT = 2;

// ---------------------------------------------------------------------------
// Capture quality penalty. Section 5.2 of ui-contract.md, Section 8 of
// frontend-handoff.md: "Lower the score when tracking_loss_ratio is above 0.25."
// ---------------------------------------------------------------------------

export const TRACKING_LOSS_PENALTY_THRESHOLD = 0.25;

/** Multiply the raw score by this factor when tracking loss is too high. */
export const TRACKING_LOSS_PENALTY_FACTOR = 0.5;

// ---------------------------------------------------------------------------
// Frame sampling. Section 6.4 of frontend-handoff.md, Section 5.3 and
// Section 10 of ui-contract.md.
// ---------------------------------------------------------------------------

/** The classifier resizes the image anyway. A wider frame only adds transfer time. */
export const FRAME_SAMPLE_WIDTH_PX = 640;

export const FRAME_SAMPLE_JPEG_QUALITY = 0.8;

/** Sample the first frame at this fraction of the recording window. */
export const FRAME_SAMPLE_TIMING_1 = 0.4;

/** Sample the second frame at this fraction of the recording window. */
export const FRAME_SAMPLE_TIMING_2 = 0.8;

// ---------------------------------------------------------------------------
// Audio recording. Section 6.5 of frontend-handoff.md, Section 10 of
// ui-contract.md.
// ---------------------------------------------------------------------------

/** The backend's documented limit. Keep clips well under this. */
export const AUDIO_MAX_DURATION_MS = 15000;
