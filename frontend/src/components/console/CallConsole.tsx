import type { SessionStatusResponse } from "@/api/types";
import { ChallengePanel } from "@/components/console/ChallengePanel";
import { ConfidenceGauge } from "@/components/console/ConfidenceGauge";
import { FinalResult } from "@/components/console/FinalResult";
import { SignalVerdict } from "@/components/console/SignalVerdict";
import { TrustTimeline } from "@/components/console/TrustTimeline";
import { Card, CardContent } from "@/components/ui/card";
import { MIN_SLOTS_FOR_ROLLING_VERDICT } from "@/scoring/constants";

/**
 * The console body for a `video_call` session. Section 5.3 of
 * video-call-scenario.md: rolling verdict, trust timeline, challenge
 * panel, then the final result once the call ends.
 */
export function CallConsole({
  sessionId,
  data,
}: {
  sessionId: string;
  data: SessionStatusResponse;
}) {
  const completedCount = data.completed_prompts.length;
  const rolling = data.rolling_result;
  const challengeResult =
    data.completed_prompts.find((prompt) => prompt.kind === "challenge") ?? null;
  const showsRollingVerdict =
    rolling !== null && completedCount >= MIN_SLOTS_FOR_ROLLING_VERDICT;

  return (
    <>
      {data.result ? null : (
        <Card className="border-neutral-800 bg-neutral-900 text-neutral-100">
          <CardContent className="flex min-h-36 flex-col items-center justify-center gap-6 py-6 sm:flex-row sm:justify-around">
            {showsRollingVerdict && rolling ? (
              <>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-base text-neutral-500">
                    Rolling verdict · {completedCount} of {data.total_prompts}{" "}
                    windows
                  </p>
                  <SignalVerdict signal={rolling.signal} size="compact" />
                </div>
                <ConfidenceGauge
                  confidence={rolling.confidence}
                  decisionThreshold={rolling.thresholds.decision}
                />
              </>
            ) : (
              <p className="text-xl text-neutral-400">
                Gathering signal… ({completedCount} of{" "}
                {MIN_SLOTS_FOR_ROLLING_VERDICT} windows)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <TrustTimeline
        totalSlots={data.total_prompts}
        currentSlot={data.current_prompt_index}
        completedPrompts={data.completed_prompts}
        status={data.status}
        decisionThreshold={rolling?.thresholds.decision ?? null}
        challenge={data.challenge}
      />

      <ChallengePanel
        sessionId={sessionId}
        challenge={data.challenge}
        status={data.status}
        result={challengeResult}
        decisionThreshold={
          data.result?.thresholds.decision ??
          rolling?.thresholds.decision ??
          0.5
        }
        voiceRealThreshold={
          data.result?.thresholds.voice_real ??
          rolling?.thresholds.voice_real ??
          0.65
        }
      />

      {data.result ? <FinalResult result={data.result} /> : null}
    </>
  );
}
