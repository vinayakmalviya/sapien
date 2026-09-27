import { useCallback, useRef, type RefObject } from "react";
import {
  FRAME_SAMPLE_JPEG_QUALITY,
  FRAME_SAMPLE_WIDTH_PX,
} from "@/scoring/constants";

/**
 * Draws the current video frame onto a canvas and returns a base64 JPEG
 * string. Section 6.4 of frontend-handoff.md.
 *
 * The same hook works for a webcam `<video>` element or a file source
 * (Milestone 6's `useVideoSource`) — both are `<video>` elements, and this
 * hook only ever reads from one.
 */
export function useFrameSampler(videoRef: RefObject<HTMLVideoElement | null>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return null;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;

    const scale = FRAME_SAMPLE_WIDTH_PX / video.videoWidth;
    canvas.width = FRAME_SAMPLE_WIDTH_PX;
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", FRAME_SAMPLE_JPEG_QUALITY);
    // Remove the "data:image/jpeg;base64," prefix. Section 5.3 of
    // ui-contract.md: send the bare base64 string.
    const commaIndex = dataUrl.indexOf(",");
    return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  }, [videoRef]);

  return { captureFrame };
}
