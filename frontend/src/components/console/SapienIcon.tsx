import { cn } from "@/lib/utils";

/**
 * The Sapien icon on a white tile. The JPEG has a white background and a
 * black stroke that vanishes on a dark surface, so it always sits on white.
 * Height is set by the caller; width stays auto because the icon is taller
 * than it is wide. Operator surface only — never render on a candidate
 * surface.
 */
export function SapienIcon({ className }: { className?: string }) {
  return (
    <span className="inline-flex w-fit shrink-0 rounded-md bg-white p-0.5">
      <img
        src="/sapien-icon.jpeg"
        alt="Sapien"
        className={cn("w-auto", className)}
      />
    </span>
  );
}
