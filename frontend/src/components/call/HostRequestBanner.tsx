import type { Prompt } from "@/api/types";
import { CountdownRing } from "@/components/candidate/CountdownRing";
import { FAKE_INTERVIEWER_NAME } from "@/lib/fakeCompany";

/**
 * The challenge, presented as a request from the host. A card at the top of
 * the call stage.
 */
export function HostRequestBanner({
  prompt,
  isRecording,
  message,
}: {
  prompt: Prompt;
  isRecording: boolean;
  /** A retry message, e.g. after AUDIO_TOO_SHORT. */
  message?: string | null;
}) {
  return (
    <div
      role="status"
      className="absolute top-4 left-1/2 flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center gap-4 rounded-xl border border-neutral-700 bg-neutral-900/95 p-4 shadow-xl"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm text-neutral-400">
          {FAKE_INTERVIEWER_NAME} asked for a quick identity check
        </p>
        <p className="text-base text-neutral-100">{prompt.instruction}</p>
        {prompt.expected_word ? (
          <p className="w-fit rounded-md bg-neutral-800 px-2 py-1 text-sm text-neutral-100">
            Say: "{prompt.expected_word}"
          </p>
        ) : null}
        {message ? <p className="text-sm text-amber-300">{message}</p> : null}
      </div>
      <CountdownRing durationMs={prompt.duration_ms} isActive={isRecording} />
    </div>
  );
}
