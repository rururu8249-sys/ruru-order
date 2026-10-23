// [2026-10-22 사장님] 「지난 주문 가져오기」 → [2026-10-23] «출고 넘기기» — 화면용 가상 묶음.
//   orders 행에 넘긴 곳(pick_pulled_broadcast_id 또는 pick_pulled_for 날짜)이 적힌 «줄만» 모아 (원래 주문번호 그대로) 가상 LiveOrder 를 만든다.
//   이 묶음은 «넘긴 방송/날짜»의 주문서·송장·물건챙기기에만 나타나고, 받은 돈·입금매칭 숫자엔 안 들어간다.
//   원래 주문(LiveOrder.id = groupId)은 그대로 있고, 거기선 줄에 「○○ 출고로 넘김」 배지만 붙는다.
import type { OrderGroup } from "@/lib/admin-v2/types";
import type { LiveOrder } from "./types";
import { buildAdminLiveOrderGroups, toAdminLiveOrder } from "./liveOrderAdapter";
import { pickPullMatchesView, pulledForOf, type PickPullView } from "@/lib/orderPickPull";

export const PICK_PULL_ID_MARK = "#pull:";

export function pulledVirtualOrderId(groupId: string, pulledFor: string, broadcastId = "") {
  return `${groupId}${PICK_PULL_ID_MARK}${broadcastId ? `bc${broadcastId}` : pulledFor}`;
}

/** 가상 묶음이면 원래 주문 id, 아니면 그대로 */
export function originalOrderIdOf(order: Pick<LiveOrder, "id" | "pickPull">): string {
  return order.pickPull?.originalOrderId || order.id;
}

const clean = (v: unknown) => String(v ?? "").trim();

export function buildPulledVirtualOrders(groups: readonly OrderGroup[]): LiveOrder[] {
  const out: LiveOrder[] = [];
  for (const group of groups) {
    const byTarget = new Map<string, OrderGroup["rows"]>();
    for (const row of group.rows) {
      const day = pulledForOf(row);
      if (!day) continue;
      const key = `${clean(row.pick_pulled_broadcast_id)}|${day}`;
      if (!byTarget.has(key)) byTarget.set(key, []);
      byTarget.get(key)!.push(row);
    }
    for (const [, rows] of byTarget) {
      const sub = buildAdminLiveOrderGroups(rows).find((g) => g.groupId === group.groupId);
      if (!sub) continue;
      const base = toAdminLiveOrder(sub);
      const first = rows[0];
      const day = pulledForOf(first);
      const broadcastId = clean(first.pick_pulled_broadcast_id);
      out.push({
        ...base,
        id: pulledVirtualOrderId(group.groupId, day, broadcastId),
        // 원래 주문이 출고완료였어도 «넘긴 줄»은 그 출고 때 다시 나가는 줄 — 송장 「새로 출력」 대상이 되게 출고 단계 표시를 비운다(표시만).
        shippingStatus: null,
        pickPull: {
          pulledFor: day,
          pulledAt: first.pick_pulled_at ?? null,
          reason: clean(first.pick_pulled_reason),
          broadcastId,
          target: clean(first.pick_pulled_target),
          originalOrderId: group.groupId,
        },
      });
    }
  }
  return out;
}

/** 지금 보는 주문서(방송/쇼핑몰 날짜)에 붙는 가상 묶음만 — 전체보기(view none)엔 하나도 안 넣는다(원래 주문이 이미 보이므로 중복 금지) */
export function pulledOrdersForView(virtualOrders: readonly LiveOrder[], view: PickPullView): LiveOrder[] {
  return virtualOrders.filter((order) => order.pickPull && pickPullMatchesView(order.pickPull, view));
}

/** 옛 이름 호환(날짜 화면) */
export function pulledOrdersForDay(virtualOrders: readonly LiveOrder[], dayKey: string): LiveOrder[] {
  if (!dayKey) return [];
  return pulledOrdersForView(virtualOrders, { kind: "date", day: dayKey });
}

/** 원래 주문 줄 중 다른 출고로 넘긴 줄이 있으면 넘긴 곳 이름들(중복 제거) — 원래 주문 화면 배지용 */
export function pulledAwayTargets(order: Pick<LiveOrder, "items" | "pickPull">): string[] {
  if (order.pickPull) return [];
  const out = new Set<string>();
  for (const item of order.items || []) {
    const day = pulledForOf({ pick_pulled_for: item.pickPulledFor ?? null, pick_pulled_at: item.pickPulledAt ?? null });
    if (!day) continue;
    out.add(clean(item.pickPulledTarget) || day);
  }
  return [...out].sort();
}

/** 옛 이름 — 넘긴 날짜들 */
export function pulledAwayDays(order: Pick<LiveOrder, "items" | "pickPull">): string[] {
  if (order.pickPull) return [];
  const days = new Set<string>();
  for (const item of order.items || []) {
    const day = pulledForOf({ pick_pulled_for: item.pickPulledFor ?? null, pick_pulled_at: item.pickPulledAt ?? null });
    if (day) days.add(day);
  }
  return [...days].sort();
}
