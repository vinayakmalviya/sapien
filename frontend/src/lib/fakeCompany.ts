/**
 * Fake identity for the candidate surface. Section 9.3 of frontend-handoff.md:
 * "Add a fake company name and a fake job title. Add a fake interviewer name."
 * Sapien must not be visible here — the candidate sees an ordinary ATS screen.
 */
export const FAKE_COMPANY_NAME = "Northbrook Talent Partners";
export const FAKE_JOB_TITLE = "Senior Platform Engineer";
export const FAKE_INTERVIEWER_NAME = "Morgan Ellis";

/** The fake conferencing product for the video call surface. */
export const FAKE_CALL_PRODUCT = "Huddle";
export const FAKE_MEETING_TITLE = "Final round — Senior Platform Engineer";

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}
