import type { ReactNode } from "react";

/**
 * The candidate's own picture-in-picture tile, bottom right. Holds
 * `CameraFeed`. The small size is CSS only: the `<video>` still decodes at
 * the source resolution, so tracking quality does not change.
 */
export function SelfTile({
  overlay,
  children,
}: {
  /** Shown on top of the video, e.g. "Joining…". */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="absolute right-4 bottom-4 h-[180px] w-[240px] overflow-hidden rounded-lg bg-neutral-900 shadow-lg ring-1 ring-neutral-700">
      {children}
      {overlay ? (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/80 text-sm text-neutral-200">
          {overlay}
        </div>
      ) : null}
      <p className="absolute bottom-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-xs">
        You
      </p>
    </div>
  );
}
