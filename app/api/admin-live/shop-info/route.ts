// [2026-09-08] 설정 › 상점 정보 — 문의 방식 · 카드결제(페이스터) 주소 · 손님에게 보이는 입금계좌
//
// 안전
//   · 관리자 세션이 있어야 한다(GET/POST 둘 다). 미들웨어(/api/admin-live)에서도 한 번 더 막는다.
//   · 쓰기는 서비스롤 키로만 한다. 브라우저 anon 키로 settings 를 직접 쓰지 않는다 —
//     계좌가 밖에서 바뀌면 손님 돈이 엉뚱한 데로 간다.
//   · settings 테이블에 shop_* 키만 upsert. 다른 키·다른 표는 손대지 않는다.
//   · 주문 / 입금 판정 / 뱅크다 / 정산 / 배송 데이터는 읽지도 쓰지도 않는다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { parseShopInfo, SHOP_INFO_KEYS, toShopInfoRows, validateShopInfo } from "@/lib/shopInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 서비스 키가 없어 저장할 수 없습니다. 개발자에게 알려주세요.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type SettingRow = { key: string; value: unknown };

async function readRows(sb: ReturnType<typeof getSupabaseAdmin>): Promise<SettingRow[]> {
  const { data, error } = await sb
    .from("settings")
    .select("key,value")
    .in("key", [...SHOP_INFO_KEYS]);
  if (error) throw new Error(error.message);
  return (data || []) as SettingRow[];
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const sb = getSupabaseAdmin();
    const rows = await readRows(sb);
    return NextResponse.json({
      ok: true,
      info: parseShopInfo(rows),
      /** 저장된 shop_* 키 개수 — 0 이면 아직 한 번도 저장 안 함(=기본값 사용 중) */
      storedKeys: rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "상점 정보를 불러오지 못했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const checked = validateShopInfo(body);
    if (!checked.ok) return NextResponse.json({ ok: false, error: checked.message }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { error } = await sb.from("settings").upsert(toShopInfoRows(checked.value), { onConflict: "key" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = await readRows(sb);
    return NextResponse.json({ ok: true, info: parseShopInfo(rows), storedKeys: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "상점 정보를 저장하지 못했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
