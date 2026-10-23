// [2026-10-23] 손님 화면이 «주문에 기록된 계좌가 없을 때» 보여줄 계좌 하나만 돌려준다.
//   = 설정 「고객별 계좌 노출 방식」(전체 동일 → 그 계좌 / 구분 → 기존회원 계좌). lib/shopInfo guideBankAccount.
//   두 계좌 전체 설정은 손님 브라우저에 주지 않는다(2026-10-01 원칙) — 은행·번호·예금주 한 벌만.
//   읽기 전용. 주문·입금 판정·뱅크다·정산은 읽지도 쓰지도 않는다.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guideBankAccount, parseShopInfo, SHOP_INFO_KEYS } from "@/lib/shopInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ ok: false }, { status: 500 });
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.from("settings").select("key,value").in("key", [...SHOP_INFO_KEYS]);
    if (error) return NextResponse.json({ ok: false }, { status: 500 });
    const g = guideBankAccount(parseShopInfo((data || []) as Array<{ key: string; value: unknown }>));
    return NextResponse.json(
      { ok: true, account: { bankName: g.bankName, bankAccount: g.bankAccount, bankHolder: g.bankHolder } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
