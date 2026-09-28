import { useRequestChallenge } from "@/api/queries";
import type {
  Challenge,
  CompletedPromptSummary,
  SessionStatus,
} from "@/api/types";
import { Button } from "@/components/ui/button";

const SOURCE_LABELS = { auto: "auto", operator: "operator" } as const;

function describeChallenge(challenge: Challenge | null): string {
  if (!challenge) return "No challenge information yet.";
  switch (challenge.state) {
    case "none":
      return challenge.auto_index !== null
        ? `Auto challenge at window ${challenge.auto_index}`
        : "No challenge scheduled";
    case "queued":
      return `Challenge queued — arrives after the current window (window ${challenge.prompt_index})`;
    case "active":
      return `Challenge in progress — window ${challenge.prompt_index}`;
    case "passed":
      return `Challenge passed — window ${challenge.prompt_index}`;
    case "failed":
      return `Challenge failed — window ${challenge.prompt_index}`;
  }
}

/**
 * The challenge state, its source, and the operator's request button.
 * Section 5.3 of video-call-scenario.md.
 */
export function ChallengePanel({
  sessionId,
  challenge,
  status,
  result,
  decisionThreshold,
  voiceRealThreshold,
}: {
  sessionId: string;
  challenge: Challenge | null;
  status: SessionStatus;
  result: CompletedPromptSummary | null;
  decisionThreshold: number;
  voiceRealThreshold: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-neutral-100">Challenge</p>
        <p className="text-base text-neutral-300">
          {describeChallenge(challenge)}
        </p>
        {challenge?.source ? (
          <p className="text-base text-neutral-500">
            source: {SOURCE_LABELS[challenge.source]}
          </p>
        ) : null}
        {result ? (
          <>
            <div className="mt-3 grid gap-2 text-sm text-neutral-300 sm:grid-cols-3">
              <ChallengeCheck
                label="Head movement"
                value={result.liveness_score >= decisionThreshold}
                detail={result.liveness_score.toFixed(2)}
              />
              <ChallengeCheck label="Phrase match" value={result.word_match} />
              <ChallengeCheck
                label="Voice authenticity"
                value={
                  result.voice_score === null
                    ? null
                    : result.voice_score >= voiceRealThreshold
                }
                detail={result.voice_score?.toFixed(2)}
              />
            </div>
            {result.expected_phrase ? (
              <div className="mt-3 space-y-1 rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm">
                <p className="text-neutral-500">
                  Expected: {result.expected_phrase}
                </p>
                <p className="text-neutral-300">
                  Heard: {result.transcript?.trim() || "No phrase detected"}
                </p>
              </div>
            ) : null}
          </>
        ) : null}
        <p className="mt-2 max-w-2xl text-xs text-neutral-500">
          Every window checks movement and voice authenticity. Only the
          challenge also checks whether the requested phrase was spoken.
        </p>
      </div>
      <RequestChallengeButton
        sessionId={sessionId}
        challenge={challenge}
        status={status}
      />
    </div>
  );
}

function ChallengeCheck({
  label,
  value,
  detail,
}: {
  label: string;
  value: boolean | null;
  detail?: string;
}) {
  const status = value === null ? "not measured" : value ? "passed" : "failed";
  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2">
      <p className="text-neutral-500">{label}</p>
      <p className="font-medium text-neutral-100">
        {status}
        {detail ? ` · ${detail}` : ""}
      </p>
    </div>
  );
}

function RequestChallengeButton({
  sessionId,
  challenge,
  status,
}: {
  sessionId: string;
  challenge: Challenge | null;
  status: SessionStatus;
}) {
  const requestChallenge = useRequestChallenge(sessionId);
  const canRequest =
    challenge?.state === "none" && status !== "complete" && status !== "error";

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        size="lg"
        variant="outline"
        className="border-neutral-600 bg-neutral-950 text-base text-neutral-100 hover:bg-neutral-800"
        onClick={() => requestChallenge.mutate()}
        disabled={!canRequest || requestChallenge.isPending}
      >
        {requestChallenge.isPending ? "Requesting…" : "Request challenge"}
      </Button>
      {requestChallenge.isError ? (
        <p className="max-w-xs text-base text-red-400">
          {requestChallenge.error.message}
        </p>
      ) : null}
    </div>
  );
}
