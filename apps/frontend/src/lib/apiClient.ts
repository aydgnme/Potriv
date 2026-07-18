import type { ApiResult, HttpMethod, SentRequest } from "@/types/api";
import { getToken } from "@/lib/tokenStore";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

const MASKED_TOKEN = "<ACCESS_TOKEN>";

/**
 * Normalizes a user-entered path against the configured base URL. Full URLs
 * are rejected so the console never accidentally calls a foreign origin.
 */
export function normalizePath(rawPath: string): string {
  const path = rawPath.trim();
  if (path.length === 0) {
    throw new Error("Path is required, e.g. /projects/managed");
  }
  if (/^https?:\/\//i.test(path)) {
    throw new Error(
      `Full URLs are not allowed. Enter a path relative to ${API_BASE_URL}, e.g. /projects/managed`,
    );
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function methodAllowsBody(method: HttpMethod): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH";
}

export interface SendOptions {
  method: HttpMethod;
  path: string;
  bodyText: string;
  withAuth: boolean;
}

/** Sends a real request to the backend and normalizes the outcome. */
export async function sendRequest(options: SendOptions): Promise<{
  request: SentRequest;
  result: ApiResult;
}> {
  const path = normalizePath(options.path);
  const url = `${API_BASE_URL}${path}`;

  const hasBody =
    methodAllowsBody(options.method) && options.bodyText.trim().length > 0;
  if (hasBody) {
    try {
      JSON.parse(options.bodyText);
    } catch {
      throw new Error("Request body is not valid JSON.");
    }
  }

  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  if (options.withAuth) {
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const request: SentRequest = {
    method: options.method,
    path,
    url,
    bodyText: hasBody ? options.bodyText : null,
    withAuth: options.withAuth,
  };

  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method: options.method,
      headers,
      body: hasBody ? options.bodyText : undefined,
    });
    const bodyText = await response.text();
    let json: unknown | null = null;
    try {
      json = bodyText.length > 0 ? JSON.parse(bodyText) : null;
    } catch {
      json = null;
    }
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    return {
      request,
      result: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        bodyText,
        json,
        durationMs: Math.round(performance.now() - startedAt),
        networkError: null,
      },
    };
  } catch (error) {
    return {
      request,
      result: {
        ok: false,
        status: 0,
        statusText: "",
        headers: {},
        bodyText: "",
        json: null,
        durationMs: Math.round(performance.now() - startedAt),
        networkError:
          error instanceof Error ? error.message : "Network request failed",
      },
    };
  }
}

/** Builds an equivalent curl command; the token is masked unless revealed. */
export function buildCurl(request: SentRequest, revealToken: boolean): string {
  const parts: string[] = [`curl -X ${request.method} '${request.url}'`];
  if (request.withAuth) {
    const token = revealToken ? getToken() ?? MASKED_TOKEN : MASKED_TOKEN;
    parts.push(`-H 'Authorization: Bearer ${token}'`);
  }
  if (request.bodyText !== null) {
    parts.push(`-H 'Content-Type: application/json'`);
    parts.push(`-d '${request.bodyText.replace(/'/g, `'\\''`)}'`);
  }
  return parts.join(" \\\n  ");
}
