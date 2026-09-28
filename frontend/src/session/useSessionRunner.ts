import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApiError } from "@/api/client";
import { useSubmitResponse } from "@/api/queries";
import type { CaptureMeta } from "@/api/types";
import { useAudioRecorder, type RecordedAudio } from "@/capture/useAudioRecorder";
import { useFaceLandmarker } from "@/capture/useFaceLandmarker";
import { useFrameSampler } from "@/capture/useFrameSampler";
import { useVideoSource, type VideoSourceType } from "@/capture/useVideoSource";
import { readSessionBootstrap } from "@/lib/sessionBootstrap";
import {
  FRAME_SAMPLE_TIMING_1,
  FRAME_SAMPLE_TIMING_2,
  GOOD_FRAMES_FOR_CALIBRATION,
} from "@/scoring/constants";
import { getScorerForPrompt } from "@/scoring/registry";
import type { LandmarkWindow } from "@/scoring/types";
import { initialSessionState, sessionReducer } from "./machine";
import { getPromptPresentation } from "./presentation";

const EMPTY_WINDOW: LandmarkWindow = {
  samples: [],
  framesAnalyzed: 0,
  trackingLossRatio: 1,
};

/**
 * Drives the session machine from `session/machine.ts`. Calls the API.
 * Collects the score, the frames, and the audio clip for each prompt.
 *
 * Milestone 4: two real sampled frames and a real recorded audio clip
 * (when the prompt has an expected word) go into every
 * `POST /submit-response` call. Section 6.4 and 6.5 of frontend-handoff.md.
 *
 * Milestone 6: `sourceType` picks the webcam or the prepared MP4 clip of
 * the synthetic candidate (Section 6.3). A file source records the clip's
 * own playback audio (`videoSource.audioStream`), so voice prompts carry
 * an audio clip for both source types.
 */
