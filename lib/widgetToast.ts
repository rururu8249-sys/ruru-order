// [2026-11-13 사장님] 상품 위젯 알림 스티커 공용 규칙 (표시 전용 — 돈·주문 무접촉).
//   장바구니 담음은 유튜브 채팅에 안 올리고, 사이트 채팅에 남는 루루동이 글(bot_ref c:)을 위젯이 받아 스티커로 띄운다.
import type { LiveChatMessage } from "./liveChat";

export const WIDGET_TOAST_TAG = { green: "#16A34A", blue: "#2563EB", pink: "#DB2777" } as const;

export type CartChatToast = { key: string; nick: string; detail: string };

/** 「🛍️ 루*동이님 장바구니 담음 · PD-202 블랙/M · 259,000원 외 2종」 → 닉네임·첫 상품(외 N종). 금액은 안 씀. */
export function parseCartChatToast(m: LiveChatMessage | null | undefined): CartChatToast | null {
  if (!m || m.hidden || m.badge !== "bot" || !m.botRef.startsWith("c:")) return null;
  if (m.avatar === "autotest") return null; // 자동 테스트 담기는 방송 화면에 안 띄움
  const hit = /^🛍️\s*(.+?)님 장바구니 담음 · (.+)$/u.exec(String(m.body || "").trim());
  if (!hit) return null;
  let rest = hit[2].trim();
  const more = /\s외\s(\d+)종$/.exec(rest);
  if (more) rest = rest.slice(0, more.index).trim();
  const product = rest.split(" · ")[0].trim();
  if (!product) return null;
  return { key: String(m.id), nick: hit[1].trim(), detail: more ? `${product} 외 ${more[1]}종` : product };
}

/** ?full=1 화면 전체 모드 — 카드 위치·크기(화면 % 기준). 값이 이상하면 기본값. */
export function parseWidgetFullLayout(search: string): { full: boolean; right: number; top: number; width: number } {
  const q = new URLSearchParams(search);
  const num = (k: string, d: number, lo: number, hi: number) => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) && v >= lo && v <= hi ? v : d;
  };
  return { full: q.get("full") === "1", right: num("r", 3, 0, 90), top: num("t", 7, 0, 90), width: num("w", 26, 10, 60) };
}
