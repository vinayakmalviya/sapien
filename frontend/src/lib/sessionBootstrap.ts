import type { EnabledModules, Prompt } from "@/api/types";

interface SessionBootstrap {
  totalPrompts: number;
  enabledModules: EnabledModules;
  firstPrompt: Prompt;
}

const KEY_PREFIX = "sapien:session-bootstrap:";

/**
 * `POST /start-session` returns the first prompt to the operator surface
 * only. The candidate surface opens in its own window at `/interview/$id`,
 * with no prompt data in the URL (Section 5 of frontend-handoff.md: no
 * join code, no QR code — a link is enough).
 *
 * Both windows share one browser, on one machine, on the same origin.
 * `localStorage` is the bridge: the launcher writes the first prompt here
 * right after `start-session` succeeds, before it opens the candidate
 * window. The candidate surface reads it once, during `calibrating`.
 */
export function storeSessionBootstrap(
  sessionId: string,
  data: SessionBootstrap,
) {
  localStorage.setItem(`${KEY_PREFIX}${sessionId}`, JSON.stringify(data));
}

export function readSessionBootstrap(
  sessionId: string,
): SessionBootstrap | null {
  const raw = localStorage.getItem(`${KEY_PREFIX}${sessionId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionBootstrap;
  } catch {
    return null;
  }
}
