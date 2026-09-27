import { useEffect, useRef, type RefObject } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Draws the face mesh on a canvas above the video.
 *
 * This component has no effect on the result. It is the visible proof
 * that the client-side check is running. Section 10.1 of
 * frontend-handoff.md.
 *
 * Reads landmarks from a ref, not from React state or props that change
 * every frame — the same "no per-frame state" rule `useFaceLandmarker`
 * follows for its detection loop applies to drawing the mesh.
 */
export function LandmarkOverlay({
  videoRef,
  rawLandmarksRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  rawLandmarksRef: RefObject<NormalizedLandmark[] | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    // Narrowed once, outside the closure below — TS does not carry a
    // nullability narrowing for `canvas?.getContext(...)` into a nested
    // function declaration, so it is re-bound to a guaranteed-non-null name.
    const ctx: CanvasRenderingContext2D = context;

    const dotColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--brand-accent")
        .trim() || "#99582a";

    let rafId: number;

    function draw() {
      rafId = requestAnimationFrame(draw);
      const video = videoRef.current;
      if (!video || !canvas) return;

      const width = video.clientWidth;
      const height = video.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = rawLandmarksRef.current;
      if (!landmarks) return;

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = dotColor;
      for (const point of landmarks) {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [videoRef, rawLandmarksRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
