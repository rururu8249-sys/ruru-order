"use client";

// [2026-08-29 사장님 요청] 사이즈 실측표 팝업 — 사이즈 고르는 자리에서 바로 치수를 확인한다.
//   · 벤더 엑셀 원본에 적힌 값만 보여준다(추정·계산 없음).
//   · 지금 고른 사이즈 칸은 색으로 강조해 손님이 한눈에 찾게 한다.
//   · 표시 전용. 금액·재고·주문에 아무 영향이 없다.

import type { SizeChart } from "@/lib/sizeChart";
import { sizeColumnIndex } from "@/lib/sizeChart";

type Props = {
  open: boolean;
  title: string;
  chart: SizeChart | null;
  selectedSize?: string;
  onClose: () => void;
};

export default function CustomerSizeChartSheet({ open, title, chart, selectedSize, onClose }: Props) {
  if (!open || !chart) return null;
  const hot = sizeColumnIndex(chart, selectedSize);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="사이즈 실측 닫기"
      onClick={onClose}
      onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 100050, background: "rgba(39,28,33,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="사이즈 실측"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "100%", maxWidth: "560px", maxHeight: "82vh", display: "flex", flexDirection: "column", background: "#fff", borderTopLeftRadius: "18px", borderTopRightRadius: "18px", overflow: "hidden", boxShadow: "0 -10px 40px rgba(0,0,0,0.22)" }}
      >
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #F0EAE0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "15px", fontWeight: 900, color: "#3F3438" }}>사이즈 실측</span>
            <span style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 800, color: "#7A1E47" }}>단위 {chart.unit}</span>
          </div>
          <div style={{ marginTop: "3px", fontSize: "12px", fontWeight: 700, color: "#8B7D83", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        </div>

        <div style={{ overflow: "auto", padding: "10px 12px 4px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "#fff", textAlign: "left", padding: "8px 8px", color: "#8B7D83", fontWeight: 800, whiteSpace: "nowrap" }}>사이즈</th>
                {chart.sizes.map((size, i) => (
                  <th
                    key={`h-${size}`}
                    style={{ padding: "8px 6px", textAlign: "center", fontWeight: 900, whiteSpace: "nowrap", color: i === hot ? "#fff" : "#7A1E47", background: i === hot ? "#7A1E47" : "transparent", borderRadius: i === hot ? "8px 8px 0 0" : undefined }}
                  >
                    {size}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((row, ri) => (
                <tr key={`r-${row.label}`} style={{ background: ri % 2 === 0 ? "#FBF6F8" : "#fff" }}>
                  <td style={{ position: "sticky", left: 0, background: ri % 2 === 0 ? "#FBF6F8" : "#fff", padding: "9px 8px", color: "#3F3438", fontWeight: 700, whiteSpace: "nowrap" }}>{row.label}</td>
                  {row.values.map((value, ci) => (
                    <td
                      key={`c-${row.label}-${ci}`}
                      style={{ padding: "9px 6px", textAlign: "center", fontWeight: ci === hot ? 900 : 700, color: ci === hot ? "#7A1E47" : "#3F3438", background: ci === hot ? "#FFF0F5" : "transparent" }}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: "10px", padding: "9px 11px", borderRadius: "10px", background: "#FBF6F8", border: "1px solid #F0E4E9", fontSize: "11.5px", fontWeight: 700, color: "#8B7D83", lineHeight: 1.65 }}>
            {chart.note || "옷을 평평히 놓고 잰 값입니다."}
            <br />
            판매처가 손으로 잰 값이라 1~2{chart.unit} 오차가 있을 수 있습니다.
          </div>
        </div>

        <div style={{ marginTop: "auto", padding: "10px 14px 14px", borderTop: "1px solid #F0EAE0" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ width: "100%", height: "46px", borderRadius: "14px", border: "none", background: "#7A1E47", color: "#fff", fontSize: "15px", fontWeight: 900, cursor: "pointer" }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
