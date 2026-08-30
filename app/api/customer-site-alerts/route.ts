import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  cleanPhone,
  cleanSessionKey,
  isEmptyPlan,
  planIdentityLookup,
  phoneDigits,
  type IdentityLookupPlan,
} from "@/lib/customerAlertIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// [2026-08-30 보안 수정] 예전엔 ?phone=010… 만 넣으면 남의 쪽지가 그대로 나왔다.
//   전화번호는 추측·유출이 쉬운 값이다. 게다가 주소창(GET 쿼리)에 실려 서버 접속기록에도 쌓였다.
//   → ① 번호는 "혼자서는" 통과 못 한다. 카카오 계정 또는 번호+닉네임으로 증명돼야 한다.
//     ② 증명되면 클라이언트가 보낸 번호가 아니라 DB에 있는 번호를 쓴다.
//     ③ 읽기도 POST(본문)로 받는다 — 번호가 주소창에 안 남는다.
//        GET 은 세션키 전용으로 남겨둔다(배포 직후 옛 화면이 열려 있어도 안 깨지게).
//
// 판단 규칙은 lib/customerAlertIdentity.ts, 회원 조회는 여기.
async function resolveTarget(
  sb: ReturnType<typeof getSupabaseAdmin>,
  plan: IdentityLookupPlan,
): Promise<{ sessionKey: string; phone: string }> {
  const sessionKey = plan.sessionKey;
  let phone = "";

  // ① 카카오 계정으로 회원을 찾는다 — 이 프로젝트의 고객 식별 원칙(customer-login-sync 참고)
  if (plan.byKakaoId) {
    try {
      const { data } = await sb
        .from("customers")
        .select("customer_phone")
        .eq("kakao_id", plan.byKakaoId)
        .limit(1);
      phone = cleanPhone(phoneDigits((data || [])[0]?.customer_phone));
    } catch {
      /* 조회 실패는 "증명 안 됨"으로 본다 */
    }
  }

  // ② 카카오 계정이 없으면 — 번호와 닉네임이 둘 다 맞는 회원이 실제로 있을 때만
  if (!phone && plan.byPhoneAndNickname) {
    try {
      const { data } = await sb
        .from("customers")
        .select("customer_phone")
        .eq("youtube_nickname", plan.byPhoneAndNickname.nickname)
        .in("customer_phone", plan.byPhoneAndNickname.phones)
        .limit(1);
      phone = cleanPhone(phoneDigits((data || [])[0]?.customer_phone));
    } catch {
      /* 위와 같다 */
    }
  }

  return { sessionKey, phone };
}

/** 세션키·증명된 번호 중 있는 것으로 대상을 좁힌다(둘 다 있으면 OR). */
function matchTarget<T extends { or: (f: string) => T; eq: (c: string, v: string) => T }>(
  query: T,
  sessionKey: string,
  phone: string,
): T {
  if (sessionKey && phone) return query.or(`target_session_key.eq.${sessionKey},customer_phone.eq.${phone}`);
  if (sessionKey) return query.eq("target_session_key", sessionKey);
  return query.eq("customer_phone", phone);
}

/** 쪽지함(목록) — 공지·상시안내까지 함께 준다. */
// [2026-08-30] 예전엔 최근 30개에서 말없이 잘렸다. 「더 보기」로 20개씩 이어 본다.
const BOX_PAGE = 20;

