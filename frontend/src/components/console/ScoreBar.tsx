export interface ScoreBarMarker {
  /** 0.0 to 1.0, from the API response's `thresholds` field. Never a frontend constant. */
  value: number;
  label: string;
}

/**
 * Shows one component score and its threshold marker on the track.
 *
 * Section 10.2 of frontend-handoff.md: the marker shows the reason for the
 * verdict — a frame score of 0.09 appears below a line at 0.15. Reads the
 * threshold from the API response (`markers`), never from frontend code.
 * Section 7.2 of ui-contract.md.
 *
 * The fill colour is neutral on purpose. Section 9.1 of frontend-handoff.md
 * reserves emerald/red/amber for the verdict only — no other element,
 * including this one, may use them. A judge reads pass or fail from the
 * fill's position relative to the marker, not from a colour.
 */
export function ScoreBar({
  label,
  score,
  markers = [],
  weight,
  caption,
}: {
  label: string;
  /** null when the module is disabled. Section 7.1 of ui-contract.md. */
  score: number | null;
  markers?: ScoreBarMarker[];
  /** The active Decision Engine weight for this module, 0.0 to 1.0. */
  weight?: number | null;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-base">
        <span className="font-medium text-neutral-200">{label}</span>
        <span className="flex items-center gap-2 text-neutral-400">
          {typeof weight === "number" ? (
            <span className="text-base">weight {Math.round(weight * 100)}%</span>
          ) : null}
          <span className="font-mono text-lg text-neutral-100">
            {score === null ? "—" : score.toFixed(2)}
          </span>
        </span>
      </div>

      <div className="relative h-3 w-full rounded-full bg-neutral-800">
        {score !== null ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brand"
            style={{ width: `${Math.min(100, Math.max(0, score * 100))}%` }}
          />
        ) : null}
        {markers.map((marker) => (
          <div
            key={marker.label}
            className="absolute inset-y-0 w-px bg-neutral-100"
            style={{ left: `${Math.min(100, Math.max(0, marker.value * 100))}%` }}
            title={`${marker.label}: ${marker.value.toFixed(2)}`}
          />
        ))}
      </div>

      <div className="flex justify-between text-base text-neutral-500">
        <span>{caption ?? (score === null ? "Module disabled" : "\u00A0")}</span>
        {markers.map((marker) => (
          <span key={marker.label}>
            {marker.label} {marker.value.toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  );
}
