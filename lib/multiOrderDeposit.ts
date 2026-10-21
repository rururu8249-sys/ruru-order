// [2026-10-21] 주문서 여러 개를 합친 입금 1건(또는 여러 건)을 «사장님이 직접» 한 번에 입금확인할 때의 표시 규칙.
//   자동매칭에는 쓰지 않는다(사장님 확정: 수동 전용).
//   deposits 에 새 칸을 만들지 않고 confirmed_note 에 묶인 주문 그룹을 [groups:a,b,c] 로 남긴다 →
//   ① 주문상세 돈 계산기가 「더 냈어요(포인트로 돌려주기)」를 잘못 띄우지 않게
//   ② 입금확인 취소를 한 주문에서 눌러도 묶인 주문이 함께 되돌아가게(입금만 풀리고 다른 주문은 확인으로 남는 사고 방지)

export const MULTI_ORDER_NOTE_TAG = "여러 주문 합친 입금";

export function buildMultiOrderNote(groupIds: string[], depositCount: number, depositTotal: number) {
  const groups = Array.from(new Set(groupIds.map((g) => String(g || "").trim()).filter(Boolean)));
  return `관리자 수동매칭 / ${MULTI_ORDER_NOTE_TAG} / 주문 ${groups.length}건 · 입금 ${depositCount}건 · 합계 ${Number(depositTotal || 0).toLocaleString("ko-KR")}원 [groups:${groups.join(",")}]`;
}

export function parseMultiOrderGroups(note: unknown): string[] {
  const m = String(note ?? "").match(/\[groups:([^\]]*)\]/);
  if (!m) return [];
  return Array.from(new Set(m[1].split(",").map((g) => g.trim()).filter(Boolean)));
}
