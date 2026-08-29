// [2026-08-29 사장님 요청]
//   "닉네임 누구누구님 카드결제 링크 카톡으로 발송했다, 확인 부탁드린다"
//   → 관리자가 [카톡 발송완료] 한 번 누르면 봇이 유튜브 채팅에 자동으로 안내글을 올린다.
//
// 안전 (돈/입금/정산/배송/주문상태 로직 무관)
//   · orders 테이블은 "닉네임을 확인하려고" 읽기만 한다. 쓰지 않는다.
//   · 주문상태·금액·입금·배송·포인트 어느 것도 바꾸지 않는다.
//   · 채팅 문구는 서버에서 만든다(클라이언트가 보낸 문장을 그대로 쓰지 않는다).
//   · 금액은 채팅에 쓰지 않는다 — 공개 채팅에 손님 결제금액이 노출되면 안 된다.
//   · 유튜브 쿼터 보호: 글 1개 = 50 units. 봇 안내와 같은 일일 집계에 함께 기록하고 상한을 지킨다.
//   · 같은 주문에 3분 안에 두 번 보내지 않는다(중복 도배 방지).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { postLiveChatMessage, readSetting, writeSetting } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_CAP = 60;              // lib/chatOrderPipeline.ts 의 BOT_DAILY_CAP 과 같은 기준
const SAME_ORDER_GAP_MS = 3 * 60 * 1000;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const rowIds = (Array.isArray(body?.orderRowIds) ? body.orderRowIds : [])
      .map((v: unknown) => Number(v))
      .filter((v: number) => Number.isFinite(v) && v > 0)
      .slice(0, 50);

    if (rowIds.length === 0) {
      return NextResponse.json({ ok: false, error: "주문 번호가 없습니다." }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // 닉네임은 반드시 DB에서 읽는다(화면에서 보낸 값을 믿지 않는다).
    const { data: rows, error: readError } = await sb
      .from("orders")
      .select("id, youtube_nickname, customer_name, order_group_id")
      .in("id", rowIds);

    if (readError) {
      return NextResponse.json({ ok: false, error: `주문 조회 실패: ${readError.message}` }, { status: 500 });
    }

    const first = (rows || [])[0] as Record<string, unknown> | undefined;
    const nickname = clean(first?.youtube_nickname) || clean(first?.customer_name);

    if (!nickname) {
      return NextResponse.json({ ok: false, error: "닉네임이 없어 채팅 안내를 보낼 수 없습니다." }, { status: 400 });
    }

    // 같은 주문 중복 발송 막기
    const dedupeKey = `card_pay_notice_${clean(first?.order_group_id) || rowIds[0]}`;
    const lastMs = Number(await readSetting(sb, dedupeKey)) || 0;
    if (lastMs && Date.now() - lastMs < SAME_ORDER_GAP_MS) {
      const waitSec = Math.ceil((SAME_ORDER_GAP_MS - (Date.now() - lastMs)) / 1000);
      return NextResponse.json({ ok: false, error: `방금 같은 주문으로 안내를 보냈습니다. ${waitSec}초 뒤에 다시 시도해 주세요.` }, { status: 429 });
    }

    // 유튜브 쿼터 상한 확인 (봇 안내와 같은 집계표)
    const day = new Date().toISOString().slice(0, 10);
    const { data: usage } = await sb
      .from("youtube_api_usage")
      .select("calls")
      .eq("day", day)
      .eq("method", "liveChatMessages.insert")
      .limit(1)
      .maybeSingle();

    const sentToday = Number((usage as Record<string, unknown> | null)?.calls || 0);
    if (sentToday >= DAILY_CAP) {
      return NextResponse.json({ ok: false, error: `오늘 봇 채팅 상한(${DAILY_CAP}건)에 도달했습니다. 채팅으로 직접 안내해 주세요.` }, { status: 429 });
    }

    // 문구 — 서버 고정. 금액·전화번호는 넣지 않는다(공개 채팅).
    const shortNick = nickname.slice(0, 20);
    const message = `💳 ${shortNick}님 카카오톡으로 카드결제 링크 보내드렸어요! 📩 확인하시고 결제 부탁드립니다 🙏`;

    const botChatId = await readSetting(sb, "chat_order_chat_id");
    const result = await postLiveChatMessage(message, { forceEvenIfDisabled: true, liveChatId: botChatId });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: `채팅 발송 실패: ${clean((result as Record<string, unknown>).reason) || "알 수 없는 오류"}` },
        { status: 502 }
      );
    }

    await writeSetting(sb, dedupeKey, String(Date.now()));

    if (usage) {
      await sb.from("youtube_api_usage").update({ calls: sentToday + 1 }).eq("day", day).eq("method", "liveChatMessages.insert");
    } else {
      await sb.from("youtube_api_usage").insert({ day, method: "liveChatMessages.insert", calls: 1 });
    }

    return NextResponse.json({ ok: true, message });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
