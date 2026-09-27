/**
 * Shows the combined confidence value. Section 10.2 of frontend-handoff.md.
 *
 * Deliberately neutral, not verdict-coloured. `SignalVerdict` is the one
 * place the real/synthetic colour lives (Section 9.1) — this gauge shows
 * the same underlying number as a plain magnitude, with the decision
 * threshold marked from the API response, not a frontend constant.
 */
export function ConfidenceGauge({
  confidence,
  decisionThreshold,
}: {
  confidence: number;
  decisionThreshold: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-5xl font-bold tabular-nums text-neutral-100">
        {Math.round(confidence * 100)}%
      </p>
      <p className="text-base text-neutral-500">confidence</p>
      <div className="relative h-2 w-56 rounded-full bg-neutral-800">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand"
          style={{ width: `${Math.min(100, Math.max(0, confidence * 100))}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-neutral-100"
          style={{ left: `${decisionThreshold * 100}%` }}
          title={`decision threshold ${decisionThreshold.toFixed(2)}`}
        />
      </div>
    </div>
  );
}
