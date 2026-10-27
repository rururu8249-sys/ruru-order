// [2026-10-27 사장님 「차콜 핑크셔츠 → 핑크하트로 고쳤는데 손님 주문서에 아직 셔츠」 근본수정]
//   상품 저장 때 옵션 «이름만» 바뀐 것(재고 자리 승계)을 note.option_renames 에 기록한다.
//   주문 재고 RPC(수정·삭제·취소복구)가 옛 이름으로 들어온 주문을 만나면 이 기록으로 지금 이름 줄을 찾는다
//   (supabase/sql/hotfix/option_rename_guard_20261027.sql 의 ruru_resolve_renamed_option).
//   판정 규칙은 상품 폼 buildVariantRows 의 재고 승계와 같다:
//     정확히 같은 키 → 느슨한 키(공백·마침표·대소문자 무시) → 「없음」=빈칸 키 → 남은 것끼리 개수가 같으면 순서대로 1:1.

export type VariantKeyRow = { color?: unknown; size?: unknown };
export type OptionRename = { from_color: string; from_size: string; to_color: string; to_size: string; at?: string };

const t = (v: unknown) => String(v ?? "").trim();
const key = (c: string, s: string) => `${c || "__EMPTY_COLOR__"}__${s || "__EMPTY_SIZE__"}`;
const loose = (k: string) => k.replace(/[.\s]/g, "").toLowerCase();
const noneEmpty = (v: string) => (v === "없음" ? "" : v);

/** 저장 전(before) → 저장 후(after) 재고 줄에서 «이름만 바뀐» 짝을 찾는다. 추가·삭제만 있으면 [] */
export function detectOptionRenames(before: VariantKeyRow[], after: VariantKeyRow[]): OptionRename[] {
  const prev = (before || []).map((r) => ({ color: t(r?.color), size: t(r?.size) })).map((r) => ({ ...r, k: key(r.color, r.size) }));
  const next = (after || []).map((r) => ({ color: t(r?.color), size: t(r?.size) })).map((r) => ({ ...r, k: key(r.color, r.size) }));
  if (!prev.length || !next.length) return [];

  const exact = new Set(prev.map((r) => r.k));
  const looseOwner = new Map<string, string | null>();
  for (const r of prev) {
    const lk = loose(r.k);
    looseOwner.set(lk, looseOwner.has(lk) ? null : r.k);
  }
  const used = new Set<string>();
  const unmatched: typeof next = [];
  for (const r of next) {
    if (exact.has(r.k)) { used.add(r.k); continue; }
    const owner = looseOwner.get(loose(r.k));
    if (owner) { used.add(owner); continue; }
    const alt = key(noneEmpty(r.color), noneEmpty(r.size));
    if (alt !== r.k && exact.has(alt)) { used.add(alt); continue; }
    unmatched.push(r);
  }
  if (!unmatched.length) return [];
  const leftovers = prev.filter((r) => !used.has(r.k));
  if (leftovers.length !== unmatched.length) return [];
  return unmatched.map((r, i) => ({ from_color: leftovers[i].color, from_size: leftovers[i].size, to_color: r.color, to_size: r.size }));
}

/** 기존 기록 + 새 기록 합치기. 같은 «옛 이름»은 새 기록이 이김, 지금 이름과 같은 옛 이름(되돌린 것)은 뺌, 최대 100개 */
export function mergeOptionRenames(existing: unknown, added: OptionRename[], liveRows: VariantKeyRow[], at = new Date().toISOString()): OptionRename[] {
  const live = new Set((liveRows || []).map((r) => key(t(r?.color), t(r?.size))));
  const list: OptionRename[] = [];
  const push = (r: OptionRename) => {
    const from = key(t(r.from_color), t(r.from_size));
    const to = key(t(r.to_color), t(r.to_size));
    if (from === to || live.has(from)) return;
    const i = list.findIndex((x) => key(x.from_color, x.from_size) === from);
    if (i >= 0) list.splice(i, 1);
    list.push({ from_color: t(r.from_color), from_size: t(r.from_size), to_color: t(r.to_color), to_size: t(r.to_size), ...(r.at ? { at: r.at } : {}) });
  };
  if (Array.isArray(existing)) for (const r of existing) if (r && typeof r === "object") push(r as OptionRename);
  for (const r of added) push({ ...r, at });
  return list.slice(-100);
}
