"use client";

import { useEffect, useState } from "react";

import JsonEditor from "@/components/JsonEditor";
import ResponseViewer from "@/components/ResponseViewer";
import { API_BASE_URL, sendRequest } from "@/lib/apiClient";
import type { ApiResult, EndpointPreset, HttpMethod, SentRequest } from "@/types/api";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

interface ApiConsoleProps {
  preset: EndpointPreset | null;
}

export default function ApiConsole({ preset }: ApiConsoleProps) {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [path, setPath] = useState("/actuator/health");
  const [bodyText, setBodyText] = useState("");
  const [withAuth, setWithAuth] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<SentRequest | null>(null);
  const [lastResult, setLastResult] = useState<ApiResult | null>(null);

  // A selected preset fills the form; nothing is sent automatically.
  useEffect(() => {
    if (preset) {
      setMethod(preset.method);
      setPath(preset.path);
      setBodyText(preset.body ?? "");
      setWithAuth(preset.authRequired);
      setInputError(null);
    }
  }, [preset]);

  const bodyAllowed = method === "POST" || method === "PUT" || method === "PATCH";

  const send = async () => {
    setSending(true);
    setInputError(null);
    try {
      const outcome = await sendRequest({
        method,
        path,
        bodyText: bodyAllowed ? bodyText : "",
        withAuth,
      });
      setLastRequest(outcome.request);
      setLastResult(outcome.result);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section className="panel">
        <h2>API Console</h2>
        {preset && (
          <p className="hint">
            Preset: <strong>{preset.name}</strong> — {preset.description}
            {preset.role && (
              <>
                {" "}
                (expected role: <code>{preset.role}</code>)
              </>
            )}
          </p>
        )}
        <div className="row">
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as HttpMethod)}
            aria-label="HTTP method"
          >
            {METHODS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <input
            className="mono path-input"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/projects/managed"
            aria-label="Request path"
          />
        </div>
        <p className="hint">
          Sends to <code>{API_BASE_URL}</code> + path. Full URLs are rejected.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={withAuth}
            onChange={(event) => setWithAuth(event.target.checked)}
          />
          send with Bearer token
        </label>
        {bodyAllowed ? (
          <JsonEditor value={bodyText} onChange={setBodyText} />
        ) : (
          <p className="hint">No request body for {method}.</p>
        )}
        {inputError && <p className="error-text">{inputError}</p>}
        <button type="button" onClick={() => void send()} disabled={sending}>
          {sending ? "Sending…" : "Send request"}
        </button>
      </section>
      <ResponseViewer request={lastRequest} result={lastResult} />
    </>
  );
}
