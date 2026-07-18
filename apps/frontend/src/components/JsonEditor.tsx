"use client";

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

/** Monospace JSON textarea with a live validity hint. */
export default function JsonEditor({ value, onChange, rows = 10, placeholder }: JsonEditorProps) {
  let validity: "empty" | "valid" | "invalid" = "empty";
  if (value.trim().length > 0) {
    try {
      JSON.parse(value);
      validity = "valid";
    } catch {
      validity = "invalid";
    }
  }

  return (
    <div>
      <textarea
        className="mono"
        rows={rows}
        value={value}
        placeholder={placeholder ?? "{ }"}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
      {validity === "invalid" && <p className="error-text">Body is not valid JSON.</p>}
    </div>
  );
}
