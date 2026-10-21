import type { AdminLiveMenuKey } from "./adminLiveMenu";

export type AdminLiveDrawerState =
  | { kind: "closed" }
  | { kind: "order"; orderId: string }
  | { kind: "match"; orderId: string | null }
  | { kind: "deposits" };

export function resolveAdminLiveDestination(menu: AdminLiveMenuKey): { screen: AdminLiveMenuKey; drawer: AdminLiveDrawerState } {
  // [2026-10-21 입금 통합] 「입금」 탭 = 주문 화면 위 오른쪽 「입금」 창을 입금매칭(처리)부터 연다. 입금내역은 창 안 칩으로.
  return menu === "payments" ? { screen: "orders", drawer: { kind: "match", orderId: null } } : { screen: menu, drawer: { kind: "closed" } };
}

export function transitionAdminLiveDrawer(current: AdminLiveDrawerState, next: AdminLiveDrawerState): AdminLiveDrawerState {
  if (current.kind === "match" && next.kind === "match" && current.orderId === next.orderId) return { kind: "closed" };
  return next;
}

export function resolveDrawerOrder<T extends {id:string}>(drawer:AdminLiveDrawerState, orders:T[], filtered:T[], selectedId:string|null):T|null {
  if (drawer.kind === "order") return orders.find(order=>order.id===drawer.orderId) ?? null;
  return filtered.find(order=>order.id===selectedId) ?? filtered[0] ?? null;
}
