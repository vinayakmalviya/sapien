import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { SapienIcon } from "@/components/console/SapienIcon";

/**
 * Layout shell for the operator surface (`/` and `/console/*`).
 *
 * Looks like a security console. Deliberately dark and dense — the opposite
 * of the candidate surface's ordinary ATS look. Section 9 of
 * frontend-handoff.md: body text at least 16px, readable from 3 metres away.
 * The candidate must never see this surface.
 */
export function ConsoleShell({
  sessionId,
  children,
}: {
  sessionId?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-base text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <SapienIcon className="h-7" />
          <p className="text-lg font-semibold tracking-wide">
            SAPIEN <span className="text-neutral-500">/ OPERATOR CONSOLE</span>
          </p>
        </div>
        {sessionId ? (
          <Badge variant="outline" className="border-neutral-700 text-neutral-300">
            session {sessionId.slice(0, 8)}
          </Badge>
        ) : null}
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
