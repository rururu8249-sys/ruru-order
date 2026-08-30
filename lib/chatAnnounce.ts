// ── [2026-08-31] 📢 채팅 안내 문구 생성 — 공용 모듈 ──
//   상품관리 팝업의 「📢 채팅」 버튼과 컨트롤타워의 「📢 현재상품 복사」 버튼이
//   완전히 같은 문구를 쓰도록 한 곳으로 분리했다. (원본: AdminLiveProductManagePopup 2026-08-13)
//   유튜브 채팅은 1회 200자 제한 → 세부상품이 많으면 「브랜드 3개 외 N브랜드 총 N종」으로 요약.
//   읽기 전용(문구 생성만) — DB·주문·재고 로직과 무관.
import { parseProductNote } from "@/lib/productDetailModel";

type ProductRow = Record<string, unknown>;

function pickString(row: ProductRow | null | undefined, keys: string[], fallback = "") {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function pickNumber(row: ProductRow, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function pickArray(row: ProductRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) return value.map((i) => String(i || "").trim()).filter(Boolean);
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map((i) => String(i || "").trim()).filter(Boolean);
        } catch {
          return [trimmed];
        }
      }
      return trimmed.split(/[,/|]+/g).map((i) => i.trim()).filter(Boolean);
    }
  }
  return [];
}

const productName = (p: ProductRow) => pickString(p, ["product_name", "name", "title"], "상품명 없음");
const productPrice = (p: ProductRow) => pickNumber(p, ["price", "sale_price", "selling_price"], 0);
const money = (value: number) => `${Number(value || 0).toLocaleString("ko-KR")}원`;

const CHAT_MSG_LIMIT = 200;

export function buildChatAnnounceText(p: ProductRow): string {
  const note = parseProductNote(p);
  const base = productPrice(p);
  const name = productName(p);
  if (note.free_product === true && base === 0) return `🎁 ${name} — 무료나눔!`;

  // 세부상품(조합형): 노출 세부상품명 + 추가금 + 재고
  const comboNames = note.combo_mode === true ? pickArray(p, ["color_options"]) : [];
  const pricing = (note.option_pricing && typeof note.option_pricing === "object" ? note.option_pricing : {}) as Record<string, unknown>;
  const variants = Array.isArray(note.stock_variants) ? (note.stock_variants as Array<Record<string, unknown>>) : [];

  let priceText = money(base);
  let optionText = "";
  if (comboNames.length > 0) {
    const plusList = comboNames.map((n) => Math.max(0, Math.floor(Number(pricing[n] ?? 0))));
    const minP = base + Math.min(...plusList);
    const maxP = base + Math.max(...plusList);
    priceText = minP === maxP ? money(minP) : `${Number(minP).toLocaleString("ko-KR")}~${money(maxP)}`;
    // 판매중 개수(재고관리 중일 때만 — variant가 없으면 표시 생략)
    const soldOutCount = comboNames.filter((n) => {
      const v = variants.find((row) => String(row?.color ?? "").trim() === n && !String(row?.size ?? "").trim());
      return v ? Number(v.stock ?? 0) <= 0 : false;
    }).length;
    const stockNote = soldOutCount > 0 ? `(판매중 ${comboNames.length - soldOutCount}종)` : "";
    if (comboNames.length <= 4) {
      optionText = comboNames.join("·") + stockNote;
    } else {
      // 브랜드 요약: 이름 첫 단어로 묶되, 전 상품 공통 접두어(예: "차량", "미니어처")는 건너뜀
      let toks = comboNames.map((n) => String(n).trim().split(/\s+/));
      while (toks.every((t) => t.length > 1) && new Set(toks.map((t) => t[0])).size === 1) toks = toks.map((t) => t.slice(1));
      const freq = new Map<string, number>();
      toks.forEach((t) => { const b = t[0] || ""; if (b) freq.set(b, (freq.get(b) || 0) + 1); });
      const brands = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b);
      optionText = brands.length >= 2
        ? `${brands.slice(0, 3).join("·")}${brands.length > 3 ? ` 외 ${brands.length - 3}브랜드` : ""} 총 ${comboNames.length}종${stockNote}`
        : `종류 ${comboNames.length}가지${stockNote}`;
    }
  } else {
    // 색상/사이즈 옵션 상품
    const shorten = (arr: string[]) => (arr.length > 5 ? `${arr.slice(0, 5).join("·")} 외 ${arr.length - 5}` : arr.join("·"));
    const colors = pickArray(p, ["color_options", "colors"]).filter((v) => v && v !== "없음");
    const sizes = pickArray(p, ["size_options", "sizes"]).filter((v) => v && v !== "없음");
    optionText = [colors.length ? shorten(colors) : "", sizes.length ? shorten(sizes) : ""].filter(Boolean).join(" / ");
  }

  const head = `🛍 ${name} ${priceText}`;
  // [사장님 지침] 권유 문구 없이 「이런 상품 판매중」 순수 안내글만 — 상품·옵션·금액 정보로 끝.
  let msg = optionText ? `${head} · ${optionText}` : head;
  if (msg.length > CHAT_MSG_LIMIT) msg = `${head} · 종류 ${comboNames.length}가지`; // 그래도 길면 요약으로
  if (msg.length > CHAT_MSG_LIMIT) msg = msg.slice(0, CHAT_MSG_LIMIT); // 최후 안전장치
  return msg;
}
