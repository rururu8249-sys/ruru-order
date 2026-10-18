"use client";
import { useCustomerStageRestyle } from "@/lib/useCustomerUiStage";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  help: string;
  numeric?: boolean;
  error?: string;
  /** [㉜] 손님화면 새 모양(ui=v2) — DESIGN.md §6 입력칸(48px·모서리 24px·hairline, 오류는 빨강 테두리+13px 빨간 안내). 없으면 기존 그대로. */
  tone?: "v2";
};

/** Shared visual treatment only; validation and price calculation remain with the caller. */
export default function CustomerManualField({id, label, value, onChange, placeholder, help, numeric = false, error = "", tone}: Props) {
  // [㉜ 5단계] ?preview=s5 에서만 새 모양(로즈→흑백·13px 미만→13px·그림자 정리). 꺼지면 원래 스타일 그대로.
  const { on: v5, s: s5, c: c5 } = useCustomerStageRestyle("s5");
  const v2 = tone === "v2";
  return (
    <div style={s5({ margin: "16px 0", minWidth: 0 })}>
      <label htmlFor={id} style={s5(v2 ? { display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 600, color: "#111111", lineHeight: 1.5 } : { display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 800, color: "#333", lineHeight: 1.5 })}>{label}</label>
      <div style={s5(v2 ? { display: "flex", alignItems: "center", border: `${error ? "2px" : "1px"} solid ${error ? "#D30005" : "#CACACB"}`, borderRadius: "24px", background: "#FFFFFF", padding: "0 16px" } : { display: "flex", alignItems: "center", border: `1.5px solid ${error ? "#C0392B" : "#D8D0D3"}`, borderRadius: "12px", background: "#fff", padding: "0 13px" })}>
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} inputMode={numeric ? "numeric" : "text"} aria-required={true} aria-invalid={Boolean(error)} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} placeholder={placeholder} style={s5({ minWidth: 0, width: "100%", height: "48px", border: "none", background: "transparent", fontSize: "16px", color: "#222" })} />
        {numeric ? <span style={s5(v2 ? { flexShrink: 0, fontSize: "14px", color: "#707072" } : { flexShrink: 0, fontSize: "14px", color: "#675B61" })}>원</span> : null}
      </div>
      <div id={`${id}-help`} style={s5(v2 ? { marginTop: "6px", fontSize: "13px", color: "#707072", fontWeight: 400, lineHeight: 1.5 } : { marginTop: "6px", fontSize: "12px", color: "#B42318", fontWeight: 700, lineHeight: 1.6 })}>{help}</div>
      {error ? <div id={`${id}-error`} role="alert" data-order-option-missing="true" style={s5(v2 ? { marginTop: "5px", fontSize: "13px", color: "#D30005", fontWeight: 600 } : { marginTop: "5px", fontSize: "12px", color: "#C0392B", fontWeight: 700 })}>{error}</div> : null}
    </div>
  );
}
