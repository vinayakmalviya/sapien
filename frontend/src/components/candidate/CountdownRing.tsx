import { useEffect, useState } from "react";

const RADIUS = 28;
const STROKE_WIDTH = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Update the ring 10 times each second. Smooth enough, cheap enough. */
const TICK_MS = 100;

/**
 * Shows the time left in the recording window. Section 10.1 of
 * frontend-handoff.md. Purely visual — has no effect on the score.
 */
export function CountdownRing({
  durationMs,
  isActive,
}: {
  durationMs: number;
  isActive: boolean;
}) {
  const [remainingRatio, setRemainingRatio] = useState(1);

  useEffect(() => {
    if (!isActive || durationMs <= 0) {
      setRemainingRatio(1);
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.max(0, 1 - elapsed / durationMs);
      setRemainingRatio(ratio);
      if (ratio <= 0) clearInterval(interval);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [isActive, durationMs]);

  const offset = CIRCUMFERENCE * (1 - remainingRatio);

  return (
    <svg width={64} height={64} className="-rotate-90" aria-hidden="true">
      <circle
        cx={32}
        cy={32}
        r={RADIUS}
        strokeWidth={STROKE_WIDTH}
        className="fill-none stroke-slate-200"
      />
      <circle
        cx={32}
        cy={32}
        r={RADIUS}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        className="fill-none stroke-primary transition-[stroke-dashoffset] duration-100 ease-linear"
      />
    </svg>
  );
}
