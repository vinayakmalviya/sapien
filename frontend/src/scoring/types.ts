/**
 * One measurement, taken on one video frame during a recording window.
 * `useFaceLandmarker` writes these into a buffer, never into React state.
 */
export interface LandmarkSample {
  /** `performance.now()` at the time of the sample. */
  t: number;
  faceDetected: boolean;
  /** Degrees. Positive means a turn to the right. From the transformation matrix. */
  yawDegrees: number;
  /** The `jawOpen` blendshape score, 0 to 1. */
  jawOpen: number;
  /** The `eyeBlinkLeft` blendshape score, 0 to 1. */
  eyeBlinkLeft: number;
  /** The `eyeBlinkRight` blendshape score, 0 to 1. */
  eyeBlinkRight: number;
  /** The nose tip's x position minus its position at calibration time. */
  noseDxNormalized: number;
}

/**
 * The full set of samples collected during one prompt's recording window.
 * `Scorer` functions in `scoring/scorers.ts` read this, and only this.
 */
export interface LandmarkWindow {
  samples: LandmarkSample[];
  /** The number of frames the landmarker processed during the window. */
  framesAnalyzed: number;
  /** The fraction of frames with no detected face. Above 0.25 is poor capture. */
  trackingLossRatio: number;
}
