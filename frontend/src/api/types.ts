/**
 * TypeScript types for the Sapien API.
 *
 * Source of truth: `docs/ui-contract.md`. If this file and that document
 * disagree, the document is correct — update this file to match it.
 */

// ---------------------------------------------------------------------------
// 3.1 / 3.2 — The Prompt object
// ---------------------------------------------------------------------------

/** The five prompt types the frontend knows how to score. Section 3.2. */
export type PromptType =
  | "head_turn_right"
  | "head_turn_left"
  | "speak_word"
  | "blink"
  | "passive_window";

/** Section 3.5. The default is "ats_interview". */
export type Scenario = "ats_interview" | "video_call";

/**
 * Section 3.6. Selects how the frontend presents a prompt. Independent of
 * `type`, which selects the scorer. Never guess one from the other.
 */
export type PromptKind = "scripted" | "passive" | "challenge";

export interface Prompt {
  /** The position of this prompt. The first prompt has index 1. */
  index: number;
  /** The total number of prompts in the session. */
  of: number;
  /** Selects the scorer function in the frontend. Do not read `instruction` to find this. */
  type: PromptType;
  /** The text shown on the candidate's screen. */
  instruction: string;
  /** The phrase the candidate must speak, or null for a prompt with no speech. */
  expected_word: string | null;
  /** The length of the recording window, in milliseconds. 3000-6000. */
  duration_ms: number;
  /** Selects the presentation. Section 3.6. */
  kind: PromptKind;
}

// ---------------------------------------------------------------------------
// 3.3 — EnabledModules
// ---------------------------------------------------------------------------

export interface EnabledModules {
  liveness: boolean;
  frame: boolean;
  voice: boolean;
}

// ---------------------------------------------------------------------------
// 3.4 — The error object
// ---------------------------------------------------------------------------

/** Section 9 — machine-readable error codes. */
export type ApiErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_ALREADY_COMPLETE"
  | "PROMPT_OUT_OF_ORDER"
  | "RESULT_NOT_READY"
  | "AUDIO_TOO_SHORT"
  | "AUDIO_DECODE_FAILED"
  | "FRAME_DECODE_FAILED"
  | "MODEL_UNAVAILABLE"
  | "VALIDATION_ERROR"
  | "CHALLENGE_NOT_SUPPORTED"
  | "CHALLENGE_ALREADY_ISSUED"
  | "CHALLENGE_TOO_LATE";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    detail: unknown | null;
  };
}

// ---------------------------------------------------------------------------
// 4 — POST /start-session
// ---------------------------------------------------------------------------

export interface StartSessionRequest {
  candidate_id?: string;
  scenario?: Scenario;
  enabled_modules?: EnabledModules;
}

export interface StartSessionResponse {
  session_id: string;
  created_at: string;
  /** Repeats the session's scenario. Selects the candidate route. */
  scenario: Scenario;
  total_prompts: number;
  enabled_modules: EnabledModules;
  prompt: Prompt;
}

// ---------------------------------------------------------------------------
// 5.2 — motion_detail
// ---------------------------------------------------------------------------

export type YawDirection = "right" | "left" | "none";

export interface MotionDetail {
  /** The largest head rotation in the window. Positive means a turn to the right. */
  yaw_peak_degrees: number;
  yaw_direction: YawDirection;
  /** Movement of the nose tip on the x axis, as a fraction of frame width. */
  nose_dx_normalized: number;
  /** Variance of the jaw-open value over the window. Speech raises this value. */
  jaw_open_variance: number;
  blink_count: number;
  frames_analyzed: number;
  /** Fraction of frames with no detected face. Above 0.25 means poor capture. */
  tracking_loss_ratio: number;
}

export interface CaptureMeta {
  duration_ms: number;
  video_width: number;
  video_height: number;
  landmarker_fps: number;
}

// ---------------------------------------------------------------------------
// 5 — POST /submit-response
// ---------------------------------------------------------------------------

export interface SubmitResponseRequest {
  session_id: string;
  prompt_index: number;
  prompt_type: PromptType;
  /** The frontend's own score, from 0.0 to 1.0. */
  landmark_motion_score: number;
  motion_detail: MotionDetail;
  /** 1-5 base64-encoded JPEG strings, no `data:` prefix. */
  frames: string[];
  /** base64-encoded audio clip, no data URI prefix, or null when the prompt has no expected word. */
  audio_clip: string | null;
  audio_mime: string;
  capture_meta: CaptureMeta;
}

