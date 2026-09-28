import type { MotionDetail, YawDirection } from "@/api/types";
import {
  EYE_BLINK_ACTIVE_THRESHOLD,
  FULL_SCORE_BLINK_COUNT,
  FULL_SCORE_JAW_OPEN_VARIANCE,
  FULL_SCORE_YAW_DEGREES,
  PASSIVE_FULL_SCORE_BLINK_COUNT,
  PASSIVE_BLINK_WEIGHT,
  PASSIVE_MIN_YAW_STDDEV_DEG,
  PASSIVE_MOTION_WEIGHT,
  PASSIVE_NO_BLINK_FACTOR,
  PASSIVE_PRESENCE_WEIGHT,
  TRACKING_LOSS_PENALTY_FACTOR,
  TRACKING_LOSS_PENALTY_THRESHOLD,
} from "./constants";
import type { LandmarkWindow } from "./types";

export interface ScoreResult {
  score: number;
  detail: MotionDetail;
}

/** Section 8 of frontend-handoff.md: one scorer function for each prompt type. */
export type Scorer = (window: LandmarkWindow) => ScoreResult;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredDiffs = values.map((value) => (value - mean) ** 2);
  return squaredDiffs.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Section 8: "Lower the score when tracking_loss_ratio is above 0.25." */
function applyTrackingLossPenalty(
  score: number,
  trackingLossRatio: number,
): number {
  if (trackingLossRatio > TRACKING_LOSS_PENALTY_THRESHOLD) {
    return score * TRACKING_LOSS_PENALTY_FACTOR;
  }
  return score;
}

/** Every scorer fills all seven `motion_detail` fields. Section 5.2 of ui-contract.md. */
function baseDetail(window: LandmarkWindow): MotionDetail {
  return {
    yaw_peak_degrees: 0,
    yaw_direction: "none",
    nose_dx_normalized: 0,
    jaw_open_variance: 0,
    blink_count: 0,
    frames_analyzed: window.framesAnalyzed,
    tracking_loss_ratio: Number(window.trackingLossRatio.toFixed(3)),
  };
}

/** Counts rising edges over `threshold` — one blink is one crossing, not every frame above it. */
function countRisingEdges(values: number[], threshold: number): number {
  let count = 0;
  let wasAbove = false;
  for (const value of values) {
    const isAbove = value >= threshold;
    if (isAbove && !wasAbove) count += 1;
    wasAbove = isAbove;
  }
  return count;
}

function scoreHeadTurn(
  window: LandmarkWindow,
  _direction: "right" | "left",
): ScoreResult {
  const yawValues = window.samples.map((sample) => sample.yawDegrees);
  const signedPeak = yawValues.reduce(
    (peak, value) => (Math.abs(value) > Math.abs(peak) ? value : peak),
    0,
  );
  const peakMagnitude = Math.abs(signedPeak);

  let yawDirection: YawDirection = "none";
  if (Math.abs(signedPeak) > 1) {
    yawDirection = signedPeak > 0 ? "right" : "left";
  }

  const lastNose = window.samples.at(-1)?.noseDxNormalized ?? 0;

  const rawScore = clamp01(peakMagnitude / FULL_SCORE_YAW_DEGREES);
  const score = applyTrackingLossPenalty(rawScore, window.trackingLossRatio);

  return {
    score,
    detail: {
      ...baseDetail(window),
      yaw_peak_degrees: Number(signedPeak.toFixed(1)),
      yaw_direction: yawDirection,
      nose_dx_normalized: Number(lastNose.toFixed(3)),
    },
  };
}

/** Reads the peak positive yaw angle. Full score at 18 degrees. */
export const scoreHeadTurnRight: Scorer = (window) =>
  scoreHeadTurn(window, "right");

/** Reads the peak negative yaw angle. Full score at 18 degrees. */
export const scoreHeadTurnLeft: Scorer = (window) =>
  scoreHeadTurn(window, "left");

/** Reads the variance of `jawOpen`. Full score at a variance of 0.01. */
export const scoreSpeakWord: Scorer = (window) => {
  const jawValues = window.samples.map((sample) => sample.jawOpen);
  const jawOpenVariance = variance(jawValues);

  const rawScore = clamp01(jawOpenVariance / FULL_SCORE_JAW_OPEN_VARIANCE);
  const score = applyTrackingLossPenalty(rawScore, window.trackingLossRatio);

  return {
    score,
    detail: {
      ...baseDetail(window),
      jaw_open_variance: Number(jawOpenVariance.toFixed(4)),
    },
  };
};

function countBlinks(window: LandmarkWindow): number {
  const leftBlinkCount = countRisingEdges(
    window.samples.map((sample) => sample.eyeBlinkLeft),
    EYE_BLINK_ACTIVE_THRESHOLD,
  );
  const rightBlinkCount = countRisingEdges(
    window.samples.map((sample) => sample.eyeBlinkRight),
    EYE_BLINK_ACTIVE_THRESHOLD,
  );
  // A real blink closes both eyes. Head angle can foreshorten one eye's
  // signal more than the other's, so take the more confident (higher) count.
  return Math.max(leftBlinkCount, rightBlinkCount);
}

/** Counts the eyeBlink peaks over the threshold. Full score at 2 blinks. */
export const scoreBlink: Scorer = (window) => {
  const blinkCount = countBlinks(window);

  const rawScore = clamp01(blinkCount / FULL_SCORE_BLINK_COUNT);
  const score = applyTrackingLossPenalty(rawScore, window.trackingLossRatio);

  return {
    score,
    detail: {
      ...baseDetail(window),
      blink_count: blinkCount,
    },
  };
};

/**
 * A 5-second window of an ordinary call. Section 5.5 of
 * video-call-scenario.md. A frozen feed, a static photo, or an absent face
 * fails. A replayed video of a real person passes — the challenge exists
 * for that case.
 *
 * Face presence carries most of the score because a real caller can sit still.
 * Motion and blinking add smaller bonuses. Tracking loss scales the result.
 */
export const scorePassiveWindow: Scorer = (window) => {
  const presence = clamp01(1 - window.trackingLossRatio);

  const yawValues = window.samples.map((sample) => sample.yawDegrees);
  const yawStdDev = Math.sqrt(variance(yawValues));
  const motionFactor = clamp01(yawStdDev / PASSIVE_MIN_YAW_STDDEV_DEG);

  const blinkCount = countBlinks(window);
  const blinkFactor =
    blinkCount >= PASSIVE_FULL_SCORE_BLINK_COUNT ? 1 : PASSIVE_NO_BLINK_FACTOR;

  const score =
    presence *
    (PASSIVE_PRESENCE_WEIGHT +
      motionFactor * PASSIVE_MOTION_WEIGHT +
      blinkFactor * PASSIVE_BLINK_WEIGHT);

  const signedPeak = yawValues.reduce(
    (peak, value) => (Math.abs(value) > Math.abs(peak) ? value : peak),
    0,
  );
  let yawDirection: YawDirection = "none";
  if (Math.abs(signedPeak) > 1) {
    yawDirection = signedPeak > 0 ? "right" : "left";
  }
  const lastNose = window.samples.at(-1)?.noseDxNormalized ?? 0;
  const jawOpenVariance = variance(window.samples.map((sample) => sample.jawOpen));

  return {
    score,
    detail: {
      ...baseDetail(window),
      yaw_peak_degrees: Number(signedPeak.toFixed(1)),
      yaw_direction: yawDirection,
      nose_dx_normalized: Number(lastNose.toFixed(3)),
      jaw_open_variance: Number(jawOpenVariance.toFixed(4)),
      blink_count: blinkCount,
    },
  };
};
