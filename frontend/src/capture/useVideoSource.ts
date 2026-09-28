import { useCallback, useRef, useState, type RefObject } from "react";
import {
  useMediaStream,
  type AccessResult,
  type MediaStreamStatus,
} from "./useMediaStream";

export type VideoSourceType = "webcam" | "file";

/**
 * The prepared MP4 clip of the synthetic candidate. Section 10 of
 * frontend-handoff.md suggested a screen recording; the file source
 * replaces that method. Drop the file at this exact path in `public/`.
 * Section 4.1 of video-call-scenario.md lists what the clip needs.
 */
export const SYNTHETIC_CLIP_URL = "/media/synthetic-candidate.mp4";

export interface VideoSource {
  sourceType: VideoSourceType;
  status: MediaStreamStatus;
  /** Set on the `<video>` element's `srcObject`. null for a file source. */
  stream: MediaStream | null;
  /** Set on the `<video>` element's `src`. null for a webcam source. */
  fileUrl: string | null;
  /**
   * The stream the audio recorder reads. The webcam stream for a webcam
   * source; the clip's captured playback for a file source. null until
   * access is granted (webcam) or playback has started (file).
   */
  audioStream: MediaStream | null;
  error: string | null;
  requestAccess: () => Promise<AccessResult>;
}

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream };

/**
 * Captures the clip's audio. `captureStream()` can be called only once per
 * element in a useful way, and `createMediaElementSource()` only once ever,
 * so the caller keeps the result.
 */
function captureClipAudio(video: HTMLVideoElement): MediaStream | null {
  const captured = (video as CapturableVideo).captureStream?.();
  if (captured && captured.getAudioTracks().length > 0) return captured;

  // Fallback (Section 4.2 of video-call-scenario.md): route the element
  // through Web Audio. The element's output then goes only through the
  // graph, so it must also reach the speakers or the audience hears nothing.
  try {
    const context = new AudioContext();
    const source = context.createMediaElementSource(video);
    const destination = context.createMediaStreamDestination();
    source.connect(destination);
    source.connect(context.destination);
    return destination.stream;
  } catch {
    return null;
  }
}

/**
 * Returns a `<video>` element source: the real candidate's webcam, or the
 * prepared MP4 clip of the synthetic candidate. Section 6.3 of
 * frontend-handoff.md.
 *
 * MediaPipe and the frame sampler accept any `<video>` element — both
 * source types run through the exact same `useFaceLandmarker` and
 * `useFrameSampler` code. This hook chooses what feeds the `<video>`
 * element, and what feeds the audio recorder.
 */
export function useVideoSource(
  sourceType: VideoSourceType,
  videoRef: RefObject<HTMLVideoElement | null>,
): VideoSource {
  const mediaStream = useMediaStream();
  const [clipAudioStream, setClipAudioStream] = useState<MediaStream | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const clipAudioStreamRef = useRef<MediaStream | null>(null);

  // Runs after the candidate's button press, so the browser allows playback
  // with sound. The `<video>` is mounted by then: a file source reports
  // "granted", so PermissionGate renders CameraFeed as soon as the session
  // leaves `idle`.
  const requestClipPlayback = useCallback(async (): Promise<AccessResult> => {
    const fail = (message: string): AccessResult => {
      setClipError(message);
      return { granted: false, error: message };
    };
    const video = videoRef.current;
    if (!video) return fail("The video element is not ready.");
    try {
      await video.play();
    } catch (err) {
      return fail(
        err instanceof Error
          ? `The synthetic clip could not play: ${err.message}`
          : "The synthetic clip could not play.",
      );
    }
    if (!clipAudioStreamRef.current) {
      clipAudioStreamRef.current = captureClipAudio(video);
      setClipAudioStream(clipAudioStreamRef.current);
    }
    return { granted: true };
  }, [videoRef]);

  if (sourceType === "file") {
    return {
      sourceType,
      status: "granted", // A file needs no camera permission.
      stream: null,
      fileUrl: SYNTHETIC_CLIP_URL,
      audioStream: clipAudioStream,
      error: clipError,
      requestAccess: requestClipPlayback,
    };
  }

  return {
    sourceType,
    status: mediaStream.status,
    stream: mediaStream.stream,
    fileUrl: null,
    audioStream: mediaStream.stream,
    error: mediaStream.error,
    requestAccess: mediaStream.requestAccess,
  };
}
