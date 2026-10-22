// [2026-10-22 사장님] 「지난 주문 가져오기」 — 화면용 가상 묶음.
//   orders 행에 pick_pulled_for 가 적힌 «줄만» 모아 (원래 주문번호 그대로) 가상 LiveOrder 를 만든다.
//   이 묶음은 «가져온 날짜»의 주문서·송장·물건챙기기에만 나타나고, 받은 돈·입금매칭 숫자엔 안 들어간다.
//   원래 주문(LiveOrder.id = groupId)은 그대로 있고, 거기선 줄에 「MM.DD 로 가져감」 배지만 붙는다.
import type { OrderGroup } from "@/lib/admin-v2/types";
import type { LiveOrder } from "./types";
import { buildAdminLiveOrderGroups, toAdminLiveOrder } from "./liveOrderAdapter";
import { pulledForOf } from "@/lib/orderPickPull";

export const PICK_PULL_ID_MARK = "#pull:";

export function pulledVirtualOrderId(groupId: string, pulledFor: string) {
  return `${groupId}${PICK_PULL_ID_MARK}${pulledFor}`;
}

/** 가상 묶음이면 원래 주문 id, 아니면 그대로 */
export function originalOrderIdOf(order: Pick<LiveOrder, "id" | "pickPull">): string {
  return order.pickPull?.originalOrderId || order.id;
}

export function buildPulledVirtualOrders(groups: readonly OrderGroup[]): LiveOrder[] {
  const out: LiveOrder[] = [];
  for (const group of groups) {
    const byDay = new Map<string, OrderGroup["rows"]>();
    for (const row of group.rows) {
      const day = pulledForOf(row);
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(row);
    }
    for (const [day, rows] of byDay) {
      const sub = buildAdminLiveOrderGroups(rows).find((g) => g.groupId === group.groupId);
      if (!sub) continue;
      const base = toAdminLiveOrder(sub);
      const first = rows[0];
      out.push({
        ...base,
        id: pulledVirtualOrderId(group.groupId, day),
        // 원래 주문이 출고완료였어도 «가져온 줄»은 오늘 다시 나가는 줄 — 송장 「새로 출력」 대상이 되게 출고 단계 표시를 비운다(표시만).
        shippingStatus: null,
        pickPull: {
          pulledFor: day,
          pulledAt: first.pick_pulled_at ?? null,
          reason: String(first.pick_pulled_reason ?? "").trim(),
          originalOrderId: group.groupId,
        },
      });
    }
  }
  return out;
}

/** 주문서 범위(그날)와 맞는 가상 묶음만 — dayKey "" 이면(전체보기) 하나도 안 넣는다(원래 주문이 이미 보이므로 중복 금지) */
export function pulledOrdersForDay(virtualOrders: readonly LiveOrder[], dayKey: string): LiveOrder[] {
  if (!dayKey) return [];
  return virtualOrders.filter((order) => order.pickPull?.pulledFor === dayKey);
}

/** 원래 주문 줄 중 다른 날로 가져간 줄이 있으면 그 날짜들(중복 제거) — 원래 주문 화면 배지용 */
export function pulledAwayDays(order: Pick<LiveOrder, "items" | "pickPull">): string[] {
  if (order.pickPull) return [];
  const days = new Set<string>();
  for (const item of order.items || []) {
    const day = pulledForOf({ pick_pulled_for: item.pickPulledFor ?? null, pick_pulled_at: item.pickPulledAt ?? null });
    if (day) days.add(day);
  }
  return [...days].sort();
}
