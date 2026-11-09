// app/api/admin-live/live-watch-testers/route.ts
// [2026-11-10 사장님 05:54] 「방송 보며 주문」 시험 손님(베타테스터) — 보기·찾기·넣기·빼기. 관리자만(미들웨어 + 여기서 한 번 더).
//   설정 live_watch_v1.phones 한 칸만 바꾼다. 주문·돈·포인트 무접촉.
//   관리자 시험 계정 표(operator_test_accounts)는 따로 늘 보이므로 여기 명단엔 «추가로 넣은 손님»만.
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { getServiceClient } from "@/lib/youtube";
import { LIVE_WATCH_KEY, parseLiveWatchSetting, serializeLiveWatchSetting } from "@/lib/liveWatch";
import { koreanPhoneVariants } from "@/lib/order/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
const mask = (p: string) => (p.length >= 8 ? `${p.slice(0, 3)}-****-${p.slice(-4)}` : p);

type Cust = { customer_phone?: string | null; customer_name?: string | null; youtube_nickname?: string | null; kakao_nickname?: string | null; kakao_profile_image?: string | null };

async function readSetting(sb: ReturnType<typeof getServiceClient>) {
  const { data } = await sb.from("settings").select("value").eq("key", LIVE_WATCH_KEY).maybeSingle();
  return parseLiveWatchSetting((data as { value?: unknown } | null)?.value);
}

async function describe(sb: ReturnType<typeof getServiceClient>, phones: string[]) {
  const all = Array.from(new Set(phones.flatMap((p) => [p, ...koreanPhoneVariants(p)])));
  const byPhone = new Map<string, Cust>();
  if (all.length) {
    const { data } = await sb.from("customers").select("customer_phone, customer_name, youtube_nickname, kakao_nickname, kakao_profile_image").in("customer_phone", all).order("created_at", { ascending: true });
    for (const r of (data ?? []) as Cust[]) byPhone.set(digits(r.customer_phone), r);
  }
  return phones.map((p) => {
    const c = byPhone.get(p);
    return { key: p, phone: mask(p), nickname: String(c?.youtube_nickname || c?.kakao_nickname || ""), name: String(c?.customer_name || ""), member: Boolean(c) };
  });
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return fail("관리자 로그인이 필요합니다.", 401);
  try {
    const sb = getServiceClient();
    const setting = await readSetting(sb);
    const items = await describe(sb, setting.phones);
    const q = String(request.nextUrl.searchParams.get("q") || "").replace(/[,()*%\\]/g, " ").trim().slice(0, 30);
    let results: Array<{ key: string; phone: string; nickname: string; name: string; tester: boolean }> = [];
    if (q) {
      const d = digits(q);
      const ors = [`customer_name.ilike.*${q}*`, `youtube_nickname.ilike.*${q}*`, `kakao_nickname.ilike.*${q}*`];
      if (d.length >= 3) ors.push(`customer_phone.ilike.*${d}*`);
      const { data, error } = await sb.from("customers").select("customer_phone, customer_name, youtube_nickname, kakao_nickname")
        .or(ors.join(",")).order("last_login_at", { ascending: false, nullsFirst: false }).limit(30);
      if (error) return fail("찾기 실패", 500);
      const seen = new Set<string>();
      for (const r of (data ?? []) as Cust[]) {
        const p = digits(r.customer_phone);
        if (p.length < 9 || seen.has(p)) continue;
        seen.add(p);
        results.push({ key: p, phone: mask(p), nickname: String(r.youtube_nickname || r.kakao_nickname || ""), name: String(r.customer_name || ""), tester: setting.phones.includes(p) });
      }
      results = results.slice(0, 12);
    }
    return NextResponse.json({ ok: true, items, results });
  } catch {
    return fail("못 불러왔어요.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return fail("관리자 로그인이 필요합니다.", 401);
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const phone = digits(raw.key);
    const add = raw.add === true;
    if (phone.length < 9 || phone.length > 11) return fail("전화번호가 이상해요.");
    const sb = getServiceClient();
    const setting = await readSetting(sb);
    const phones = add ? Array.from(new Set([...setting.phones, phone])) : setting.phones.filter((p) => p !== phone);
    const { error } = await sb.from("settings").upsert([{ key: LIVE_WATCH_KEY, value: serializeLiveWatchSetting({ ...setting, phones }) }], { onConflict: "key" });
    if (error) return fail("저장 못 했어요.", 500);
    return NextResponse.json({ ok: true, items: await describe(sb, phones) });
  } catch {
    return fail("저장 못 했어요.", 500);
  }
}