export interface PromptResult {
  index: number;
  liveness_score: number;
  frame_score: number;
  /** null when the request sent no audio clip. */
  voice_score: number | null;
  /** null when the prompt has no expected word. */
  word_match: boolean | null;
  latency_ms: number;
}

export type SessionProgressStatus = "in_progress" | "complete";

export interface SubmitResponseResponse {
  session_id: string;
  status: SessionProgressStatus;
  accepted: boolean;
  prompt_result: PromptResult;
  /** null when status is "complete". */
  next_prompt: Prompt | null;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 6 — GET /session-status
// ---------------------------------------------------------------------------

export type SessionStatus =
  | "awaiting_start"
  | "in_progress"
  | "scoring"
  | "complete"
  | "error";

export interface CompletedPromptSummary {
  index: number;
  type: PromptType;
  submitted_at: string;
  liveness_score: number;
  frame_score: number;
  voice_score: number | null;
  word_match: boolean | null;
  latency_ms: number;
  kind: PromptKind;
}

export interface SessionStatusResponse {
  session_id: string;
  scenario: Scenario;
  status: SessionStatus;
  current_prompt_index: number;
  total_prompts: number;
  enabled_modules: EnabledModules;
  completed_prompts: CompletedPromptSummary[];
  /**
   * `video_call` only. Recomputed after every submission over the slots
   * completed so far. null before the first submission, and for
   * `ats_interview`. Section 12.5.
   */
  rolling_result: GetResultResponse | null;
  /** `video_call` only. null for `ats_interview`. Section 12.4. */
  challenge: Challenge | null;
  /** null until status is "complete". */
  result: GetResultResponse | null;
}

// ---------------------------------------------------------------------------
// 12.4 — The challenge object. 13 — POST /request-challenge
// ---------------------------------------------------------------------------

export type ChallengeState = "none" | "queued" | "active" | "passed" | "failed";

export type ChallengeSource = "auto" | "operator";

export interface Challenge {
  state: ChallengeState;
  /** null when state is "none". */
  source: ChallengeSource | null;
  /** The slot that holds the challenge. null when state is "none". */
  prompt_index: number | null;
  /** The slot picked for the auto challenge. null after an operator challenge cancels it. */
  auto_index: number | null;
}

export interface RequestChallengeRequest {
  session_id: string;
}

export interface RequestChallengeResponse {
  session_id: string;
  challenge: Challenge;
}

// ---------------------------------------------------------------------------
// 7 — GET /get-result
// ---------------------------------------------------------------------------

export type Signal = "real" | "synthetic";

/** Section 7.3 — machine-readable flag reason codes. */
export type FlagReasonCode =
  | "frame_classifier_below_threshold"
  | "voice_detection_deepfake"
  | "voice_detection_uncertain"
  | "liveness_timing_mismatch"
  | "liveness_no_face_detected"
  | "word_mismatch"
  | "challenge_failed"
  | "multiple_signals_failed";

export interface ComponentScores {
  liveness_scorer: number | null;
  frame_classifier: number | null;
  voice_detection: number | null;
}

export interface ModuleDetail {
  liveness_scorer: {
    enabled: boolean;
    prompts_passed: number;
    prompts_total: number;
  };
  frame_classifier: {
    enabled: boolean;
    frames_scored: number;
    mean_real_probability: number;
  };
  voice_detection: {
    enabled: boolean;
    label: string;
    word_match: boolean | null;
  };
}

export interface Thresholds {
  decision: number;
  frame_fake: number;
  voice_real: number;
  voice_fake: number;
}

export interface Weights {
  liveness: number;
  frame: number;
  voice: number;
}

export interface GetResultResponse {
  session_id: string;
  signal: Signal;
  confidence: number;
  completed_at: string;
  component_scores: ComponentScores;
  module_detail: ModuleDetail;
  thresholds: Thresholds;
  weights: Weights;
  /** null when signal is "real". */
  flag_reason: FlagReasonCode | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type guard used before dispatching to a scorer. Section 3.2 / Section 13. */
export function isKnownPromptType(value: string): value is PromptType {
  return (
    value === "head_turn_right" ||
    value === "head_turn_left" ||
    value === "speak_word" ||
    value === "blink" ||
    value === "passive_window"
  );
}
