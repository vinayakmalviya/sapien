import type { GetResultResponse, Prompt, Thresholds, Weights } from "@/api/types";

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
  },
  {
    index: 2,
    of: 3,
    type: "speak_word",
    instruction: "Say 'silver harbour twenty four quiet boats' now.",
    expected_word: "silver harbour twenty four quiet boats",
    duration_ms: 6000,
  },
  {
    index: 3,
    of: 3,
    type: "blink",
    instruction: "Blink two times.",
    expected_word: null,
    duration_ms: 4000,
  },
];

/** Section 7.1 — the active thresholds. Held here once, echoed back by the mock API. */
export const MOCK_THRESHOLDS: Thresholds = {
  decision: 0.5,
  frame_fake: 0.15,
  voice_real: 0.35,
  voice_fake: 0.65,
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
