"use client";

import { useState } from "react";

import ApiConsole from "@/components/ApiConsole";
import AuthPanel from "@/components/AuthPanel";
import BackendHealthCard from "@/components/BackendHealthCard";
import EndpointPresetList from "@/components/EndpointPresetList";
import TokenPanel from "@/components/TokenPanel";
import type { EndpointPreset } from "@/types/api";

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
