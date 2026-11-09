// lib/visitStatsExclude.ts
// [2026-11-07 사장님 「루루동이·루루실장은 접속 기록에서 빼자 — 닉네임 계속 바뀜」]
//   접속 기록에서 빼는 «사장님 계정» — 닉네임이 아니라 회원(customers.id = 카카오 계정)으로 기억한다.
//   · 자동 포함: operator_test_accounts(운영자 테스트 번호)에 적힌 번호의 회원
//   · 직접 추가: settings 키 visit_stats_exclude_v1 = { customerIds: [...], nicknames: [...] }
//   · 빼는 기준 = 그 회원의 지금 닉네임 + 예전 닉네임 전부(previous_nicknames + 그 카카오 계정 주문에 찍힌 닉네임 — 앱이
//     previous_nicknames 를 안 써서 실제 역사는 orders.youtube_nickname 에만 남음) + 직접 적은 닉네임
//     → 그 이름으로 남은 접속 + 그 브라우저의 접속
//   읽기 전용 도우미. settings 한 키만 쓴다(POST 는 라우트에서). 주문·돈 무접촉.

import type { SupabaseClient } from "@supabase/supabase-js";

export const VISIT_EXCLUDE_KEY = "visit_stats_exclude_v1";

export type ExcludedCustomer = {
  id: number;
  nickname: string;
  phoneTail: string;
  auto: boolean; // 운영자 테스트 번호라 자동으로 들어간 것(빼기 불가)
  names: string[]; // 지금+예전 닉네임 전부
};

const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
const clean = (v: unknown) => String(v ?? "").trim();

export type ExcludeSetting = { customerIds: number[]; nicknames: string[] };

export function parseExcludeSetting(raw: unknown): ExcludeSetting {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    const ids = Array.isArray(obj?.customerIds) ? obj.customerIds : [];
    const nicks = Array.isArray(obj?.nicknames) ? obj.nicknames : [];
    return {
      customerIds: Array.from(new Set(ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0))),
      nicknames: Array.from(new Set(nicks.map((x: unknown) => clean(x)).filter(Boolean))) as string[],
    };
  } catch {
    return { customerIds: [], nicknames: [] };
  }
}

// previous_nicknames 칸이 배열·JSON 글자·쉼표 글자 어느 모양이어도 이름 목록으로
export function namesOfCustomer(c: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const cur = clean(c.youtube_nickname);
  if (cur) out.add(cur);
  let prev: unknown = c.previous_nicknames;
  if (typeof prev === "string") {
    const s = prev.trim();
    if (s.startsWith("[")) { try { prev = JSON.parse(s); } catch { prev = s.split(","); } }
    else prev = s ? s.split(",") : [];
  }
  if (Array.isArray(prev)) {
    for (const p of prev) {
      const name = typeof p === "string" ? p : clean((p as Record<string, unknown>)?.nickname ?? (p as Record<string, unknown>)?.name);
      const n = clean(name);
      if (n) out.add(n);
    }
  }
  return Array.from(out);
}

export type ExcludeView = { list: ExcludedCustomer[]; nicknames: string[]; allNames: Set<string>; /** [2026-11-09] 제외 회원의 카카오 계정(「지금 접속」이 kakao_id 로 뺄 때) */ kakaoIds: string[] };

export async function loadExcludedCustomers(sb: SupabaseClient): Promise<ExcludeView> {
  const [{ data: setting }, { data: tests }] = await Promise.all([
    sb.from("settings").select("value").eq("key", VISIT_EXCLUDE_KEY).limit(1),
    sb.from("operator_test_accounts").select("customer_phone").eq("is_active", true),
  ]);
  const cfg = parseExcludeSetting(Array.isArray(setting) && setting[0] ? setting[0].value : null);
  const manualIds = cfg.customerIds;
  const testPhones = Array.from(new Set(((tests || []) as Array<Record<string, unknown>>).map((t) => digits(t.customer_phone)).filter((p) => p.length >= 9)));

  const sel = "id, youtube_nickname, previous_nicknames, customer_phone, kakao_id";
  const [byId, byPhone] = await Promise.all([
    manualIds.length ? sb.from("customers").select(sel).in("id", manualIds) : Promise.resolve({ data: [] as unknown[] }),
    // 전화는 저장 모양이 제각각(하이픈 유무) → 숫자만·하이픈 둘 다로 찾는다
    testPhones.length
      ? sb.from("customers").select(sel).in("customer_phone", testPhones.flatMap((p) => [p, p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3")]))
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const autoIds = new Set(((byPhone.data || []) as Array<Record<string, unknown>>).map((c) => Number(c.id)));
  const map = new Map<number, ExcludedCustomer>();
  for (const c of [...((byPhone.data || []) as Array<Record<string, unknown>>), ...((byId.data || []) as Array<Record<string, unknown>>)]) {
    const id = Number(c.id);
    if (!Number.isFinite(id) || map.has(id)) continue;
    map.set(id, {
      id,
      nickname: clean(c.youtube_nickname) || "(닉네임 없음)",
      phoneTail: digits(c.customer_phone).slice(-4),
      auto: autoIds.has(id),
      names: namesOfCustomer(c),
    });
  }

  // 그 카카오 계정으로 한 주문에 찍힌 닉네임(주문 때 이름 스냅샷) = 실제 닉네임 역사
  const kakaoOf = new Map<string, number>();
  for (const c of [...((byPhone.data || []) as Array<Record<string, unknown>>), ...((byId.data || []) as Array<Record<string, unknown>>)]) {
    const k = clean(c.kakao_id);
    if (k) kakaoOf.set(k, Number(c.id));
  }
  if (kakaoOf.size > 0) {
    const { data: ords } = await sb.from("orders").select("kakao_id, youtube_nickname").in("kakao_id", Array.from(kakaoOf.keys())).limit(2000);
    for (const o of (ords || []) as Array<Record<string, unknown>>) {
      const row = map.get(kakaoOf.get(clean(o.kakao_id)) ?? -1);
      const n = clean(o.youtube_nickname);
      if (row && n && !row.names.includes(n)) row.names.push(n);
    }
  }

  const list = Array.from(map.values()).sort((a, b) => (a.auto === b.auto ? a.id - b.id : a.auto ? -1 : 1));
  const allNames = new Set<string>(cfg.nicknames);
  for (const c of list) for (const n of c.names) allNames.add(n);
  return { list, nicknames: cfg.nicknames, allNames, kakaoIds: Array.from(kakaoOf.keys()) };
}
