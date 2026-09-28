import { MicIcon, PhoneOffIcon, VideoIcon } from "lucide-react";

/**
 * The bottom control bar. Decorative only: none of these controls do
 * anything. Section 9 of video-call-scenario.md puts working controls out
 * of scope. "Leave" uses a plain Tailwind red, never a verdict colour.
 */
export function CallControls() {
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <button
        type="button"
        aria-label="Microphone"
        className="flex size-11 items-center justify-center rounded-full bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
      >
        <MicIcon className="size-5" />
      </button>
      <button
        type="button"
        aria-label="Camera"
        className="flex size-11 items-center justify-center rounded-full bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
      >
        <VideoIcon className="size-5" />
      </button>
      <button
        type="button"
        className="flex h-11 items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-medium text-white hover:bg-red-700"
      >
        <PhoneOffIcon className="size-5" />
        Leave
      </button>
    </div>
  );
}
