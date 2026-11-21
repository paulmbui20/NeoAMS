// src/lib/api/client.ts
// The one place that talks to the API.
//
// The web app and the API share an origin, so the session cookie goes
// along by itself: `credentials: "include"` and no token handling.

/** The shape of every error the API sends. */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

/** An error thrown by the client, carrying the API's own code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The message for the person at the desk, not for the developer. */
  get friendly(): string {
    return this.message;
  }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Skip the JSON parse, for a file download. */
  raw?: boolean;
};

/** The base of the API. On the same origin it is simply `/api/v1`. */
export const API_BASE = "/api/v1";

/**
 * Build the URL of a request.
 *
 * A path that starts with `/api/` is used as it is: the authentication
 * endpoints live outside the versioned base (`/api/auth/sign-in/email`),
 * and the web app has to be able to reach them.
 */
function buildUrl(path: string, query?: RequestOptions["query"]): string {
  let url: string;
  if (path.startsWith("/api/")) {
    url = path;
  } else if (path.startsWith("/")) {
    url = `${API_BASE}${path}`;
  } else {
    url = `${API_BASE}/${path}`;
  }
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Make a request and return the parsed body.
 * A non-2xx answer becomes an `ApiError`, so a caller never has to check
 * the status itself.
 */
export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query, signal, raw } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  const formBody =
    typeof FormData !== "undefined" && body instanceof FormData
      ? body
      : undefined;
  if (body !== undefined && formBody === undefined)
    headers["Content-Type"] = "application/json";
  const requestBody: BodyInit | undefined =
    formBody ?? (body === undefined ? undefined : JSON.stringify(body));

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      credentials: "include",
      body: requestBody,
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "The server could not be reached. Check the connection and try again.",
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      if (!raw) parsed = text;
    }
  }

  if (!response.ok) {
    const errorBody = parsed as ApiErrorBody | undefined;
    const error = errorBody?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNEXPECTED",
      error?.message ?? `The request failed (${response.status})`,
      error?.details,
      error?.requestId,
    );
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};
