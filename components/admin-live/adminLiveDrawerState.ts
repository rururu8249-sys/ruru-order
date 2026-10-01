import type { AdminLiveMenuKey } from "./adminLiveMenu";

export type AdminLiveDrawerState =
  | { kind: "closed" }
  | { kind: "order"; orderId: string }
  | { kind: "match"; orderId: string | null }
  | { kind: "deposits" };

export function resolveAdminLiveDestination(menu: AdminLiveMenuKey): { screen: AdminLiveMenuKey; drawer: AdminLiveDrawerState } {
  return menu === "payments" ? { screen: "orders", drawer: { kind: "deposits" } } : { screen: menu, drawer: { kind: "closed" } };
}

export function transitionAdminLiveDrawer(current: AdminLiveDrawerState, next: AdminLiveDrawerState): AdminLiveDrawerState {
  if (current.kind === "match" && next.kind === "match" && current.orderId === next.orderId) return { kind: "closed" };
  return next;
}

export function resolveDrawerOrder<T extends {id:string}>(drawer:AdminLiveDrawerState, orders:T[], filtered:T[], selectedId:string|null):T|null {
  if (drawer.kind === "order") return orders.find(order=>order.id===drawer.orderId) ?? null;
  return filtered.find(order=>order.id===selectedId) ?? filtered[0] ?? null;
}
