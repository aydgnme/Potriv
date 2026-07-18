"use client";

import { ENDPOINT_PRESETS } from "@/lib/endpointPresets";
import type { EndpointPreset } from "@/types/api";

interface EndpointPresetListProps {
  onSelect: (preset: EndpointPreset) => void;
  selectedId: string | null;
}

export default function EndpointPresetList({ onSelect, selectedId }: EndpointPresetListProps) {
  const groups = Array.from(new Set(ENDPOINT_PRESETS.map((preset) => preset.group)));

  return (
    <section className="panel">
      <h2>Endpoint Presets</h2>
      <p className="hint">
        Selecting a preset only fills the console — review it, replace{" "}
        <code>{"{placeholders}"}</code>, then send manually.
      </p>
      {groups.map((group) => (
        <div key={group} className="preset-group">
          <h3>{group}</h3>
          <ul>
            {ENDPOINT_PRESETS.filter((preset) => preset.group === group).map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  className={`preset ${selectedId === preset.id ? "preset-selected" : ""}`}
                  onClick={() => onSelect(preset)}
                  title={preset.description}
                >
                  <span className={`method method-${preset.method.toLowerCase()}`}>
                    {preset.method}
                  </span>
                  <span className="preset-name">{preset.name}</span>
                  {preset.role && <span className="role">{preset.role}</span>}
                  {!preset.authRequired && <span className="role public">public</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
