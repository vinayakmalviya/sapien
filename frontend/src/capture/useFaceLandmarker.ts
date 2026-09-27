import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  LANDMARK_SNAPSHOT_INTERVAL_MS,
  YAW_SIGN,
} from "@/scoring/constants";
import type { LandmarkSample, LandmarkWindow } from "@/scoring/types";

const WASM_BASE_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/face_landmarker.task";

/** Landmark index 1 is the nose tip. Section 6.1 of frontend-handoff.md. */
const NOSE_TIP_INDEX = 1;

export interface LandmarkSnapshot {
  faceDetected: boolean;
  yawDegrees: number;
  jawOpen: number;
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  noseDxNormalized: number;
  /** Consecutive frames with a detected face, right up to now. Drives calibration. */
  consecutiveGoodFrames: number;
}

const EMPTY_SNAPSHOT: LandmarkSnapshot = {
  faceDetected: false,
  yawDegrees: 0,
  jawOpen: 0,
  eyeBlinkLeft: 0,
  eyeBlinkRight: 0,
  noseDxNormalized: 0,
  consecutiveGoodFrames: 0,
};

function readBlendshape(result: FaceLandmarkerResult, name: string): number {
  const categories = result.faceBlendshapes?.[0]?.categories;
  return categories?.find((category) => category.categoryName === name)?.score ?? 0;
}

/**
 * Extract the yaw angle, in degrees, from a 4x4 facial transformation
 * matrix. MediaPipe stores the matrix as a flat, column-major array
 * (`data[column * 4 + row]`). Column 2 is the rotated Z (forward) axis;
 * its x and z components give the yaw. `YAW_SIGN` in scoring/constants.ts
 * corrects the sign if it does not match "positive = turn right" on the
 * actual capture rig.
 */
function yawDegreesFromMatrix(data: number[]): number {
  const forwardX = data[8];
  const forwardZ = data[10];
  const radians = Math.atan2(forwardX, forwardZ);
  return YAW_SIGN * ((radians * 180) / Math.PI);
}

async function createLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
  const baseOptions = {
    numFaces: 1,
    runningMode: "VIDEO" as const,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  };
  try {
    return await FaceLandmarker.createFromOptions(fileset, {
      ...baseOptions,
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
    });
  } catch {
    // The GPU delegate failed to start. Fall back to CPU. Section 6.1.
    return await FaceLandmarker.createFromOptions(fileset, {
      ...baseOptions,
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
    });
  }
}

/**
 * The MediaPipe loop. Owns a `requestAnimationFrame` loop that runs about
 * 30 times each second. The loop never sets React state — it writes every
 * result into a ref, and a snapshot is copied into state only
 * `LANDMARK_SNAPSHOT_HZ` times a second, for UI meters. Section 6.1 of
 * frontend-handoff.md.
 */
