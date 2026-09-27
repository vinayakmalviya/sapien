import { useCallback, useEffect, useRef, useState } from "react";

/** Section 6.2 of frontend-handoff.md. The hook reports one of these four states. */
export type MediaStreamStatus = "idle" | "prompting" | "granted" | "denied";

/**
 * Some cameras (phone-as-webcam setups in particular) default to a very
 * high frame rate at low resolution — 100+ fps at 640x480 is common — when
 * no `frameRate` constraint is given. That wastes CPU in the landmarker
 * loop for no benefit: MediaPipe cannot detect a face any better at 100
 * frames a second than at 30. Cap it explicitly.
 */
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: 640,
  height: 480,
  frameRate: { ideal: 30, max: 30 },
};

/**
 * Camera and microphone access.
 *
 * Requests video at 640x480 and audio. Stops every track on unmount.
 * Call `requestAccess` from a user gesture (a button press), not from an
 * effect that runs on mount — Section 12 of frontend-handoff.md asks the
 * launcher to request the permission ahead of the candidate's session.
 */
export function useMediaStream() {
  const [status, setStatus] = useState<MediaStreamStatus>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const requestAccess = useCallback(async (): Promise<boolean> => {
    setStatus("prompting");
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: VIDEO_CONSTRAINTS,
        audio: true,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setStatus("granted");
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Camera and microphone access was denied.",
      );
      setStatus("denied");
      return false;
    }
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { status, stream, error, requestAccess };
}
