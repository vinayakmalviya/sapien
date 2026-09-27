import { useEffect, type RefObject } from "react";

/**
 * Shows the video element. Milestone 3 adds `LandmarkOverlay` on top of it.
 *
 * Accepts a live webcam `MediaStream` (`stream`) or a file clip's URL
 * (`fileUrl`) — Milestone 6's `useVideoSource` picks which one to pass.
 * `useFaceLandmarker` and `useFrameSampler` both read from the same
 * `videoRef` regardless of which source fills it.
 */
export function CameraFeed({
  stream,
  fileUrl,
  videoRef,
}: {
  stream: MediaStream | null;
  fileUrl?: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (fileUrl) {
      video.srcObject = null;
      if (video.getAttribute("src") !== fileUrl) {
        video.src = fileUrl;
      }
      video.loop = true;
      video.play().catch(() => {
        // Autoplay can be blocked before a user gesture. The candidate
        // has already pressed "Start interview" by the time this runs.
      });
    } else {
      video.removeAttribute("src");
      video.srcObject = stream;
    }
  }, [stream, fileUrl, videoRef]);

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
