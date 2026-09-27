import { http, HttpResponse } from "msw";
import type {
  ApiErrorBody,
  CompletedPromptSummary,
  EnabledModules,
  GetResultResponse,
  PromptResult,
  SessionStatus,
  StartSessionRequest,
  SubmitResponseRequest,
  SubmitResponseResponse,
  Thresholds,
  Weights,
} from "@/api/types";
import {
  DEMO_PROMPTS,
  MOCK_BASE_WEIGHTS,
  MOCK_THRESHOLDS,
  REAL_RESULT_FIXTURE,
  SYNTHETIC_RESULT_FIXTURE,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Session store.
//
// This is the entire "backend" in mock mode. Section 10 of handoff.md: an
// in-memory dictionary is enough, session lifetime is 1 hour, no database.
//
// It is backed by `localStorage`, not a plain in-memory `Map`. The launcher
// and the candidate interview run in two different browser tabs. Each tab
// runs its own copy of this module, in its own JS heap — a plain `Map`
// would not be visible from the other tab. `localStorage` is shared by
// every tab on the same origin, which is exactly the demo's setup (Section
// 1 of handoff.md: one machine, two windows). This mirrors the same bridge
// `src/lib/sessionBootstrap.ts` uses for the first prompt.
// ---------------------------------------------------------------------------

interface SessionRecord {
  session_id: string;
  created_at: string;
  candidate_id: string;
  enabled_modules: EnabledModules;
  status: SessionStatus;
  /** 0-based index of the next prompt the candidate must answer. */
  nextPromptIndex: number;
  completedPrompts: CompletedPromptSummary[];
  result: GetResultResponse | null;
  /** Chosen once, at start-session. Drives every mock score for this session. */
  profile: "real" | "synthetic";
}

const STORAGE_KEY_PREFIX = "sapien:mock-session:";

function loadSession(sessionId: string): SessionRecord | undefined {
  const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${sessionId}`);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as SessionRecord;
  } catch {
    return undefined;
  }
}

function saveSession(session: SessionRecord): void {
  localStorage.setItem(
    `${STORAGE_KEY_PREFIX}${session.session_id}`,
    JSON.stringify(session),
  );
}

const DEFAULT_ENABLED_MODULES: EnabledModules = {
  liveness: true,
  frame: true,
  voice: true,
};

/**
 * Choose a demo profile from the candidate label. This is a mock-only
 * convenience — the real backend decides the signal from real model output.
 * Type a candidate ID containing "synthetic" on the launcher to see the
 * synthetic path end-to-end.
 */
function pickProfile(candidateId: string): "real" | "synthetic" {
  return candidateId.toLowerCase().includes("synthetic")
    ? "synthetic"
    : "real";
}

function errorBody(
  code: ApiErrorBody["error"]["code"],
  message: string,
): ApiErrorBody {
  return { error: { code, message, detail: null } };
}

function jitter(base: number, spread: number): number {
  const value = base + (Math.random() * 2 - 1) * spread;
  return Math.min(1, Math.max(0, value));
}

/** Renormalize the Decision Engine weights over the enabled modules. Section 8. */
function renormalizeWeights(enabled: EnabledModules): Weights {
  const active: Array<[keyof Weights, boolean]> = [
    ["liveness", enabled.liveness],
    ["frame", enabled.frame],
    ["voice", enabled.voice],
  ];
  const activeSum = active.reduce(
    (sum, [key, isEnabled]) => (isEnabled ? sum + MOCK_BASE_WEIGHTS[key] : sum),
    0,
  );
  const result: Weights = { liveness: 0, frame: 0, voice: 0 };
  for (const [key, isEnabled] of active) {
    result[key] = isEnabled ? MOCK_BASE_WEIGHTS[key] / activeSum : 0;
  }
  return result;
}

function buildResult(session: SessionRecord): GetResultResponse {
  const fixture =
    session.profile === "real" ? REAL_RESULT_FIXTURE : SYNTHETIC_RESULT_FIXTURE;
  const { enabled_modules } = session;

  const componentScores = {
    liveness_scorer: enabled_modules.liveness
      ? fixture.component_scores.liveness_scorer
      : null,
    frame_classifier: enabled_modules.frame
      ? fixture.component_scores.frame_classifier
      : null,
    voice_detection: enabled_modules.voice
      ? fixture.component_scores.voice_detection
      : null,
  };

  return {
    session_id: session.session_id,
    completed_at: new Date().toISOString(),
    signal: fixture.signal,
    confidence: fixture.confidence,
    component_scores: componentScores,
    module_detail: {
      liveness_scorer: {
        ...fixture.module_detail.liveness_scorer,
        enabled: enabled_modules.liveness,
      },
      frame_classifier: {
        ...fixture.module_detail.frame_classifier,
        enabled: enabled_modules.frame,
      },
      voice_detection: {
        ...fixture.module_detail.voice_detection,
        enabled: enabled_modules.voice,
      },
    },
    thresholds: MOCK_THRESHOLDS satisfies Thresholds,
    weights: renormalizeWeights(enabled_modules),
    flag_reason: fixture.flag_reason,
  };
}

function buildPromptResult(
  session: SessionRecord,
  promptIndex: number,
  body: SubmitResponseRequest,
): PromptResult {
  const isReal = session.profile === "real";
  const livenessScore = jitter(
    isReal ? Math.max(0.85, body.landmark_motion_score) : 0.5,
    0.05,
  );
  const frameScore = jitter(isReal ? 0.9 : 0.09, 0.04);
  const voiceScore = body.audio_clip
    ? jitter(isReal ? 0.85 : 0.22, 0.05)
    : null;
  const wordMatch = body.audio_clip ? true : null;

  return {
    index: promptIndex,
    liveness_score: Number(livenessScore.toFixed(2)),
    frame_score: Number(frameScore.toFixed(2)),
    voice_score: voiceScore === null ? null : Number(voiceScore.toFixed(2)),
    word_match: wordMatch,
    latency_ms: Math.round(400 + Math.random() * 700),
  };
}

/** Simulated model inference delay before the final result is ready. */
const SCORING_DELAY_MS = 1200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const handlers = [
  // -------------------------------------------------------------------------
  // POST /start-session
  // -------------------------------------------------------------------------
  http.post("/api/start-session", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as StartSessionRequest;
    const sessionId = crypto.randomUUID();
    const candidateId = body.candidate_id ?? "demo-candidate";
    const enabledModules = body.enabled_modules ?? DEFAULT_ENABLED_MODULES;

    const session: SessionRecord = {
      session_id: sessionId,
      created_at: new Date().toISOString(),
      candidate_id: candidateId,
      enabled_modules: enabledModules,
      status: "awaiting_start",
      nextPromptIndex: 0,
      completedPrompts: [],
      result: null,
      profile: pickProfile(candidateId),
    };
    saveSession(session);

    return HttpResponse.json({
      session_id: sessionId,
      created_at: session.created_at,
      total_prompts: DEMO_PROMPTS.length,
      enabled_modules: enabledModules,
      prompt: DEMO_PROMPTS[0],
    });
  }),

  // -------------------------------------------------------------------------
  // POST /submit-response
  // -------------------------------------------------------------------------
  http.post("/api/submit-response", async ({ request }) => {
    const body = (await request.json()) as SubmitResponseRequest;
    const session = loadSession(body.session_id);

    if (!session) {
      return HttpResponse.json(
        errorBody("SESSION_NOT_FOUND", "No session exists with this ID."),
        { status: 404 },
      );
    }
    if (session.status === "complete") {
      return HttpResponse.json(
        errorBody(
          "SESSION_ALREADY_COMPLETE",
          "This session already received every prompt.",
        ),
        { status: 409 },
      );
    }
    const expectedIndex = session.nextPromptIndex + 1;
    if (body.prompt_index !== expectedIndex) {
      return HttpResponse.json(
        errorBody(
          "PROMPT_OUT_OF_ORDER",
          `Expected prompt index ${expectedIndex}, received ${body.prompt_index}.`,
        ),
        { status: 409 },
      );
    }

    const promptResult = buildPromptResult(session, body.prompt_index, body);
    session.completedPrompts.push({
      index: body.prompt_index,
      type: body.prompt_type,
      submitted_at: new Date().toISOString(),
      liveness_score: promptResult.liveness_score,
      frame_score: promptResult.frame_score,
      voice_score: promptResult.voice_score,
      word_match: promptResult.word_match,
      latency_ms: promptResult.latency_ms,
    });
    session.nextPromptIndex += 1;

    const isLastPrompt = session.nextPromptIndex >= DEMO_PROMPTS.length;

    if (!isLastPrompt) {
      session.status = "in_progress";
      saveSession(session);
      const response: SubmitResponseResponse = {
        session_id: session.session_id,
        status: "in_progress",
        accepted: true,
        prompt_result: promptResult,
        next_prompt: DEMO_PROMPTS[session.nextPromptIndex],
        warnings: [],
      };
      return HttpResponse.json(response);
    }

    // Last prompt. Report "scoring" to session-status while we "run the model".
    session.status = "scoring";
    saveSession(session);
    await sleep(SCORING_DELAY_MS);
    session.result = buildResult(session);
    session.status = "complete";
    saveSession(session);

    const response: SubmitResponseResponse = {
      session_id: session.session_id,
      status: "complete",
      accepted: true,
      prompt_result: promptResult,
      next_prompt: null,
      warnings: [],
    };
    return HttpResponse.json(response);
  }),

  // -------------------------------------------------------------------------
  // GET /session-status
  // -------------------------------------------------------------------------
  http.get("/api/session-status", ({ request }) => {
    const sessionId = new URL(request.url).searchParams.get("session_id");
    const session = sessionId ? loadSession(sessionId) : undefined;

    if (!sessionId) {
      return HttpResponse.json(
        errorBody("VALIDATION_ERROR", "session_id is required."),
        { status: 400 },
      );
    }
    if (!session) {
      return HttpResponse.json(
        errorBody("SESSION_NOT_FOUND", "No session exists with this ID."),
        { status: 404 },
      );
    }

    return HttpResponse.json({
      session_id: session.session_id,
      status: session.status,
      current_prompt_index: Math.min(
        session.nextPromptIndex + 1,
        DEMO_PROMPTS.length,
      ),
      total_prompts: DEMO_PROMPTS.length,
      enabled_modules: session.enabled_modules,
      completed_prompts: session.completedPrompts,
      result: session.result,
    });
  }),

  // -------------------------------------------------------------------------
  // GET /get-result
  // -------------------------------------------------------------------------
  http.get("/api/get-result", ({ request }) => {
    const sessionId = new URL(request.url).searchParams.get("session_id");
    const session = sessionId ? loadSession(sessionId) : undefined;

    if (!sessionId) {
      return HttpResponse.json(
        errorBody("VALIDATION_ERROR", "session_id is required."),
        { status: 400 },
      );
    }
    if (!session) {
      return HttpResponse.json(
        errorBody("SESSION_NOT_FOUND", "No session exists with this ID."),
        { status: 404 },
      );
    }
    if (!session.result) {
      return HttpResponse.json(
        errorBody(
          "RESULT_NOT_READY",
          "The session is not complete yet. Poll again.",
        ),
        { status: 409 },
      );
    }

    return HttpResponse.json(session.result);
  }),
];
