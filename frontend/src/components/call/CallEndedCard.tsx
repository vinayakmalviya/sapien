import { FAKE_INTERVIEWER_NAME } from "@/lib/fakeCompany";

/** The `complete` state. Shows no score, by construction: it takes no props. */
export function CallEndedCard() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-2 rounded-xl bg-neutral-900 px-8 py-10 text-center ring-1 ring-neutral-800">
        <p className="text-xl font-semibold">The meeting has ended.</p>
        <p className="text-sm text-neutral-400">
          Thanks for your time. {FAKE_INTERVIEWER_NAME} will follow up by
          email. You can close this window.
        </p>
      </div>
    </div>
  );
}
