// app/api/presence/route.ts
// [2026-08-29 사장님 확인] "실시간 접속자가 계속 1명" 사고의 근본 수정
//
// 원인
//   접속 신호를 /api/admin-live/presence 로 보내고 있었는데,
//   middleware.ts 가 "/api/admin-live/*" 를 관리자 전용으로 막고 있어서
//   손님 브라우저(관리자 쿠키 없음)의 신호가 전부 401 로 튕겼다.
//   → 관리자 쿠키가 있는 사장님 브라우저 1개만 잡혀 항상 "1명" 이었다.
//
// 해결
//   middleware 는 건드리지 않는다(로그인·관리자 접근 로직이라 위험).
//   대신 "쓰기 전용" 공개 주소를 따로 둔다. 손님도 여기로 신호를 보낸다.
//
// 공개 범위
//   · POST(쓰기)만 있다. 누가 접속했는지 읽는 GET 은 여기에 없다.
//   · 접속자 목록·닉네임을 보는 GET 은 /api/admin-live/presence 에 그대로 남아 관리자 전용이다.
//
// ⚠️ visitor_presence / visitor_visits 만 쓴다.
//    주문 · 입금 · 정산 · 배송 · 재고 · 포인트 무접촉.

import { NextResponse } from "next/server";
import { writePresence } from "@/lib/presenceWrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await writePresence(body);

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
    }

    return NextResponse.json({ ok: true, lastSeenAt: result.lastSeenAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