export function useSessionRunner(
  sessionId: string,
  sourceType: VideoSourceType = "webcam",
) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSource = useVideoSource(sourceType, videoRef);
  const submitResponse = useSubmitResponse();
  const landmarker = useFaceLandmarker(videoRef);
  const frameSampler = useFrameSampler(videoRef);
  const audioRecorder = useAudioRecorder();
  const promptStartedAtRef = useRef<number>(0);
  const pendingWindowRef = useRef<LandmarkWindow>(EMPTY_WINDOW);
  const pendingFramesRef = useRef<string[]>([]);
  const pendingAudioRef = useRef<RecordedAudio | null>(null);
  const isRecordingAudioRef = useRef(false);

  const start = useCallback(() => {
    dispatch({ type: "START", sessionId });
  }, [sessionId]);

  // idle -> requesting_permission: ask the browser for the camera.
  useEffect(() => {
    if (state.status !== "requesting_permission") return;
    let cancelled = false;
    videoSource.requestAccess().then((result) => {
      if (cancelled) return;
      if (result.granted) {
        dispatch({ type: "PERMISSION_GRANTED" });
      } else {
        dispatch({ type: "FATAL_ERROR", message: result.error });
      }
    });
    return () => {
      cancelled = true;
    };
    // videoSource.requestAccess is stable (useCallback with no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // calibrating -> wait for 5 good frames from the landmarker, then read
  // the first prompt the launcher stored. Section 7 of frontend-handoff.md.
  useEffect(() => {
    if (state.status !== "calibrating") return;
    if (landmarker.snapshot.consecutiveGoodFrames < GOOD_FRAMES_FOR_CALIBRATION) {
      return;
    }
    const bootstrap = readSessionBootstrap(sessionId);
    if (!bootstrap) {
      dispatch({
        type: "FATAL_ERROR",
        message:
          "No session data found on this device. Open this link from the launcher.",
      });
      return;
    }
    dispatch({
      type: "CALIBRATED",
      prompt: bootstrap.firstPrompt,
      totalPrompts: bootstrap.totalPrompts,
    });
  }, [state.status, landmarker.snapshot.consecutiveGoodFrames, sessionId]);

  const presentation = state.currentPrompt
    ? getPromptPresentation(state.currentPrompt)
    : null;

  // prompt_shown -> the prompt's lead-in (0 for a passive window), then record.
  useEffect(() => {
    if (state.status !== "prompt_shown" || !state.currentPrompt) return;
    const timer = setTimeout(
      () => dispatch({ type: "LEAD_IN_COMPLETE" }),
      getPromptPresentation(state.currentPrompt).leadInMs,
    );
    return () => clearTimeout(timer);
  }, [state.status, state.currentPrompt]);

  // recording -> run for prompt.duration_ms. Capture landmark samples for
  // the whole window, two sampled frames at 40% and 80% of the window, and
  // an audio clip when the prompt has an expected word. Then upload.
  useEffect(() => {
    if (state.status !== "recording" || !state.currentPrompt) return;
    const prompt = state.currentPrompt;
    promptStartedAtRef.current = Date.now();
    landmarker.beginRecording();
    pendingFramesRef.current = [];

    const shouldRecordAudio = getPromptPresentation(prompt).recordsAudio;
    isRecordingAudioRef.current =
      shouldRecordAudio && videoSource.audioStream
        ? audioRecorder.startRecording(videoSource.audioStream)
        : false;

    const frameTimer1 = setTimeout(() => {
      const frame = frameSampler.captureFrame();
      if (frame) pendingFramesRef.current.push(frame);
    }, prompt.duration_ms * FRAME_SAMPLE_TIMING_1);

    const frameTimer2 = setTimeout(() => {
      const frame = frameSampler.captureFrame();
      if (frame) pendingFramesRef.current.push(frame);
    }, prompt.duration_ms * FRAME_SAMPLE_TIMING_2);

    const endTimer = setTimeout(async () => {
      pendingWindowRef.current = landmarker.endRecording();
      pendingAudioRef.current = isRecordingAudioRef.current
        ? await audioRecorder.stopRecording()
        : null;
      dispatch({ type: "RECORDING_COMPLETE" });
    }, prompt.duration_ms);

    return () => {
      clearTimeout(frameTimer1);
      clearTimeout(frameTimer2);
      clearTimeout(endTimer);
    };
    // landmarker/frameSampler/audioRecorder methods are stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.currentPrompt]);

  // uploading -> score the window, then POST /submit-response.
  useEffect(() => {
    if (state.status !== "uploading" || !state.currentPrompt || !state.sessionId) {
      return;
    }
    const prompt = state.currentPrompt;
    const sessionIdForUpload = state.sessionId;

    let scoreResult;
    try {
      const scorer = getScorerForPrompt(prompt);
      scoreResult = scorer(pendingWindowRef.current);
    } catch (err) {
      dispatch({
        type: "FATAL_ERROR",
        message:
          err instanceof Error
            ? err.message
            : `No scorer for prompt type "${prompt.type}".`,
      });
      return;
    }

    // Read dimensions from the video element itself, not from a
    // MediaStreamTrack — the element is the one thing both source types
    // (webcam and file) always have. Section 6.3 of frontend-handoff.md.
    const window = pendingWindowRef.current;
    const captureMeta: CaptureMeta = {
      duration_ms: Date.now() - promptStartedAtRef.current,
      video_width: videoRef.current?.videoWidth || 640,
      video_height: videoRef.current?.videoHeight || 480,
      landmarker_fps:
        window.framesAnalyzed > 0
          ? Number(
              (
                (window.framesAnalyzed / captureDurationSeconds(window)) || 0
              ).toFixed(1),
            )
          : 0,
    };

    const audio = pendingAudioRef.current;

    let cancelled = false;
    submitResponse
      .mutateAsync({
        session_id: sessionIdForUpload,
        prompt_index: prompt.index,
        prompt_type: prompt.type,
        landmark_motion_score: scoreResult.score,
        motion_detail: scoreResult.detail,
        frames: pendingFramesRef.current,
        audio_clip: audio?.audioBase64 ?? null,
        audio_mime: audio?.mimeType ?? "",
        capture_meta: captureMeta,
      })
      .then((response) => {
        if (cancelled) return;
        dispatch({
          type: "UPLOAD_SUCCESS",
          result: response.prompt_result,
          nextPrompt: response.next_prompt,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.code === "AUDIO_TOO_SHORT") {
          dispatch({
            type: "RETRY_PROMPT",
            message:
              "We could not hear one full second of speech. Say the complete phrase clearly; recording will restart.",
          });
          return;
        }
        dispatch({
          type: "FATAL_ERROR",
          message: error instanceof Error ? error.message : "Upload failed.",
        });
      });
    return () => {
      cancelled = true;
    };
    // submitResponse.mutateAsync is stable across renders in practice here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // next_prompt is transient: show the new prompt immediately.
  useEffect(() => {
    if (state.status !== "next_prompt") return;
    dispatch({ type: "SHOW_NEXT_PROMPT" });
  }, [state.status]);

  return { state, presentation, videoSource, videoRef, landmarker, start };
}

function captureDurationSeconds(window: LandmarkWindow): number {
  if (window.samples.length < 2) return 0;
  const first = window.samples[0].t;
  const last = window.samples.at(-1)!.t;
  return (last - first) / 1000;
}
