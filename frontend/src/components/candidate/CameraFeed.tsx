import { useEffect, type RefObject } from "react";

/**
 * Shows the video element. Milestone 3 adds `LandmarkOverlay` on top of it.
 * The same `videoRef` is later shared with `useFaceLandmarker` and
 * `useFrameSampler` — MediaPipe and the frame sampler both accept any
 * `<video>` element.
 */
export function CameraFeed({
  stream,
  videoRef,
}: {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoRef]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="aspect-[4/3] w-[480px] rounded-xl bg-slate-900 object-cover"
    />
  );
}
