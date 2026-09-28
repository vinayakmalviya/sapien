import { isKnownPromptType, type Prompt, type PromptType } from "@/api/types";
import {
  scoreBlink,
  scoreHeadTurnLeft,
  scoreHeadTurnRight,
  scorePassiveWindow,
  scoreSpeakWord,
  type Scorer,
} from "./scorers";

const SCORER_REGISTRY: Record<PromptType, Scorer> = {
  head_turn_right: scoreHeadTurnRight,
  head_turn_left: scoreHeadTurnLeft,
  speak_word: scoreSpeakWord,
  blink: scoreBlink,
  passive_window: scorePassiveWindow,
};

/**
 * Section 13 of frontend-handoff.md: "The frontend must reject an unknown
 * prompt.type. Do not guess a scorer." Thrown by `getScorerForPrompt` for
 * anything outside the five known values.
 */
export class UnknownPromptTypeError extends Error {
  constructor(promptType: string) {
    super(
      `Unknown prompt type: "${promptType}". The frontend has no scorer for it.`,
    );
    this.name = "UnknownPromptTypeError";
  }
}

/** Maps `prompt.type` to its scorer. Section 8 of frontend-handoff.md. */
export function getScorerForPrompt(prompt: Prompt): Scorer {
  if (!isKnownPromptType(prompt.type)) {
    throw new UnknownPromptTypeError(prompt.type);
  }
  return SCORER_REGISTRY[prompt.type];
}
