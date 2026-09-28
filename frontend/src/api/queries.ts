import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { apiRequest, ApiError } from "./client";
import type {
  GetResultResponse,
  RequestChallengeResponse,
  SessionStatusResponse,
  StartSessionRequest,
  StartSessionResponse,
  SubmitResponseRequest,
  SubmitResponseResponse,
} from "./types";

/** POST /start-session. Called by the operator surface only. */
export function useStartSession() {
  return useMutation({
    mutationFn: (body: StartSessionRequest = {}) =>
      apiRequest<StartSessionResponse>("/start-session", {
        method: "POST",
        body,
      }),
  });
}

/** POST /submit-response. Called by the candidate surface, once for each prompt. */
export function useSubmitResponse() {
  return useMutation({
    mutationFn: (body: SubmitResponseRequest) =>
      apiRequest<SubmitResponseResponse>("/submit-response", {
        method: "POST",
        body,
      }),
  });
}

/**
 * POST /request-challenge. Called by the operator surface only. Section 13
 * of ui-contract.md. Refetches the session status on success, so the
 * console shows the queued challenge at once, not on the next poll.
 */
export function useRequestChallenge(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<RequestChallengeResponse>("/request-challenge", {
        method: "POST",
        body: { session_id: sessionId },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["session-status", sessionId] }),
  });
}

/**
 * GET /session-status. The operator surface polls this once each second.
 * Section 6 of ui-contract.md.
 */
export function useSessionStatus(
  sessionId: string,
  options: Partial<UseQueryOptions<SessionStatusResponse>> = {},
) {
  return useQuery({
    queryKey: ["session-status", sessionId],
    queryFn: () =>
      apiRequest<SessionStatusResponse>("/session-status", {
        searchParams: { session_id: sessionId },
      }),
    refetchInterval: 1000,
    enabled: Boolean(sessionId),
    ...options,
  });
}

/**
 * GET /get-result. The frontend calls this after `session-status` (or
 * `submit-response`) reports `status: "complete"`.
 * Retries a `409 RESULT_NOT_READY` response. Does not retry any other error.
 */
export function useGetResult(
  sessionId: string,
  options: Partial<UseQueryOptions<GetResultResponse>> = {},
) {
  return useQuery({
    queryKey: ["get-result", sessionId],
    queryFn: () =>
      apiRequest<GetResultResponse>("/get-result", {
        searchParams: { session_id: sessionId },
      }),
    enabled: Boolean(sessionId),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.code === "RESULT_NOT_READY") {
        return failureCount < 10;
      }
      return false;
    },
    retryDelay: 500,
    ...options,
  });
}
