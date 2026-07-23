"use client";

import { useState } from "react";

import { buildCurl } from "@/lib/apiClient";
import type { ApiResult, SentRequest } from "@/types/api";

interface ResponseViewerProps {
  request: SentRequest | null;
  result: ApiResult | null;
}

export default function ResponseViewer({ request, result }: ResponseViewerProps) {
  const [revealToken, setRevealToken] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  if (!request || !result) {
    return (
      <section className="panel">
        <h2>Response</h2>
        <p className="hint">No request sent yet.</p>
      </section>
    );
  }

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const prettyBody =
    result.json !== null ? JSON.stringify(result.json, null, 2) : result.bodyText;
  const headerSummary = ["content-type", "content-length", "date"]
    .map((name) => (result.headers[name] ? `${name}: ${result.headers[name]}` : null))
    .filter(Boolean)
    .join("  ·  ");

  return (
    <section className="panel">
      <h2>Response</h2>
      {result.networkError ? (
        <p className="error-text">Network error: {result.networkError}</p>
      ) : (
        <>
          <p>
            <span className={`badge ${result.ok ? "badge-ok" : "badge-fail"}`}>
              {result.ok ? "SUCCESS" : "FAILURE"}
            </span>{" "}
            <strong>
              {result.status} {result.statusText}
            </strong>
            <span className="hint"> · {result.durationMs} ms</span>
          </p>
          {headerSummary && <p className="hint mono">{headerSummary}</p>}
          <pre className="mono block response-body">
            {prettyBody.length > 0 ? prettyBody : "(empty body)"}
          </pre>
        </>
      )}
      <div className="row">
        <button
          type="button"
          onClick={() => void copy("response", prettyBody)}
          disabled={result.networkError !== null}
        >
          {copied === "response" ? "Copied!" : "Copy response"}
        </button>
        <button type="button" onClick={() => void copy("curl", buildCurl(request, revealToken))}>
          {copied === "curl" ? "Copied!" : "Copy curl"}
        </button>
        {request.withAuth && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={revealToken}
              onChange={(event) => setRevealToken(event.target.checked)}
            />
            include real token in curl
          </label>
        )}
      </div>
      <details>
        <summary className="hint">curl preview (token masked unless revealed)</summary>
        <pre className="mono block">{buildCurl(request, revealToken)}</pre>
      </details>
    </section>
  );
}
