"use client";

import { useState } from "react";

import JsonEditor from "@/components/JsonEditor";
import { sendRequest } from "@/lib/apiClient";
import { setToken } from "@/lib/tokenStore";
import type { ApiResult } from "@/types/api";

/** Real backend auth endpoints (see identity controllers). */
const AUTH_ACTIONS = [
  {
    id: "register-admin",
    label: "Register org admin",
    method: "POST" as const,
    path: "/auth/register-admin",
    withAuth: false,
    body: JSON.stringify(
      {
        name: "Demo Admin",
        email: "admin@example.com",
        password: "Password123!",
        organizationName: "Demo Organization",
        headquarterAddress: "Demo Street 1",
      },
      null,
      2,
    ),
  },
  {
    id: "login",
    label: "Login",
    method: "POST" as const,
    path: "/auth/login",
    withAuth: false,
    body: JSON.stringify(
      { email: "admin@example.com", password: "Password123!" },
      null,
      2,
    ),
  },
  {
    id: "refresh",
    label: "Refresh",
    method: "POST" as const,
    path: "/auth/refresh",
    withAuth: false,
    body: JSON.stringify({ refreshToken: "<paste-refresh-token>" }, null, 2),
  },
  {
    id: "logout",
    label: "Logout",
    method: "POST" as const,
    path: "/auth/logout",
    withAuth: true,
    body: "",
  },
];

export default function AuthPanel() {
  const [actionId, setActionId] = useState(AUTH_ACTIONS[1].id);
  const [bodyText, setBodyText] = useState(AUTH_ACTIONS[1].body);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const action = AUTH_ACTIONS.find((candidate) => candidate.id === actionId)!;

  const selectAction = (id: string) => {
    const next = AUTH_ACTIONS.find((candidate) => candidate.id === id)!;
    setActionId(id);
    setBodyText(next.body);
    setResult(null);
    setTokenSaved(false);
    setInputError(null);
  };

  const send = async () => {
    setSending(true);
    setInputError(null);
    setTokenSaved(false);
    try {
      const outcome = await sendRequest({
        method: action.method,
        path: action.path,
        bodyText,
        withAuth: action.withAuth,
      });
      setResult(outcome.result);
      // Login/refresh responses carry the access token in the JSON body; the
      // refresh token stays wherever the user keeps it (JSON flow, no cookies).
      const json = outcome.result.json;
      if (
        outcome.result.ok &&
        json !== null &&
        typeof json === "object" &&
        "accessToken" in (json as Record<string, unknown>)
      ) {
        setToken(String((json as Record<string, unknown>).accessToken));
        setTokenSaved(true);
      }
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel">
      <h2>Auth</h2>
      <div className="row wrap">
        {AUTH_ACTIONS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className={candidate.id === actionId ? "" : "ghost"}
            onClick={() => selectAction(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <p className="hint mono">
        {action.method} {action.path}
      </p>
      {action.body !== "" ? (
        <JsonEditor value={bodyText} onChange={setBodyText} rows={7} />
      ) : (
        <p className="hint">No request body; uses the stored Bearer token.</p>
      )}
      {inputError && <p className="error-text">{inputError}</p>}
      <button type="button" onClick={() => void send()} disabled={sending}>
        {sending ? "Sending…" : "Send"}
      </button>
      {result && (
        <>
          <p>
            <span className={`badge ${result.ok ? "badge-ok" : "badge-fail"}`}>
              {result.networkError ? "ERROR" : result.status}
            </span>
            {tokenSaved && <span className="token-present"> access token saved ✓</span>}
          </p>
          <pre className="mono block response-body">
            {result.networkError ??
              (result.json !== null
                ? JSON.stringify(result.json, null, 2)
                : result.bodyText || "(empty body)")}
          </pre>
        </>
      )}
    </section>
  );
}
