"use client";

import { useCallback, useEffect, useState } from "react";

import { API_BASE_URL, sendRequest } from "@/lib/apiClient";

type HealthState = "UNKNOWN" | "UP" | "DOWN" | "ERROR";

export default function BackendHealthCard() {
  const [state, setState] = useState<HealthState>("UNKNOWN");
  const [rawBody, setRawBody] = useState("");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const { result } = await sendRequest({
        method: "GET",
        path: "/actuator/health",
        bodyText: "",
        withAuth: false,
      });
      if (result.networkError) {
        setState("ERROR");
        setRawBody(result.networkError);
      } else {
        const status =
          result.json !== null &&
          typeof result.json === "object" &&
          "status" in (result.json as Record<string, unknown>)
            ? String((result.json as Record<string, unknown>).status)
            : null;
        setState(status === "UP" ? "UP" : "DOWN");
        setRawBody(result.bodyText);
      }
    } finally {
      setCheckedAt(new Date().toLocaleTimeString());
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <section className="panel">
      <h2>Backend Health</h2>
      <p>
        Base URL: <code>{API_BASE_URL}</code>
      </p>
      <p>
        Status:{" "}
        <span className={`badge health-${state.toLowerCase()}`}>{state}</span>
        {checkedAt && <span className="hint"> last checked {checkedAt}</span>}
      </p>
      <pre className="mono block">{rawBody || "(no response yet)"}</pre>
      <button type="button" onClick={() => void check()} disabled={checking}>
        {checking ? "Checking…" : "Refresh"}
      </button>
    </section>
  );
}
