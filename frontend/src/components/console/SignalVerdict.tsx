import type { Signal } from "@/api/types";

/**
 * Shows REAL or SYNTHETIC in large type. Section 10.2 of frontend-handoff.md.
 *
 * The only place in the whole app that uses the reserved verdict colours
 * (Section 9.1) — `--verdict-real` / `--verdict-synthetic`. No other
 * component may use them. Set at 80px, well above the 72px legibility
 * floor from Section 9.2, so a judge reads it from 3 metres away.
 */
export function SignalVerdict({ signal }: { signal: Signal }) {
  const isReal = signal === "real";
  return (
    <p
      className={
        isReal
          ? "text-[80px] font-bold leading-none tracking-tight text-verdict-real"
          : "text-[80px] font-bold leading-none tracking-tight text-verdict-synthetic"
      }
    >
      {isReal ? "REAL" : "SYNTHETIC"}
    </p>
  );
}
