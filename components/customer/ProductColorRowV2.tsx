// [㉜ 2026-10-18] 상품 카드 색상 줄 — 새 모양(ui=v2) 전용. DESIGN.md §4.
//   색 점 22px(관리자 지정 색 또는 이름표 자동 색) / 색으로 못 바꾸는 이름은 글씨 칩(13px, soft-cloud 알약).
//   같은 색상을 점·글씨로 두 번 보여주지 않는다. 점마다 색상 이름을 접근성 라벨로. 보기 전용(누르지 않음).
import { isLightSwatch, type ColorDisplayItem } from "@/lib/colorNameSwatch";

export default function ProductColorRowV2({ items }: { items: ColorDisplayItem[] }) {
  if (items.length === 0) return null;
  return (
    <div aria-label="상품 색상" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "6px" }}>
      {items.map((item) =>
        item.hex ? (
          <span
            key={item.label}
            role="img"
            aria-label={item.label}
            title={item.label}
            style={{ display: "inline-block", width: "22px", height: "22px", flexShrink: 0, borderRadius: "9999px", backgroundColor: item.hex, border: isLightSwatch(item.hex) ? "1px solid #CACACB" : "1px solid transparent", boxSizing: "border-box" }}
          />
        ) : (
          <span
            key={item.label}
            style={{ display: "inline-flex", alignItems: "center", height: "24px", padding: "0 10px", borderRadius: "9999px", background: "#F5F5F5", color: "#39393B", fontSize: "13px", fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap" }}
          >
            {item.label}
          </span>
        ),
      )}
    </div>
  );
}
