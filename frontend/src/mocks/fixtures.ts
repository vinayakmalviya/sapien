import type {
  GetResultResponse,
  Prompt,
  Scenario,
  Thresholds,
  Weights,
} from "@/api/types";

/**
 * The fixed demo prompt set. Section 3.2 of ui-contract.md.
 */
export const DEMO_PROMPTS: Prompt[] = [
  {
    index: 1,
    of: 3,
    type: "head_turn_right",
    instruction:
      "Turn your head slightly to the right, then say 'orange river seven bright morning'.",
    expected_word: "orange river seven bright morning",
    duration_ms: 6000,
    kind: "scripted",
  },
  {
    index: 2,
    of: 3,
    type: "speak_word",
    instruction: "Say 'silver harbour twenty four quiet boats' now.",
    expected_word: "silver harbour twenty four quiet boats",
    duration_ms: 6000,
    kind: "scripted",
  },
  {
    index: 3,
    of: 3,
    type: "blink",
    instruction: "Blink two times.",
    expected_word: null,
    duration_ms: 4000,
    kind: "scripted",
  },
];

/** Section 12.1 of ui-contract.md: 8 slots, each a 5-second passive window. */
export const CALL_SLOT_COUNT = 8;

export const CALL_PROMPTS: Prompt[] = Array.from(
  { length: CALL_SLOT_COUNT },
  (_, i) => ({
    index: i + 1,
    of: CALL_SLOT_COUNT,
    type: "passive_window",
    instruction: "",
    expected_word: null,
    duration_ms: 5000,
    kind: "passive",
  }),
);

/**
 * The base prompt plan for each scenario. A `video_call` session starts as
 * 8 passive windows; one slot is replaced by a challenge during the call
 * (Section 12.3 of ui-contract.md).
 */
export function getPromptPlan(scenario: Scenario): Prompt[] {
  return scenario === "video_call" ? CALL_PROMPTS : DEMO_PROMPTS;
}

/** The challenge follows the first five-second passive window. */
export const AUTO_CHALLENGE_SLOTS = [2];

/**
 * Section 12.1: the challenge pool. The phrases differ from the ATS
 * phrases, so a prepared clip cannot contain them.
 */
export const CHALLENGE_POOL: Array<
  Pick<Prompt, "type" | "instruction" | "expected_word">
> = [
  {
    type: "head_turn_right",
    instruction:
      "Please turn your head slightly to the right and say 'blue river seven happy morning'.",
    expected_word: "blue river seven happy morning",
  },
  {
    type: "head_turn_left",
    instruction:
      "Please turn your head slightly to the left and say 'red apple twenty four quiet garden'.",
    expected_word: "red apple twenty four quiet garden",
  },
];

export const CHALLENGE_DURATION_MS = 8000;

/** Section 7.1 — the active thresholds. Held here once, echoed back by the mock API. */
export const MOCK_THRESHOLDS: Thresholds = {
  decision: 0.5,
  frame_fake: 0.15,
  // 1.0 means real for every score: real at or above voice_real, deepfake
  // below voice_fake. Section 7.1 of ui-contract.md.
  voice_real: 0.65,
  voice_fake: 0.35,
};

/** Section 7 — the fixed Decision Engine weights, before renormalization. */
export const MOCK_BASE_WEIGHTS: Weights = {
  liveness: 0.4,
  frame: 0.35,
  voice: 0.25,
};

/**
 * A real payload. Section 7.1 example, adjusted so every threshold is
 * comfortably cleared.
 */
export const REAL_RESULT_FIXTURE: Omit<
  GetResultResponse,
  "session_id" | "completed_at"
> = {
  signal: "real",
  confidence: 0.89,
  component_scores: {
    liveness_scorer: 0.93,
    frame_classifier: 0.91,
    voice_detection: 0.85,
  },
  module_detail: {
    liveness_scorer: { enabled: true, prompts_passed: 3, prompts_total: 3 },
    frame_classifier: {
      enabled: true,
      frames_scored: 6,
      mean_real_probability: 0.91,
    },
    voice_detection: { enabled: true, label: "human", word_match: true },
  },
  thresholds: MOCK_THRESHOLDS,
  weights: MOCK_BASE_WEIGHTS,
  flag_reason: null,
};

/**
 * A synthetic payload. Matches the Section 7.1 example exactly: the frame
 * classifier fails, which sets the flag reason.
 */
export const SYNTHETIC_RESULT_FIXTURE: Omit<
  GetResultResponse,
  "session_id" | "completed_at"
> = {
  signal: "synthetic",
  confidence: 0.41,
  component_scores: {
    liveness_scorer: 0.92,
    frame_classifier: 0.09,
    voice_detection: 0.22,
  },
  module_detail: {
    liveness_scorer: { enabled: true, prompts_passed: 3, prompts_total: 3 },
    frame_classifier: {
      enabled: true,
      frames_scored: 6,
      mean_real_probability: 0.09,
    },
    voice_detection: { enabled: true, label: "deepfake", word_match: true },
  },
  thresholds: MOCK_THRESHOLDS,
  weights: MOCK_BASE_WEIGHTS,
  flag_reason: "frame_classifier_below_threshold",
};