export function useFaceLandmarker(videoRef: RefObject<HTMLVideoElement | null>) {
  const [snapshot, setSnapshot] = useState<LandmarkSnapshot>(EMPTY_SNAPSHOT);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const latestRawLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastSnapshotAtRef = useRef(0);
  const noseBaselineRef = useRef<number | null>(null);
  const goodFrameStreakRef = useRef(0);

  const isRecordingRef = useRef(false);
  const sampleBufferRef = useRef<LandmarkSample[]>([]);
  const framesAnalyzedRef = useRef(0);
  const framesLostRef = useRef(0);

  // Load the model once. Independent of camera permission — this can (and
  // should) happen while the browser is still asking for the camera.
  useEffect(() => {
    let cancelled = false;
    createLandmarker()
      .then((landmarker) => {
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setIsReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "Failed to load the face landmarker.",
          );
        }
      });
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  // The detection loop.
  //
  // Runs once per real decoded video frame, via `requestVideoFrameCallback`
  // where the browser supports it. A live camera `MediaStream`'s
  // `currentTime` advances continuously with wall-clock time, not only when
  // a new frame decodes — a plain `requestAnimationFrame` loop keyed off
  // `currentTime` therefore re-runs detection on the same visual frame many
  // times each second (measured near 90-100/sec against a real webcam,
  // versus the ~30 real frames/sec a webcam delivers). `requestVideoFrameCallback`
  // fires exactly once per decoded frame and reports the true rate. Falls
  // back to the `currentTime` check on a browser without it (older Safari).
  useEffect(() => {
    if (!isReady) return;
    const video = videoRef.current;
    const supportsVideoFrameCallback =
      typeof video?.requestVideoFrameCallback === "function";

    let rafId: number | null = null;
    let vfcId: number | null = null;
    let cancelled = false;

    function processFrame() {
      const currentVideo = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!currentVideo || !landmarker || currentVideo.readyState < 2) return;

      const result = landmarker.detectForVideo(currentVideo, performance.now());
      const faceDetected = (result.faceLandmarks?.length ?? 0) > 0;

      let yawDegrees = 0;
      let jawOpen = 0;
      let eyeBlinkLeft = 0;
      let eyeBlinkRight = 0;
      let noseDxNormalized = 0;

      if (faceDetected) {
        const matrixData = result.facialTransformationMatrixes?.[0]?.data;
        if (matrixData) {
          yawDegrees = yawDegreesFromMatrix(matrixData);
        }
        jawOpen = readBlendshape(result, "jawOpen");
        eyeBlinkLeft = readBlendshape(result, "eyeBlinkLeft");
        eyeBlinkRight = readBlendshape(result, "eyeBlinkRight");

        const landmarks = result.faceLandmarks[0];
        latestRawLandmarksRef.current = landmarks;
        const noseX = landmarks[NOSE_TIP_INDEX]?.x ?? 0.5;
        if (noseBaselineRef.current === null) {
          noseBaselineRef.current = noseX;
        }
        noseDxNormalized = noseX - noseBaselineRef.current;

        goodFrameStreakRef.current += 1;
      } else {
        latestRawLandmarksRef.current = null;
        goodFrameStreakRef.current = 0;
      }

      if (isRecordingRef.current) {
        sampleBufferRef.current.push({
          t: performance.now(),
          faceDetected,
          yawDegrees,
          jawOpen,
          eyeBlinkLeft,
          eyeBlinkRight,
          noseDxNormalized,
        });
        framesAnalyzedRef.current += 1;
        if (!faceDetected) framesLostRef.current += 1;
      }

      const now = performance.now();
      if (now - lastSnapshotAtRef.current >= LANDMARK_SNAPSHOT_INTERVAL_MS) {
        lastSnapshotAtRef.current = now;
        setSnapshot({
          faceDetected,
          yawDegrees,
          jawOpen,
          eyeBlinkLeft,
          eyeBlinkRight,
          noseDxNormalized,
          consecutiveGoodFrames: goodFrameStreakRef.current,
        });
      }
    }

    if (supportsVideoFrameCallback && video) {
      const onVideoFrame: VideoFrameRequestCallback = () => {
        if (cancelled) return;
        processFrame();
        vfcId = video.requestVideoFrameCallback(onVideoFrame);
      };
      vfcId = video.requestVideoFrameCallback(onVideoFrame);
    } else {
      // Fallback: dedupe against currentTime. Coarser, but avoids
      // reprocessing on browsers without requestVideoFrameCallback.
      const loop = () => {
        rafId = requestAnimationFrame(loop);
        const currentVideo = videoRef.current;
        if (!currentVideo) return;
        if (currentVideo.currentTime === lastVideoTimeRef.current) return;
        lastVideoTimeRef.current = currentVideo.currentTime;
        processFrame();
      };
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (vfcId !== null && video) video.cancelVideoFrameCallback(vfcId);
    };
  }, [isReady, videoRef]);

  function beginRecording() {
    sampleBufferRef.current = [];
    framesAnalyzedRef.current = 0;
    framesLostRef.current = 0;
    isRecordingRef.current = true;
  }

  function endRecording(): LandmarkWindow {
    isRecordingRef.current = false;
    const framesAnalyzed = framesAnalyzedRef.current;
    return {
      samples: sampleBufferRef.current,
      framesAnalyzed,
      trackingLossRatio:
        framesAnalyzed > 0 ? framesLostRef.current / framesAnalyzed : 1,
    };
  }

  return {
    isReady,
    loadError,
    snapshot,
    rawLandmarksRef: latestRawLandmarksRef,
    beginRecording,
    endRecording,
  };
}
