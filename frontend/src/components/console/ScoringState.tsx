/**
 * Shows a progress state while the backend runs a model. Section 10.2 of
 * frontend-handoff.md: "A visible wait is better than a frozen panel."
 * Shown while `session-status` reports `status: "scoring"`.
 *
 * The exact duration of model inference is unknown to the frontend, so
 * this is an indeterminate animation, not a determinate `Progress` bar
 * tied to a fake percentage.
 */
export function ScoringState() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-4">
      <p className="text-base text-neutral-300">
        Scoring the last prompt — running detection models…
      </p>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div className="absolute inset-y-0 w-1/3 animate-[scoring-sweep_1.2s_ease-in-out_infinite] rounded-full bg-brand" />
      </div>
    </div>
  );
}
