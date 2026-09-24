// [2026-09-24] 설정 › 상품사진 안내문구 — 사진에 구워 넣을 문구·배경 진하기·기본 on/off
//
// 안전
//   · 관리자 세션이 있어야 한다(GET/POST 둘 다). 미들웨어(/api/admin-live)에서도 한 번 더 막는다.
//   · 쓰기는 서비스롤 키로만 한다. 브라우저 anon 키로 settings 를 직접 쓰지 않는다.
//   · settings 테이블에 product_image_notice_* 키만 upsert. 다른 키·다른 표는 손대지 않는다.
//   · 주문 / 입금 판정 / 뱅크다 / 정산 / 배송 데이터는 읽지도 쓰지도 않는다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import {
  clampNoticeOpacity,
  parseProductImageNotice,
  toProductImageNoticeRows,
  validateProductImageNotice,
  PRODUCT_IMAGE_NOTICE_KEYS,
  PRODUCT_IMAGE_NOTICE_DEFAULTS,
  type ProductImageNotice,
} from "@/lib/productImageNotice";

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
  const { data, error } = await sb.from("settings").select("key,value").in("key", [...PRODUCT_IMAGE_NOTICE_KEYS]);
  if (error) throw new Error(error.message);
  return (data || []) as SettingRow[];
}

export async function GET(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const sb = getSupabaseAdmin();
    const rows = await readRows(sb);
    return NextResponse.json({ ok: true, notice: parseProductImageNotice(rows), storedKeys: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "상품사진 문구 설정을 불러오지 못했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const value: ProductImageNotice = {
      on: body?.on === true,
      text: typeof body?.text === "string" ? body.text.trim() : PRODUCT_IMAGE_NOTICE_DEFAULTS.text,
      opacity: clampNoticeOpacity(body?.opacity),
    };

    const message = validateProductImageNotice(value);
    if (message) return NextResponse.json({ ok: false, error: message }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { error } = await sb.from("settings").upsert(toProductImageNoticeRows(value), { onConflict: "key" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = await readRows(sb);
    return NextResponse.json({ ok: true, notice: parseProductImageNotice(rows), storedKeys: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "상품사진 문구 설정을 저장하지 못했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
