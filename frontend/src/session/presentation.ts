import type { Prompt } from "@/api/types";
import { LEAD_IN_MS } from "@/scoring/constants";

export interface PromptPresentation {
  leadInMs: number;
  showsPrompt: boolean;
  recordsAudio: boolean;
}

/**
 * How the candidate surface presents a prompt. Reads `prompt.kind` only,
 * never `prompt.type`. Section 3.6 of ui-contract.md, Section 5.4 of
 * video-call-scenario.md.
 */
export function getPromptPresentation(prompt: Prompt): PromptPresentation {
  switch (prompt.kind) {
    case "passive":
      return { leadInMs: 0, showsPrompt: false, recordsAudio: true };
    case "challenge":
      return { leadInMs: LEAD_IN_MS, showsPrompt: true, recordsAudio: true };
    case "scripted":
    default:
      return {
        leadInMs: LEAD_IN_MS,
        showsPrompt: true,
        recordsAudio: prompt.expected_word !== null,
      };
  }
}
