import type {
  Challenge,
  CompletedPromptSummary,
  SessionStatus,
} from "@/api/types";
import { cn } from "@/lib/utils";

const BAR_AREA_HEIGHT_PX = 160;

/**
 * One column for each slot of a video call. Section 5.3 of
 * video-call-scenario.md.
 *
 * Bar height and neutral greys only. The verdict colours belong to
 * `SignalVerdict` alone, and the rose must not sit near the verdict.
 */
export function TrustTimeline({
  totalSlots,
  currentSlot,
  completedPrompts,
  status,
  decisionThreshold,
  challenge,
}: {
  totalSlots: number;
  currentSlot: number;
  completedPrompts: CompletedPromptSummary[];
  status: SessionStatus;
  /** From the rolling result. null before the first window completes. */
  decisionThreshold: number | null;
  challenge: Challenge | null;
}) {
  const challengeSlot =
    challenge && challenge.state !== "none" ? challenge.prompt_index : null;
  const isLive = status === "awaiting_start" || status === "in_progress";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-neutral-100">
          Trust timeline
        </p>
        <div className="flex items-center gap-4 text-base text-neutral-400">
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-sm bg-neutral-100" /> liveness
          </span>
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-sm bg-neutral-500" /> voice
          </span>
          {decisionThreshold !== null ? (
            <span className="flex items-center gap-2">
              <span className="h-px w-4 border-t border-dashed border-neutral-300" />
              decision {decisionThreshold.toFixed(2)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative">
        {decisionThreshold !== null ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-neutral-300"
            style={{
              // Label row (2rem) + column bottom padding and border (5px).
              bottom: `calc(${decisionThreshold * BAR_AREA_HEIGHT_PX}px + 2rem + 5px)`,
            }}
          />
        ) : null}
        <div className="grid grid-cols-8 gap-2">
          {Array.from({ length: totalSlots }, (_, i) => {
            const slot = i + 1;
            const completed =
              completedPrompts.find((prompt) => prompt.index === slot) ?? null;
            return (
              <SlotColumn
                key={slot}
                slot={slot}
                completed={completed}
                isCurrent={isLive && !completed && slot === currentSlot}
                isChallenge={slot === challengeSlot}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SlotColumn({
  slot,
  completed,
  isCurrent,
  isChallenge,
}: {
  slot: number;
  completed: CompletedPromptSummary | null;
  isCurrent: boolean;
  isChallenge: boolean;
}) {
  return (
    <div className="flex flex-col items-stretch gap-2">
      <div
        className={cn(
          "flex items-end justify-center gap-1.5 rounded-md border px-2 pb-1",
          isChallenge
            ? "border-2 border-neutral-100"
            : isCurrent
              ? "animate-pulse border-neutral-500"
              : "border-neutral-800",
        )}
        style={{ height: BAR_AREA_HEIGHT_PX + 8 }}
      >
        {completed ? (
          <>
            <Bar score={completed.liveness_score} className="bg-neutral-100" />
            {completed.voice_score === null ? (
              <span className="w-4 pb-1 text-center text-base text-neutral-500">
                —
              </span>
            ) : (
              <Bar score={completed.voice_score} className="bg-neutral-500" />
            )}
          </>
        ) : null}
      </div>
      <p className="h-6 text-center text-base text-neutral-400">
        {isChallenge ? "Challenge" : slot}
      </p>
    </div>
  );
}

function Bar({ score, className }: { score: number; className: string }) {
  return (
    <div
      className={cn("w-4 rounded-t-sm", className)}
      style={{ height: Math.max(2, score * BAR_AREA_HEIGHT_PX) }}
      title={score.toFixed(2)}
    />
  );
}
