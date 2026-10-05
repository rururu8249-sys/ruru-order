"use client";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  help: string;
  numeric?: boolean;
  error?: string;
};

/** Shared visual treatment only; validation and price calculation remain with the caller. */
export default function CustomerManualField({id, label, value, onChange, placeholder, help, numeric = false, error = ""}: Props) {
  return (
    <div style={{ margin: "16px 0", minWidth: 0 }}>
      <label htmlFor={id} style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333", lineHeight: 1.5 }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${error ? "#C0392B" : "#D8D0D3"}`, borderRadius: "12px", background: "#fff", padding: "0 13px" }}>
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} inputMode={numeric ? "numeric" : "text"} aria-required={true} aria-invalid={Boolean(error)} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} placeholder={placeholder} style={{ minWidth: 0, width: "100%", height: "48px", border: "none", background: "transparent", fontSize: "16px", color: "#222" }} />
        {numeric ? <span style={{ flexShrink: 0, fontSize: "14px", color: "#675B61" }}>원</span> : null}
      </div>
      <div id={`${id}-help`} style={{ marginTop: "6px", fontSize: "12px", color: "#675B61", lineHeight: 1.6 }}>{help}</div>
      {error ? <div id={`${id}-error`} role="alert" data-order-option-missing="true" style={{ marginTop: "5px", fontSize: "12px", color: "#C0392B", fontWeight: 700 }}>{error}</div> : null}
    </div>
  );
}
