import type { MotionDetail, YawDirection } from "@/api/types";
import {
  EYE_BLINK_ACTIVE_THRESHOLD,
  FULL_SCORE_BLINK_COUNT,
  FULL_SCORE_JAW_OPEN_VARIANCE,
  FULL_SCORE_YAW_DEGREES,
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
  direction: "right" | "left",
): ScoreResult {
  const yawValues = window.samples.map((sample) => sample.yawDegrees);
  // "right" reads the peak positive yaw. "left" reads the peak negative yaw
  // (the peak magnitude of a negative excursion). Section 8 table.
  const relevantValues =
    direction === "right" ? yawValues : yawValues.map((value) => -value);
  const peakMagnitude =
    relevantValues.length > 0 ? Math.max(0, ...relevantValues) : 0;
  const signedPeak = direction === "right" ? peakMagnitude : -peakMagnitude;

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

/** Counts the eyeBlink peaks over the threshold. Full score at 2 blinks. */
export const scoreBlink: Scorer = (window) => {
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
  const blinkCount = Math.max(leftBlinkCount, rightBlinkCount);

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
