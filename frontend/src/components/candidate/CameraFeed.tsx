import { useEffect, type RefObject } from "react";
import { cn } from "@/lib/utils";

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
  className = "w-[480px] rounded-xl",
}: {
  stream: MediaStream | null;
  fileUrl?: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Display size only. The element still decodes at the source resolution. */
  className?: string;
}) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // The webcam stays muted: playing its own microphone causes echo. The
    // file plays with sound, because the recorder captures the clip's
    // playback (`useVideoSource`).
    video.muted = !fileUrl;

    // Assigning srcObject or src restarts the element's load, even with the
    // same value, and aborts a pending play(). Assign only on a change.
    if (fileUrl) {
      if (video.srcObject) video.srcObject = null;
      if (video.getAttribute("src") !== fileUrl) {
        video.src = fileUrl;
      }
      video.loop = true;
      // useVideoSource starts playback, after the candidate's button press.
    } else {
      if (video.hasAttribute("src")) video.removeAttribute("src");
      if (video.srcObject !== stream) video.srcObject = stream;
    }
  }, [stream, fileUrl, videoRef]);

  return (
    <video
      ref={videoRef}
      autoPlay={!fileUrl}
      muted={!fileUrl}
      playsInline
      className={cn("aspect-[4/3] bg-slate-900 object-cover", className)}
    />
  );
}
