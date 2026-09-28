import type { Signal } from "@/api/types";
import { cn } from "@/lib/utils";

/**
 * Shows REAL or SYNTHETIC in large type. Section 10.2 of frontend-handoff.md.
 *
 * The only place in the whole app that uses the reserved verdict colours
 * (Section 9.1) — `--verdict-real` / `--verdict-synthetic`. No other
 * component may use them. "large" is set at 80px, well above the 72px
 * legibility floor from Section 9.2, so a judge reads it from 3 metres away.
 * "compact" is the rolling verdict during a video call (Section 5.3 of
 * video-call-scenario.md); the final verdict always uses "large".
 */
export function SignalVerdict({
  signal,
  size = "large",
}: {
  signal: Signal;
  size?: "large" | "compact";
}) {
  const isReal = signal === "real";
  return (
    <p
      className={cn(
        "font-bold leading-none tracking-tight",
        size === "large" ? "text-[80px]" : "text-[56px]",
        isReal ? "text-verdict-real" : "text-verdict-synthetic",
      )}
    >
      {isReal ? "REAL" : "SYNTHETIC"}
    </p>
  );
}
