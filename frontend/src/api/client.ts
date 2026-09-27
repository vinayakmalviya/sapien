import type { ApiErrorBody, ApiErrorCode } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

/** Thrown for every failed request. Carries the machine-readable code from Section 3.4. */
export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  detail: unknown | null;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiError";
    this.code = body.error.code;
    this.status = status;
    this.detail = body.error.detail;
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  searchParams?: Record<string, string>;
}

/**
 * Thin fetch wrapper. Every API call in the app goes through this function.
 * Reads `VITE_API_BASE_URL`. Throws `ApiError` for a non-2xx response.
 */
export async function apiRequest<TResponse>(
  path: string,
  { method = "GET", body, searchParams }: RequestOptions = {},
): Promise<TResponse> {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const errorBody: ApiErrorBody = payload ?? {
      error: {
        code: "VALIDATION_ERROR",
        message: `Request to ${path} failed with status ${response.status}.`,
        detail: null,
      },
    };
    throw new ApiError(response.status, errorBody);
  }

  return payload as TResponse;
}
