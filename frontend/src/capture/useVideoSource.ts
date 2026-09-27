import { useMediaStream, type MediaStreamStatus } from "./useMediaStream";

export type VideoSourceType = "webcam" | "file";

/**
 * The prepared MP4 clip of the synthetic candidate. Section 10 of
 * frontend-handoff.md suggested a screen recording; the file source
 * replaces that method. Drop the file at this exact path in `public/`.
 *
 * NOTE: no clip has been added to this repository yet. Until one is
 * added, the "file" source type will show a broken video and the
 * calibration state will never complete (there is no face to detect) —
 * this is expected, not a bug in this hook.
 */
export const SYNTHETIC_CLIP_URL = "/media/synthetic-candidate.mp4";

export interface VideoSource {
  sourceType: VideoSourceType;
  status: MediaStreamStatus;
  /** Set on the `<video>` element's `srcObject`. null for a file source. */
  stream: MediaStream | null;
  /** Set on the `<video>` element's `src`. null for a webcam source. */
  fileUrl: string | null;
  error: string | null;
  requestAccess: () => Promise<boolean>;
}

/**
 * Returns a `<video>` element source: the real candidate's webcam, or the
 * prepared MP4 clip of the synthetic candidate. Section 6.3 of
 * frontend-handoff.md.
 *
 * MediaPipe and the frame sampler accept any `<video>` element — both
 * source types run through the exact same `useFaceLandmarker` and
 * `useFrameSampler` code already built in Milestones 3 and 4. This hook's
 * only job is choosing what feeds the `<video>` element.
 */
export function useVideoSource(sourceType: VideoSourceType): VideoSource {
  const mediaStream = useMediaStream();

  if (sourceType === "file") {
    return {
      sourceType,
      status: "granted", // A file needs no camera permission.
      stream: null,
      fileUrl: SYNTHETIC_CLIP_URL,
      error: null,
      requestAccess: async () => true,
    };
  }

  return {
    sourceType,
    status: mediaStream.status,
    stream: mediaStream.stream,
    fileUrl: null,
    error: mediaStream.error,
    requestAccess: mediaStream.requestAccess,
  };
}
