import type { ReactNode } from "react";
import {
  FAKE_COMPANY_NAME,
  FAKE_INTERVIEWER_NAME,
  FAKE_JOB_TITLE,
} from "@/lib/fakeCompany";

/**
 * Layout shell for the candidate surface (`/interview/$sessionId`).
 *
 * Looks like an ordinary ATS interview screen. Sapien is never visible here.
 * Section 9.3 of frontend-handoff.md: light theme, neutral corporate style,
 * fake company name, fake job title, fake interviewer name.
 */
export function CandidateShell({ children }: { children: ReactNode }) {
  return (
    <div className="surface-ats flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white">
            NT
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">
              {FAKE_COMPANY_NAME}
            </p>
            <p className="text-xs leading-none text-slate-500">
              {FAKE_JOB_TITLE} — Interview
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Interviewer: {FAKE_INTERVIEWER_NAME}
        </p>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white px-6 py-2 text-center text-xs text-slate-400">
        {FAKE_COMPANY_NAME} Candidate Portal
      </footer>
    </div>
  );
}
