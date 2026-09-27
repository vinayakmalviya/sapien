import { useCallback, useEffect, useReducer, useRef } from "react";
import { useSubmitResponse } from "@/api/queries";
import type { CaptureMeta, MotionDetail } from "@/api/types";
import { useMediaStream } from "@/capture/useMediaStream";
import { readSessionBootstrap } from "@/lib/sessionBootstrap";
import { initialSessionState, sessionReducer } from "./machine";

/**
 * Milestone 2 sends a fixed score. Milestone 3 replaces this with the real
 * scorer registry, driven by `useFaceLandmarker`.
 */
const MOCK_LANDMARK_MOTION_SCORE = 0.9;

/** Milestone 3 fills every field from real landmarker measurements. */
const PLACEHOLDER_MOTION_DETAIL: MotionDetail = {
  yaw_peak_degrees: 0,
  yaw_direction: "none",
  nose_dx_normalized: 0,
  jaw_open_variance: 0,
  blink_count: 0,
  frames_analyzed: 0,
  tracking_loss_ratio: 0,
};

/** The lead-in before recording starts. Section 7 of frontend-handoff.md. */
const LEAD_IN_MS = 2000;

/**
 * Milestone 2 fakes the "5 good frames" check with a fixed delay.
 * Milestone 3 replaces this with a real calibration check from
 * `useFaceLandmarker`.
 */
const CALIBRATION_MS = 900;

/**
 * Drives the session machine from `session/machine.ts`. Calls the API.
 * Collects the score, the frames, and the audio clip for each prompt.
 *
 * Milestone 2: the frames array is empty and the audio clip is null.
 * Milestone 4 adds `useFrameSampler` and `useAudioRecorder` here.
 */
export function useSessionRunner(sessionId: string) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const mediaStream = useMediaStream();
  const submitResponse = useSubmitResponse();
  const videoRef = useRef<HTMLVideoElement>(null);
  const promptStartedAtRef = useRef<number>(0);

  const start = useCallback(() => {
    dispatch({ type: "START", sessionId });
  }, [sessionId]);

  // idle -> requesting_permission: ask the browser for the camera.
  useEffect(() => {
    if (state.status !== "requesting_permission") return;
    let cancelled = false;
    mediaStream.requestAccess().then((granted) => {
      if (cancelled) return;
      if (granted) {
        dispatch({ type: "PERMISSION_GRANTED" });
      } else {
        dispatch({
          type: "FATAL_ERROR",
          message: mediaStream.error ?? "Camera access was denied.",
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // mediaStream.requestAccess is stable (useCallback with no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // calibrating -> wait, then read the first prompt the launcher stored.
  useEffect(() => {
    if (state.status !== "calibrating") return;
    const timer = setTimeout(() => {
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
    }, CALIBRATION_MS);
    return () => clearTimeout(timer);
  }, [state.status, sessionId]);

  // prompt_shown -> a 2-second lead-in, then start recording.
  useEffect(() => {
    if (state.status !== "prompt_shown") return;
    const timer = setTimeout(
      () => dispatch({ type: "LEAD_IN_COMPLETE" }),
      LEAD_IN_MS,
    );
    return () => clearTimeout(timer);
  }, [state.status]);

  // recording -> run for prompt.duration_ms, then upload.
  useEffect(() => {
    if (state.status !== "recording" || !state.currentPrompt) return;
    promptStartedAtRef.current = Date.now();
    const timer = setTimeout(
      () => dispatch({ type: "RECORDING_COMPLETE" }),
      state.currentPrompt.duration_ms,
    );
    return () => clearTimeout(timer);
  }, [state.status, state.currentPrompt]);

  // uploading -> POST /submit-response.
  useEffect(() => {
    if (state.status !== "uploading" || !state.currentPrompt || !state.sessionId) {
      return;
    }
    const prompt = state.currentPrompt;
    const sessionIdForUpload = state.sessionId;
    const videoTrack = mediaStream.stream?.getVideoTracks()[0];
    const settings = videoTrack?.getSettings();
    const captureMeta: CaptureMeta = {
      duration_ms: Date.now() - promptStartedAtRef.current,
      video_width: settings?.width ?? 640,
      video_height: settings?.height ?? 480,
      landmarker_fps: 0, // Milestone 3 fills this in.
    };

    let cancelled = false;
    submitResponse
      .mutateAsync({
        session_id: sessionIdForUpload,
        prompt_index: prompt.index,
        prompt_type: prompt.type,
        landmark_motion_score: MOCK_LANDMARK_MOTION_SCORE,
        motion_detail: PLACEHOLDER_MOTION_DETAIL,
        frames: [], // Milestone 4 adds the sampled frames.
        audio_clip: null, // Milestone 4 adds the recorded clip.
        audio_mime: "",
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

  return { state, mediaStream, videoRef, start };
}
