"use client";

import { useEffect, useState } from "react";

import { clearToken, getToken, maskToken, setToken, subscribe } from "@/lib/tokenStore";

export default function TokenPanel() {
  const [stored, setStored] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setStored(getToken());
    return subscribe(() => setStored(getToken()));
  }, []);

  return (
    <section className="panel">
      <h2>Access Token</h2>
      {stored ? (
        <p className="token-state token-present">
          Token stored: <code>{maskToken(stored)}</code>
        </p>
      ) : (
        <p className="token-state token-missing">No token stored — requests go out unauthenticated.</p>
      )}
      <textarea
        className="mono"
        rows={3}
        placeholder="Paste access token…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="row">
        <button
          type="button"
          onClick={() => {
            setToken(draft);
            setDraft("");
          }}
          disabled={draft.trim().length === 0}
        >
          Save token
        </button>
        <button type="button" className="danger" onClick={() => clearToken()} disabled={!stored}>
          Clear token
        </button>
      </div>
      <p className="hint">
        Stored in localStorage for dev convenience and sent as{" "}
        <code>Authorization: Bearer …</code> when auth is enabled.
      </p>
    </section>
  );
}
