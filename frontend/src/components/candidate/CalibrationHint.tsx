import { GOOD_FRAMES_FOR_CALIBRATION } from "@/scoring/constants";

/**
 * Tells the candidate to centre the face. Shows progress toward the
 * "5 good frames" calibration check. Section 10.1 of frontend-handoff.md.
 */
export function CalibrationHint({ goodFrames }: { goodFrames: number }) {
  const progress = Math.min(
    100,
    (goodFrames / GOOD_FRAMES_FOR_CALIBRATION) * 100,
  );

  return (
    <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
      <p>Centre your face in the frame. Hold still.</p>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-brand transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
