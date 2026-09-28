import { http, HttpResponse } from "msw";
import type {
  ApiErrorBody,
  Challenge,
  CompletedPromptSummary,
  Prompt,
  RequestChallengeRequest,
  RequestChallengeResponse,
  EnabledModules,
  FlagReasonCode,
  GetResultResponse,
  PromptResult,
  Scenario,
  SessionStatus,
  SessionStatusResponse,
  StartSessionResponse,
  StartSessionRequest,
  SubmitResponseRequest,
  SubmitResponseResponse,
  Thresholds,
  Weights,
} from "@/api/types";
import {
  AUTO_CHALLENGE_SLOTS,
  CALL_SLOT_COUNT,
  CHALLENGE_DURATION_MS,
  CHALLENGE_POOL,
  getPromptPlan,
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
  scenario: Scenario;
  enabled_modules: EnabledModules;
  status: SessionStatus;
  /** 0-based index of the next prompt the candidate must answer. */
  nextPromptIndex: number;
  completedPrompts: CompletedPromptSummary[];
  /** `video_call` only. Recomputed after every submission. Section 12.5. */
  rollingResult: GetResultResponse | null;
  /** `video_call` only. Section 12.4. */
  challenge: Challenge | null;
  /** The prompt that replaced a passive slot, once the challenge is active. */
  challengePrompt: Prompt | null;
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

/** A decoded clip with an RMS level under this counts as silence. */
const MOCK_SILENCE_RMS = 0.005;

/**
 * Stands in for the backend's speech check. MSW handlers run in the page,
 * so the mock can decode the clip with Web Audio. A clip that fails to
 * decode counts as silent.
 */
async function isSilentClip(audioBase64: string | null): Promise<boolean> {
  if (!audioBase64) return true;
  try {
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const context = new OfflineAudioContext(1, 1, 48000);
    const buffer = await context.decodeAudioData(bytes.buffer);
    const samples = buffer.getChannelData(0);
    let sumOfSquares = 0;
    for (const sample of samples) sumOfSquares += sample * sample;
    return Math.sqrt(sumOfSquares / Math.max(1, samples.length)) < MOCK_SILENCE_RMS;
  } catch {
    return true;
  }
}

/**
 * Section 12.2 of ui-contract.md. Voice detection only (no word match), no
 * AUDIO_TOO_SHORT: a silent window gets a null voice score and a warning.
 * The frontend's landmark score is the window's liveness score.
 *
 * Section 5.7 of video-call-scenario.md: for the synthetic profile, the
 * passive windows look alive (a replayed clip moves and blinks) and only
 * the voice scores low.
 */
async function buildPassivePromptResult(
  session: SessionRecord,
  body: SubmitResponseRequest,
): Promise<{ promptResult: PromptResult; warnings: string[] }> {
  const silent = await isSilentClip(body.audio_clip);
  const voiceScore = silent
    ? null
    : Number(jitter(session.profile === "real" ? 0.85 : 0.22, 0.05).toFixed(2));
  return {
    promptResult: {
      index: body.prompt_index,
      liveness_score: Number(body.landmark_motion_score.toFixed(2)),
      frame_score: Number(jitter(session.profile === "real" ? 0.9 : 0.6, 0.04).toFixed(2)),
      voice_score: voiceScore,
      word_match: null,
      latency_ms: Math.round(150 + Math.random() * 250),
    },
    warnings: silent ? ["no_speech_in_window"] : [],
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * The call's result over the slots completed so far. Section 12.5 and
 * 12.6 of ui-contract.md: liveness is the mean over all slots, voice the
 * mean over the slots with a voice score. A module with no value yet gets
 * no weight.
 */
function buildRollingResult(session: SessionRecord): GetResultResponse {
  const { enabled_modules, completedPrompts } = session;
  const thresholds = MOCK_THRESHOLDS;

  const liveness = enabled_modules.liveness
    ? mean(completedPrompts.map((p) => p.liveness_score))
    : null;
  const frame = enabled_modules.frame
    ? mean(
        completedPrompts
          .map((p) => p.frame_score)
          .filter((score): score is number => score !== null),
      )
    : null;
  const voice = enabled_modules.voice
    ? mean(
        completedPrompts
          .map((p) => p.voice_score)
          .filter((score): score is number => score !== null),
      )
    : null;

  const weights = renormalizeWeights({
    liveness: liveness !== null,
    frame: frame !== null,
    voice: voice !== null,
  });
  const confidence =
    (liveness ?? 0) * weights.liveness +
    (frame ?? 0) * weights.frame +
    (voice ?? 0) * weights.voice;
  const signal = confidence >= thresholds.decision ? "real" : "synthetic";

  const failures: FlagReasonCode[] = [];
  if (liveness !== null && liveness < thresholds.decision) {
    failures.push("liveness_timing_mismatch");
  }
  if (frame !== null && frame < thresholds.frame_fake) {
    failures.push("frame_classifier_below_threshold");
  }
  if (voice !== null && voice < thresholds.voice_fake) {
    failures.push("voice_detection_deepfake");
  } else if (voice !== null && voice < thresholds.voice_real) {
    failures.push("voice_detection_uncertain");
  }
  let finalSignal: GetResultResponse["signal"] = signal;
  let finalConfidence = confidence;
  let flagReason: FlagReasonCode | null = null;
  if (signal === "synthetic") {
    flagReason =
      failures.length > 1
        ? "multiple_signals_failed"
        : (failures[0] ?? "liveness_timing_mismatch");
  }

  // Section 12.6: a mean over 8 slots hides one failed challenge, so a
  // failed challenge overrides the combined score. "Another check also
  // failed" is read as "the combined score was already synthetic": the
  // demo's synthetic clip always has a low voice score, and its story is a
  // REAL call that flips to SYNTHETIC with `challenge_failed`.
  const challengeSummary = completedPrompts.find((p) => p.kind === "challenge");
  if (challengeSummary && challengeFailed(challengeSummary, thresholds)) {
    finalSignal = "synthetic";
    finalConfidence = Math.min(confidence, challengeSummary.liveness_score);
    flagReason =
      signal === "synthetic" ? "multiple_signals_failed" : "challenge_failed";
  }

  let voiceLabel = "none";
  if (voice !== null) {
    if (voice >= thresholds.voice_real) voiceLabel = "human";
    else if (voice < thresholds.voice_fake) voiceLabel = "deepfake";
    else voiceLabel = "uncertain";
  }

  const round = (value: number | null) =>
    value === null ? null : Number(value.toFixed(2));

  return {
    session_id: session.session_id,
    completed_at: new Date().toISOString(),
    signal: finalSignal,
    confidence: Number(finalConfidence.toFixed(2)),
    component_scores: {
      liveness_scorer: round(liveness),
      frame_classifier: round(frame),
      voice_detection: round(voice),
    },
    module_detail: {
      liveness_scorer: {
        enabled: enabled_modules.liveness,
        prompts_passed: completedPrompts.filter(
          (p) => p.liveness_score >= thresholds.decision,
        ).length,
        prompts_total: getPromptPlan(session.scenario).length,
      },
      frame_classifier: {
        enabled: enabled_modules.frame,
        frames_scored: completedPrompts.length * 2,
        mean_real_probability: round(frame) ?? 0,
      },
      voice_detection: {
        enabled: enabled_modules.voice,
        label: voiceLabel,
        word_match: challengeSummary?.word_match ?? null,
      },
    },
    thresholds,
    weights,
    flag_reason: flagReason,
  };
}

function pickRandom<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

/** The session's plan, with the challenge in its slot once it is active. */
function sessionPlan(session: SessionRecord): Prompt[] {
  const plan = getPromptPlan(session.scenario);
  const challengePrompt = session.challengePrompt;
  if (!challengePrompt) return plan;
  return plan.map((prompt) =>
    prompt.index === challengePrompt.index ? challengePrompt : prompt,
  );
}

/**
 * Section 12.3: when the backend builds `next_prompt` for slot N+1, a
 * queued operator challenge for that slot, or the auto slot, replaces the
 * passive window with a challenge from the pool.
 */
function activateChallengeFor(session: SessionRecord, nextSlot: number): void {
  const challenge = session.challenge;
  if (!challenge) return;
  const isQueuedHere =
    challenge.state === "queued" && challenge.prompt_index === nextSlot;
  const isAutoHere =
    challenge.state === "none" && challenge.auto_index === nextSlot;
  if (!isQueuedHere && !isAutoHere) return;

  session.challengePrompt = {
    ...pickRandom(CHALLENGE_POOL),
    index: nextSlot,
    of: CALL_SLOT_COUNT,
    duration_ms: CHALLENGE_DURATION_MS,
    kind: "challenge",
  };
  session.challenge = {
    ...challenge,
    state: "active",
    source: isQueuedHere ? "operator" : "auto",
    prompt_index: nextSlot,
  };
}

/**
 * A challenge uses the normal rules: both audio services run. Section 5.7
 * of video-call-scenario.md: a synthetic clip does not turn or say the
 * phrase, so its challenge scores low with `word_match: false`.
 */
function buildChallengePromptResult(
  session: SessionRecord,
  body: SubmitResponseRequest,
): PromptResult {
  const isReal = session.profile === "real";
  return {
    index: body.prompt_index,
    liveness_score: Number(
      (isReal
        ? jitter(Math.max(0.85, body.landmark_motion_score), 0.05)
        : jitter(0.2, 0.05)
      ).toFixed(2),
    ),
    frame_score: Number(jitter(isReal ? 0.9 : 0.6, 0.04).toFixed(2)),
    voice_score: body.audio_clip
      ? Number(jitter(isReal ? 0.85 : 0.22, 0.05).toFixed(2))
      : null,
    word_match: body.audio_clip ? isReal : null,
    latency_ms: Math.round(700 + Math.random() * 600),
  };
}

/** Section 12.6: the challenge fails on low liveness or a word mismatch. */
function challengeFailed(
  summary: CompletedPromptSummary,
  thresholds: Thresholds,
): boolean {
  return (
    summary.liveness_score < thresholds.decision || summary.word_match === false
  );
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
    const scenario = body.scenario ?? "ats_interview";
    const plan = getPromptPlan(scenario);

    const session: SessionRecord = {
      session_id: sessionId,
      created_at: new Date().toISOString(),
      candidate_id: candidateId,
      scenario,
      enabled_modules: enabledModules,
      status: "awaiting_start",
      nextPromptIndex: 0,
      completedPrompts: [],
      rollingResult: null,
      challenge:
        scenario === "video_call"
          ? {
              state: "none",
              source: null,
              prompt_index: null,
              auto_index: pickRandom(AUTO_CHALLENGE_SLOTS),
            }
          : null,
      challengePrompt: null,
      result: null,
      profile: pickProfile(candidateId),
    };
    saveSession(session);

    const response: StartSessionResponse = {
      session_id: sessionId,
      created_at: session.created_at,
      scenario,
      total_prompts: plan.length,
      enabled_modules: enabledModules,
      prompt: plan[0],
    };
    return HttpResponse.json(response);
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

    const prompt = sessionPlan(session)[session.nextPromptIndex];
    let promptResult: PromptResult;
    let warnings: string[] = [];
    if (prompt.kind === "passive") {
      ({ promptResult, warnings } = await buildPassivePromptResult(session, body));
      // A request-challenge call can land during the await above. Keep it.
      session.challenge = loadSession(session.session_id)?.challenge ?? session.challenge;
    } else if (prompt.kind === "challenge") {
      promptResult = buildChallengePromptResult(session, body);
    } else {
      promptResult = buildPromptResult(session, body.prompt_index, body);
    }
    session.completedPrompts.push({
      kind: prompt.kind,
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

    if (prompt.kind === "challenge" && session.challenge) {
      const summary = session.completedPrompts.at(-1)!;
      session.challenge = {
        ...session.challenge,
        state: challengeFailed(summary, MOCK_THRESHOLDS) ? "failed" : "passed",
      };
    }
    if (session.scenario === "video_call") {
      session.rollingResult = buildRollingResult(session);
      activateChallengeFor(session, session.nextPromptIndex + 1);
    }

    const plan = sessionPlan(session);
    const isLastPrompt = session.nextPromptIndex >= plan.length;

    if (!isLastPrompt) {
      session.status = "in_progress";
      saveSession(session);
      const response: SubmitResponseResponse = {
        session_id: session.session_id,
        status: "in_progress",
        accepted: true,
        prompt_result: promptResult,
        next_prompt: plan[session.nextPromptIndex],
        warnings,
      };
      return HttpResponse.json(response);
    }

    if (session.scenario === "video_call") {
      // Section 12.5: the last rolling result becomes the final result.
      session.result = session.rollingResult;
    } else {
      // Report "scoring" to session-status while we "run the model".
      session.status = "scoring";
      saveSession(session);
      await sleep(SCORING_DELAY_MS);
      session.result = buildResult(session);
    }
    session.status = "complete";
    saveSession(session);

    const response: SubmitResponseResponse = {
      session_id: session.session_id,
      status: "complete",
      accepted: true,
      prompt_result: promptResult,
      next_prompt: null,
      warnings,
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

    const plan = getPromptPlan(session.scenario);
    const response: SessionStatusResponse = {
      session_id: session.session_id,
      scenario: session.scenario,
      status: session.status,
      current_prompt_index: Math.min(session.nextPromptIndex + 1, plan.length),
      total_prompts: plan.length,
      enabled_modules: session.enabled_modules,
      completed_prompts: session.completedPrompts,
      rolling_result: session.rollingResult,
      challenge: session.challenge,
      result: session.result,
    };
    return HttpResponse.json(response);
  }),

  // -------------------------------------------------------------------------
  // POST /request-challenge. Section 13 of ui-contract.md.
  // -------------------------------------------------------------------------
  http.post("/api/request-challenge", async ({ request }) => {
    const body = (await request.json()) as RequestChallengeRequest;
    const session = loadSession(body.session_id);

    if (!session) {
      return HttpResponse.json(
        errorBody("SESSION_NOT_FOUND", "No session exists with this ID."),
        { status: 404 },
      );
    }
    if (session.status === "complete") {
      return HttpResponse.json(
        errorBody("SESSION_ALREADY_COMPLETE", "The call is over."),
        { status: 409 },
      );
    }
    if (session.scenario !== "video_call" || !session.challenge) {
      return HttpResponse.json(
        errorBody(
          "CHALLENGE_NOT_SUPPORTED",
          "Challenges exist only in a video call session.",
        ),
        { status: 409 },
      );
    }
    if (session.challenge.state !== "none") {
      return HttpResponse.json(
        errorBody(
          "CHALLENGE_ALREADY_ISSUED",
          "This call already holds a challenge. A call holds one at most.",
        ),
        { status: 409 },
      );
    }
    const currentSlot = session.nextPromptIndex + 1;
    if (currentSlot >= CALL_SLOT_COUNT) {
      return HttpResponse.json(
        errorBody(
          "CHALLENGE_TOO_LATE",
          "The call is on its last window. No window remains for a challenge.",
        ),
        { status: 409 },
      );
    }

    // An operator challenge takes the next slot and cancels the auto one.
    session.challenge = {
      state: "queued",
      source: "operator",
      prompt_index: currentSlot + 1,
      auto_index: null,
    };
    saveSession(session);

    const response: RequestChallengeResponse = {
      session_id: session.session_id,
      challenge: session.challenge,
    };
    return HttpResponse.json(response);
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
