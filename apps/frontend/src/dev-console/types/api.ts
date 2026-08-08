export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** The request as the console sent it (used for curl generation and display). */
export interface SentRequest {
  method: HttpMethod;
  path: string;
  url: string;
  bodyText: string | null;
  withAuth: boolean;
}

/** Normalized result of a backend call, JSON or not. */
export interface ApiResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
  json: unknown | null;
  durationMs: number;
  networkError: string | null;
}

export interface EndpointPreset {
  id: string;
  group: string;
  name: string;
  method: HttpMethod;
  path: string;
  body?: string;
  description: string;
  authRequired: boolean;
  role?: string;
}
