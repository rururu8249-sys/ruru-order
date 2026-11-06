// [2026-11-06 사장님 「세부상품 중에 골라서 그 상품만 순환」]
// 위젯 순환 타겟({productId, detailName})은 원래부터 세부상품 이름을 받았다(위젯 selectWidgetRotationItems 가 detailName 으로 거름).
// 관리자 화면이 «묶음 줄 전체»({pid, ""})만 저장하던 것을 세부상품 단위로도 넣고 빼게 하는 순수 함수들. 저장 형식·위젯 무변경.
import { widgetTargetKey, type WidgetProductTarget } from "./widgetProductLibrary";

export type RotationDetailRef = { pid: string; detailName: string; sourceId?: string };

/** 세부상품 하나의 위젯 타겟 — 다른 상품을 묶어 넣은 세부상품은 원래 상품 id(이름 없음), 그 외는 묶음 id + 이름. */
export function detailRotationTarget(ref: RotationDetailRef): WidgetProductTarget {
  const source = String(ref.sourceId || "").trim();
  return source ? { productId: source, detailName: "" } : { productId: String(ref.pid), detailName: String(ref.detailName || "").trim() };
}

export function dedupeRotationTargets(targets: WidgetProductTarget[]): WidgetProductTarget[] {
  const out = new Map<string, WidgetProductTarget>();
  for (const t of targets) {
    const productId = String(t.productId || "").trim();
    if (!productId) continue;
    const target = { productId, detailName: String(t.detailName || "").trim() };
    out.set(widgetTargetKey(target), target);
  }
  return [...out.values()];
}

/** 이 세부상품이 지금 타겟 안에 드는지 — 묶음 전체({pid,""}) 또는 그 이름. */
export function detailInRotation(targets: WidgetProductTarget[], ref: RotationDetailRef): boolean {
  const t = detailRotationTarget(ref);
  return targets.some((x) => String(x.productId) === t.productId && (!x.detailName || !t.detailName || x.detailName === t.detailName));
}

/**
 * 체크한 줄·세부상품을 빼기.
 * - rowIds: 줄 하나를 뺄 때 함께 빠질 id(묶음 id + 연결 세부상품 원래 id)
 * - details: 뺄 세부상품
 * - nativeDetailNamesOf(pid): 묶음 전체가 들어 있던 경우({pid,""}) 남길 세부상품 이름을 펼치기 위한 목록(숨김 제외)
 */
export function removeRotationTargets(
  base: WidgetProductTarget[],
  rowIds: string[],
  details: RotationDetailRef[],
  nativeDetailNamesOf: (pid: string) => string[],
): WidgetProductTarget[] {
  const dropIds = new Set(rowIds.map(String));
  let next = dedupeRotationTargets(base).filter((t) => !dropIds.has(String(t.productId)));
  const dropNames = new Map<string, Set<string>>();
  for (const d of details) {
    const t = detailRotationTarget(d);
    if (!t.detailName) { next = next.filter((x) => String(x.productId) !== t.productId); continue; }
    const set = dropNames.get(t.productId) ?? new Set<string>();
    set.add(t.detailName);
    dropNames.set(t.productId, set);
  }
  for (const [pid, names] of dropNames) {
    const wholeBundle = next.some((x) => String(x.productId) === pid && !x.detailName);
    next = next.filter((x) => String(x.productId) !== pid || (x.detailName && !names.has(x.detailName)));
    if (wholeBundle) {
      for (const name of nativeDetailNamesOf(pid)) if (name && !names.has(name)) next.push({ productId: pid, detailName: name });
    }
  }
  return dedupeRotationTargets(next);
}
