import type { SessionStatusResponse } from "@/api/types";
import { FinalResult } from "@/components/console/FinalResult";
import { ScoringState } from "@/components/console/ScoringState";
import { SessionTimeline } from "@/components/console/SessionTimeline";

/** The console body for an `ats_interview` session. */
export function InterviewConsole({ data }: { data: SessionStatusResponse }) {
  return (
    <>
      <SessionTimeline
        totalPrompts={data.total_prompts}
        currentPromptIndex={data.current_prompt_index}
        completedPrompts={data.completed_prompts}
        status={data.status}
        enabledModules={data.enabled_modules}
      />

      {data.status === "scoring" ? <ScoringState /> : null}

      {data.result ? <FinalResult result={data.result} /> : null}
    </>
  );
}
