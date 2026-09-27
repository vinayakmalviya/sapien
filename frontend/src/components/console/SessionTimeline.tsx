import type {
  CompletedPromptSummary,
  EnabledModules,
  PromptType,
  SessionStatus,
} from "@/api/types";
import { Badge } from "@/components/ui/badge";

/**
 * Readable labels for display only. The frontend still selects behaviour
 * by `prompt.type`, never by this label or by `instruction`. Section 13 of
 * frontend-handoff.md.
 */
const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
  head_turn_right: "Turn head right",
  head_turn_left: "Turn head left",
  speak_word: "Speak word",
  blink: "Blink",
};

interface TimelineStep {
  index: number;
  completed: CompletedPromptSummary | null;
  isCurrent: boolean;
}

/**
 * Shows the state of each of the three prompts. Section 10.2 of
 * frontend-handoff.md.
 */
export function SessionTimeline({
  totalPrompts,
  currentPromptIndex,
  completedPrompts,
  status,
  enabledModules,
}: {
  totalPrompts: number;
  currentPromptIndex: number;
  completedPrompts: CompletedPromptSummary[];
  status: SessionStatus;
  enabledModules: EnabledModules;
}) {
  const steps: TimelineStep[] = Array.from(
    { length: totalPrompts },
    (_, i) => {
      const index = i + 1;
      const completed = completedPrompts.find((p) => p.index === index) ?? null;
      const isCurrent =
        !completed &&
        index === currentPromptIndex &&
        (status === "in_progress" || status === "scoring");
      return { index, completed, isCurrent };
    },
  );

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step) => (
        <div
          key={step.index}
          className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <StepBadge step={step} />
            <span className="text-base text-neutral-200">
              {step.completed
                ? PROMPT_TYPE_LABELS[step.completed.type]
                : `Prompt ${step.index}`}
            </span>
          </div>
          {step.completed ? (
            <div className="flex items-center gap-4 text-base text-neutral-400">
              {enabledModules.liveness ? (
                <span>liveness {step.completed.liveness_score.toFixed(2)}</span>
              ) : null}
              {enabledModules.frame ? (
                <span>frame {step.completed.frame_score.toFixed(2)}</span>
              ) : null}
              {enabledModules.voice ? (
                <span>
                  voice{" "}
                  {step.completed.voice_score === null
                    ? "—"
                    : step.completed.voice_score.toFixed(2)}
                </span>
              ) : null}
              <span>{step.completed.latency_ms}ms</span>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StepBadge({ step }: { step: TimelineStep }) {
  if (step.completed) {
    return (
      <Badge className="bg-brand text-brand-foreground">{step.index}</Badge>
    );
  }
  if (step.isCurrent) {
    return (
      <Badge variant="outline" className="border-neutral-500 text-neutral-200">
        {step.index}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-neutral-800 text-neutral-600">
      {step.index}
    </Badge>
  );
}
