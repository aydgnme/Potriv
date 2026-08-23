"use client";

import { useState } from "react";

import ApiConsole from "@/dev-console/components/ApiConsole";
import AuthPanel from "@/dev-console/components/AuthPanel";
import BackendHealthCard from "@/dev-console/components/BackendHealthCard";
import EndpointPresetList from "@/dev-console/components/EndpointPresetList";
import TokenPanel from "@/dev-console/components/TokenPanel";
import type { EndpointPreset } from "@/dev-console/types/api";

export default function ConsolePage() {
  const [preset, setPreset] = useState<EndpointPreset | null>(null);

  return (
    <div className="layout">
      <div className="column">
        <TokenPanel />
        <AuthPanel />
        <EndpointPresetList
          onSelect={(selected) => setPreset(selected)}
          selectedId={preset?.id ?? null}
        />
      </div>
      <div className="column">
        <BackendHealthCard />
        <ApiConsole preset={preset} />
      </div>
    </div>
  );
}
