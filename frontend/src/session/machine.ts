import type { Prompt, PromptResult } from "@/api/types";

/**
 * Section 7 of frontend-handoff.md. Nine states. One reducer.
 * Do not add a separate boolean flag for any of these facts.
 */
export type SessionStatusName =
  | "idle"
  | "requesting_permission"
  | "calibrating"
  | "prompt_shown"
  | "recording"
  | "uploading"
  | "next_prompt"
  | "complete"
  | "error";

export interface SessionState {
  status: SessionStatusName;
  sessionId: string | null;
  totalPrompts: number;
  currentPrompt: Prompt | null;
  completedResults: PromptResult[];
  errorMessage: string | null;
}

export const initialSessionState: SessionState = {
  status: "idle",
  sessionId: null,
  totalPrompts: 0,
  currentPrompt: null,
  completedResults: [],
  errorMessage: null,
};

export type SessionEvent =
  | { type: "START"; sessionId: string }
  | { type: "PERMISSION_GRANTED" }
  | { type: "CALIBRATED"; prompt: Prompt; totalPrompts: number }
  | { type: "LEAD_IN_COMPLETE" }
  | { type: "RECORDING_COMPLETE" }
  | { type: "UPLOAD_SUCCESS"; result: PromptResult; nextPrompt: Prompt | null }
  | { type: "SHOW_NEXT_PROMPT" }
  | { type: "FATAL_ERROR"; message: string }
  | { type: "RESET" };

/**
 * Every transition checks the current status first. An event that arrives
 * for the wrong status is ignored — this is what keeps nine states from
 * turning into bugs on demo day.
 */
export function sessionReducer(
  state: SessionState,
  event: SessionEvent,
): SessionState {
  switch (event.type) {
    case "START":
      if (state.status !== "idle") return state;
      return {
        ...initialSessionState,
        status: "requesting_permission",
        sessionId: event.sessionId,
      };

    case "PERMISSION_GRANTED":
      if (state.status !== "requesting_permission") return state;
      return { ...state, status: "calibrating" };

    case "CALIBRATED":
      if (state.status !== "calibrating") return state;
      return {
        ...state,
        status: "prompt_shown",
        currentPrompt: event.prompt,
        totalPrompts: event.totalPrompts,
      };

    case "LEAD_IN_COMPLETE":
      if (state.status !== "prompt_shown") return state;
      return { ...state, status: "recording" };

    case "RECORDING_COMPLETE":
      if (state.status !== "recording") return state;
      return { ...state, status: "uploading" };

    case "UPLOAD_SUCCESS": {
      if (state.status !== "uploading") return state;
      const completedResults = [...state.completedResults, event.result];
      if (event.nextPrompt) {
        return {
          ...state,
          status: "next_prompt",
          completedResults,
          currentPrompt: event.nextPrompt,
        };
      }
      return {
        ...state,
        status: "complete",
        completedResults,
        currentPrompt: null,
      };
    }

    case "SHOW_NEXT_PROMPT":
      if (state.status !== "next_prompt") return state;
      return { ...state, status: "prompt_shown" };

    case "FATAL_ERROR":
      if (state.status === "complete") return state;
      return { ...state, status: "error", errorMessage: event.message };

    case "RESET":
      return initialSessionState;

    default:
      return state;
  }
}
