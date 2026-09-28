import type { FlagReasonCode } from "@/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Section 7.3 of ui-contract.md — one sentence for each code. */
const FLAG_REASON_SENTENCES: Record<FlagReasonCode, string> = {
  frame_classifier_below_threshold:
    "The mean real-probability of the sampled frames fell below the frame threshold.",
  voice_detection_deepfake: "The voice score marked the audio clip as synthetic.",
  voice_detection_uncertain:
    "The voice score fell between the real threshold and the fake threshold.",
  liveness_timing_mismatch:
    "The motion did not match the prompt inside the recording window.",
  liveness_no_face_detected:
    "The tracking loss ratio was too high — the face was lost too often.",
  word_mismatch:
    "The voice score passed, but the spoken word did not match the expected word.",
  challenge_failed:
    "The head movement or requested phrase did not pass the call challenge. See the challenge breakdown above.",
  multiple_signals_failed: "Two or more detection modules failed.",
};

/**
 * Shows the `flag_reason` code as a readable sentence. Section 10.2 of
 * frontend-handoff.md. Shows the raw code beside the sentence — a judge
 * may ask for the exact value.
 */
export function FlagReasonCard({
  flagReason,
  failureReasons,
}: {
  flagReason: FlagReasonCode | null;
  failureReasons?: FlagReasonCode[];
}) {
  if (!flagReason) return null;

  return (
    <Card className="border-neutral-800 bg-neutral-900 text-neutral-100">
      <CardHeader>
        <CardTitle className="text-base">Flag reason</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-base text-neutral-200">
          {FLAG_REASON_SENTENCES[flagReason]}
        </p>
        <p className="font-mono text-base text-neutral-500">{flagReason}</p>
        {flagReason === "multiple_signals_failed" && failureReasons?.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-300">
            {failureReasons.map((reason) => (
              <li key={reason}>{FLAG_REASON_SENTENCES[reason]}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
