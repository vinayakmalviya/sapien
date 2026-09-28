import { useEffect, useState, type ReactNode } from "react";
import {
  FAKE_CALL_PRODUCT,
  FAKE_COMPANY_NAME,
  FAKE_MEETING_TITLE,
} from "@/lib/fakeCompany";

/**
 * Layout shell for the video call candidate surface (`/call/$sessionId`).
 *
 * Looks like an ordinary conferencing product. Sapien is never visible here.
 * Neutral greys and a conferencing blue (`.surface-call`), never the rose.
 */
export function CallShell({
  joinedAt,
  children,
}: {
  /** Epoch ms when the candidate joined. The call timer runs from here. */
  joinedAt?: number | null;
  children: ReactNode;
}) {
  return (
    <div className="surface-call flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            {FAKE_CALL_PRODUCT[0]}
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">
              {FAKE_MEETING_TITLE}
            </p>
            <p className="text-xs leading-tight text-neutral-400">
              {FAKE_CALL_PRODUCT} · {FAKE_COMPANY_NAME}
            </p>
          </div>
        </div>
        {joinedAt ? <CallTimer joinedAt={joinedAt} /> : null}
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

function CallTimer({ joinedAt }: { joinedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const totalSeconds = Math.max(0, Math.floor((now - joinedAt) / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return (
    <p className="font-mono text-sm tabular-nums text-neutral-300">
      {minutes}:{seconds}
    </p>
  );
}