async function readBox(
  sb: ReturnType<typeof getSupabaseAdmin>,
  sessionKey: string,
  phone: string,
  offset = 0,
) {
  const from = Math.max(0, Math.floor(offset));
  // 한 줄 더 받아서 "다음 쪽이 있는지"를 판단한다(개수를 따로 세지 않아 가볍다).
  const { data: rows, error: boxError } = await matchTarget(
    sb
      .from("customer_site_alerts")
      .select("id,kind,title,message,created_at,expires_at,seen_at,dismissed_at") as any,
    sessionKey,
    phone,
  )
    .gt("expires_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .range(from, from + BOX_PAGE);

  if (boxError) return NextResponse.json({ ok: false, error: boxError.message }, { status: 500 });
  const all = (rows || []) as Array<Record<string, unknown>>;
  const hasMore = all.length > BOX_PAGE;
  const box = hasMore ? all.slice(0, BOX_PAGE) : all;
  const unread = box.filter((r) => !r.seen_at).length;

  // 공지는 이미 notices 표에 있고 is_pinned(상단 고정)까지 있다. 새로 만들지 않고 그대로 쓴다.
  // 실패해도 쪽지함 자체는 그대로 열린다.
  let notices: Array<Record<string, unknown>> = [];
  try {
    const { data: nRows } = await sb
      .from("notices")
      .select("id,title,content,category,is_pinned,created_at")
      .eq("is_visible", true)
      .order("is_pinned", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(10);
    notices = (nRows || []) as Array<Record<string, unknown>>;
  } catch {
    /* 공지 조회 실패는 쪽지함 표시를 막지 않는다 */
  }

  // [2026-08-30 회귀 복구] 「주문서 공지 문구」(settings.notice_text) — 쪽지함 맨 위 「쇼핑 전 꼭 확인」.
  //   교환·반품 비용 안내가 여기 들어 있어 손님이 못 보면 분쟁이 된다.
  let shopGuide = "";
  try {
    const { data: sRows } = await sb.from("settings").select("key,value").eq("key", "notice_text").limit(1);
    shopGuide = String((sRows || [])[0]?.value ?? "").trim();
  } catch {
    /* 안내 문구 조회 실패는 쪽지함 표시를 막지 않는다 */
  }

  return NextResponse.json({ ok: true, box, unread, notices, shopGuide, hasMore, nextOffset: from + box.length });
}

/** 지금 띄울 쪽지 1건. 띄우면서 읽음 표시를 남긴다. */
async function readAlert(sb: ReturnType<typeof getSupabaseAdmin>, sessionKey: string, phone: string) {
  const { data, error } = await matchTarget(
    sb
      .from("customer_site_alerts")
      .select("id,kind,title,message,created_at,expires_at") as any,
    sessionKey,
    phone,
  )
    .eq("is_active", true)
    .is("dismissed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  // [2026-08-30] 예전엔 여기서 바로 「읽음」을 찍었다.
  //   손님 화면에 팝업이 뜨자마자 읽음이 되니, 화면을 안 보고 있어도 사장님에겐 「봤음」으로 보였다.
  //   → 읽음은 손님 화면이 팝업을 2초 이상 띄운 뒤 따로 알려줄 때만 찍는다(아래 markSeen).
  return NextResponse.json({ ok: true, alert: data || null });
}

const EMPTY = { ok: true, alert: null, box: [], unread: 0, notices: [], shopGuide: "" };

// GET — 세션키 전용(옛 화면 호환). 전화번호는 여기서 받지 않는다.
//   배포 직후 손님 브라우저에 옛 화면이 열려 있어도 쪽지함이 안 깨지게 남겨둔 길이다.
export async function GET(request: NextRequest) {
  try {
    const sessionKey = cleanSessionKey(request.nextUrl.searchParams.get("sessionKey"));
    if (!sessionKey) return NextResponse.json(EMPTY);
    const sb = getSupabaseAdmin();
    return request.nextUrl.searchParams.get("mode") === "box"
      ? await readBox(sb, sessionKey, "")
      : await readAlert(sb, sessionKey, "");
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

// POST — 읽기(mode=box|alert)와 닫기(id) 둘 다.
//   전화번호·카카오 계정이 주소창에 남지 않게 본문으로 받는다.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const plan = planIdentityLookup({
      sessionKey: body.sessionKey,
      phone: body.phone,
      kakaoId: body.kakaoId,
      nickname: body.nickname,
    });
    const id = Math.floor(Number(body.id) || 0);

    if (isEmptyPlan(plan)) {
      return id > 0
        ? NextResponse.json({ ok: false, error: "잘못된 알림 요청" }, { status: 400 })
        : NextResponse.json(EMPTY);
    }

    const sb = getSupabaseAdmin();
    const { sessionKey, phone } = await resolveTarget(sb, plan);

    // 세션키도 없고 번호도 증명되지 않았으면 아무것도 주지 않는다(에러가 아니라 빈 결과).
    if (!sessionKey && !phone) {
      return id > 0
        ? NextResponse.json({ ok: false, error: "본인 확인이 필요합니다." }, { status: 403 })
        : NextResponse.json(EMPTY);
    }

    // 닫기
    if (id > 0) {
      const { error } = await matchTarget(
        sb
          .from("customer_site_alerts")
          .update({ is_active: false, dismissed_at: new Date().toISOString() })
          .eq("id", id) as any,
        sessionKey,
        phone,
      );
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // 읽음 표시 — 손님 화면이 팝업을 2초 이상 보여준 뒤에만 부른다.
    if (String(body.action) === "seen") {
      const seenId = Math.floor(Number(body.alertId) || 0);
      if (seenId > 0) {
        await matchTarget(
          sb.from("customer_site_alerts").update({ seen_at: new Date().toISOString() }).eq("id", seenId).is("seen_at", null) as any,
          sessionKey,
          phone,
        );
      }
      return NextResponse.json({ ok: true });
    }

    // 읽기
    const mode = String(body.mode);
    if (mode === "box") return await readBox(sb, sessionKey, phone, Number(body.offset) || 0);
    if (mode !== "all") return await readAlert(sb, sessionKey, phone);

    // [2026-08-30 부하 줄이기] 예전엔 15초마다 요청을 2건 보냈다.
    //   방송 중 접속 100명이면 분당 800건이었다. 한 번에 다 받아 1건으로 줄인다.
    const boxRes = await readBox(sb, sessionKey, phone, 0);
    const alertRes = await readAlert(sb, sessionKey, phone);
    const boxJson = (await boxRes.json()) as Record<string, unknown>;
    const alertJson = (await alertRes.json()) as Record<string, unknown>;
    if (boxJson.ok !== true) return NextResponse.json(boxJson, { status: 500 });
    return NextResponse.json({ ...boxJson, alert: alertJson.ok === true ? alertJson.alert : null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
