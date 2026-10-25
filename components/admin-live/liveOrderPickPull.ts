// [2026-10-22 사장님] 「지난 주문 가져오기」 → [2026-10-23] «출고 넘기기» — 화면용 가상 묶음.
//   orders 행에 넘긴 곳(pick_pulled_broadcast_id 또는 pick_pulled_for 날짜)이 적힌 «줄만» 모아 (원래 주문번호 그대로) 가상 LiveOrder 를 만든다.
//   이 묶음은 «넘긴 방송/날짜»의 주문서·송장·물건챙기기에만 나타나고, 받은 돈·입금매칭 숫자엔 안 들어간다.
//   원래 주문(LiveOrder.id = groupId)은 그대로 있고, 거기선 줄에 「○○ 출고로 넘김」 배지만 붙는다.
import type { OrderGroup } from "@/lib/admin-v2/types";
import type { LiveOrder } from "./types";
import { buildAdminLiveOrderGroups, toAdminLiveOrder } from "./liveOrderAdapter";
import { pickPullMatchesView, pulledForOf, type PickPullView } from "@/lib/orderPickPull";
import { isCanceledStatus } from "@/lib/admin-v2/statusDisplay";

export const PICK_PULL_ID_MARK = "#pull:";

export function pulledVirtualOrderId(groupId: string, pulledFor: string, broadcastId = "") {
  return `${groupId}${PICK_PULL_ID_MARK}${broadcastId ? `bc${broadcastId}` : pulledFor}`;
}

/** 가상 묶음이면 원래 주문 id, 아니면 그대로 */
export function originalOrderIdOf(order: Pick<LiveOrder, "id" | "pickPull">): string {
  return order.pickPull?.originalOrderId || order.id;
}

const clean = (v: unknown) => String(v ?? "").trim();

const isActiveRow = (row: OrderGroup["rows"][number]) =>
  (row as any).is_deleted !== true && !isCanceledStatus((row as any).admin_order_status_v2) && !isCanceledStatus((row as any).order_manage_status);
const pullKeyOf = (row: OrderGroup["rows"][number]) => {
  const day = pulledForOf(row);
  return day ? `${clean(row.pick_pulled_broadcast_id)}|${day}` : "";
};

/** [2026-10-25 사장님 「복사 말고 완전 이동」] 주문서의 «살아 있는 줄 전부»가 같은 곳으로 넘어갔으면 «옮긴 주문».
 *  옮긴 주문은 원래 방송/날짜 화면에서 빠지고, 넘긴 곳에만 일반 주문처럼 한 번 보인다(받은 돈 띠도 그쪽에서 센다).
 *  DB 의 주문 날짜·방송·금액은 그대로 — 화면에서 어디에 보이느냐만 바뀐다. 일부 줄만 넘겼으면 지금처럼(원래 주문 + 넘긴 줄 묶음). */
export function isWholeMovedGroup(group: Pick<OrderGroup, "rows">): boolean {
  const active = group.rows.filter(isActiveRow);
  if (!active.length) return false;
  const key = pullKeyOf(active[0]);
  return Boolean(key) && active.every((row) => pullKeyOf(row) === key);
}

/** 옮긴 주문(원래 주문 id = groupId) 모음 — 방송/날짜 화면에서 원래 자리를 빼는 데 쓴다 */
export function wholeMovedGroupIds(groups: readonly OrderGroup[]): Set<string> {
  const out = new Set<string>();
  for (const group of groups) if (isWholeMovedGroup(group)) out.add(String(group.groupId));
  return out;
}

export function buildPulledVirtualOrders(groups: readonly OrderGroup[]): LiveOrder[] {
  const out: LiveOrder[] = [];
  for (const group of groups) {
    if (isWholeMovedGroup(group)) {
      // 옮긴 주문은 주문서 전체(취소 줄 포함)로 만들어 원래 주문과 금액·상품이 똑같게
      const first = group.rows.filter(isActiveRow)[0];
      const day = pulledForOf(first);
      const broadcastId = clean(first.pick_pulled_broadcast_id);
      out.push({
        ...toAdminLiveOrder(group),
        id: pulledVirtualOrderId(group.groupId, day, broadcastId),
        pickPull: {
          pulledFor: day,
          pulledAt: first.pick_pulled_at ?? null,
          reason: clean(first.pick_pulled_reason),
          broadcastId,
          target: clean(first.pick_pulled_target),
          originalOrderId: group.groupId,
          whole: true,
        },
      });
      continue;
    }
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
