// app/api/customer-link-request/route.ts
// [2026-09-09] «계정 연결 요청» — 손님이 카톡을 바꿔 계정이 갈라졌을 때 빠져나오는 길 (1단계)
//
//   왜 필요한가 (용서린 사고 · 2026-09-09)
//     손님이 카카오 계정을 바꾸면 우리 눈엔 «처음 보는 사람»이 된다.
//     예전 닉네임을 다시 쓰려 하면 닉네임 중복 검사에 막히는데,
//     지금까지는 "닉네임 뒤에 번호 4자리 붙이세요" 라는 막다른 안내뿐이라 손님이 갇혔다.
//     → 사장님이 카톡으로 일일이 설명하고, 손으로 SQL 병합을 해야 했다.
//
//   이 API 가 하는 일 (딱 여기까지)
//     check : 그 닉네임을 정말 남이 쓰는지 확인 + «임시 닉네임» 후보를 만들어 준다
//     claim : 손님이 "예전 번호는 010-…예요" 하면 (닉네임 + 그 번호) 로 실존 회원인지 확인하고
//             customer_link_requests 에 «접수»만 한다
//   [2026-09-11 사장님 결정] 손님 화면은 이제 check 만 쓴다(질문 없이 A2204 로 통과).
//     «누구인지»는 DB 트리거 ruru_detect_split_account 가 주소로 알아내 customer_link_requests 에 올린다.
//     claim 은 화면에서 안 부르지만, 사장님이 카톡으로 번호를 받아 수동 접수할 때 쓸 수 있어 남겨둔다.
//
//   ⚠ 돈·포인트·주문·입금·정산·배송 무접촉. 이 API 는 아무 것도 «옮기지» 않는다.
//      실제 병합(포인트·주문 이관)은 2단계 = 관리자 [합치기] 버튼.
//   ⚠ 손님에게 기존 회원의 이름·주문수·포인트를 «절대» 돌려주지 않는다.
//      (번호를 넣어보며 남의 정보를 캐가는 것 방지 — 성공/실패 여부만 알려준다)
//   ⚠ 자동입금매칭 안전성: lib/admin-v2/autoPaymentMatch.ts 는 «닉네임 완전일치 + 금액 완전일치»
//      일 때만 자동 처리한다(실측 확인). 임시 닉네임은 유일하게 발급하므로
//      남의 주문에 잘못 매칭될 수 없다. 못 맞추면 «매칭필요»로 남아 사람이 본다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isOrderablePhone, koreanPhoneVariants } from "@/lib/order/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PENDING_PER_KAKAO = 5;
const SUGGEST_MAX_TRY = 30;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const text = (value: unknown) => String(value ?? "").trim();
const digitsOf = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");

// 같은 닉네임을 쓰는 회원 줄들 (형태가 달라도 닉네임은 정확일치로 본다 — 관문 검사와 같은 기준)
async function rowsByNickname(db: ReturnType<typeof admin>, nickname: string) {
  const { data, error } = await db
    .from("customers")
    .select("id, customer_phone, customer_name, youtube_nickname, kakao_id")
    .eq("youtube_nickname", nickname)
    .limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}

// «겹치지 않는» 임시 닉네임 하나 만들기.
//   1순위: 닉네임 + 내 번호 끝 4자리   (예: 용서린7473) — 시안 확정 형태
//   2순위: 닉네임 + 2, 3, 4 …          (번호를 아직 모를 때)
async function makeTempNickname(db: ReturnType<typeof admin>, base: string, myPhoneDigits: string) {
  const candidates: string[] = [];
  const last4 = myPhoneDigits.length >= 4 ? myPhoneDigits.slice(-4) : "";
  if (last4) candidates.push(`${base}${last4}`);
  for (let i = 2; i <= SUGGEST_MAX_TRY; i += 1) candidates.push(`${base}${i}`);

  const { data, error } = await db
    .from("customers")
    .select("youtube_nickname")
    .in("youtube_nickname", candidates);
  if (error) throw new Error(error.message);

  const used = new Set((data || []).map((row: any) => text(row?.youtube_nickname)));
  const free = candidates.find((name) => !used.has(name));
  // 30개가 전부 차 있는 극단적인 경우만 시간값을 붙인다(그래도 손님이 읽을 수 있는 길이)
  return free || `${base}${digitsOf(String(Date.now())).slice(-4)}`;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_body" }, { status: 400 });
  }

  const action = text(body.action) || "check";
  const nickname = text(body.nickname);
  if (!nickname) return NextResponse.json({ ok: false, reason: "no_nickname" }, { status: 400 });

  const myPhoneDigits = digitsOf(body.customer_phone);
  const newKakaoId = text(body.kakao_id);
  const newKakaoNickname = text(body.kakao_nickname);

  let db: ReturnType<typeof admin>;
  try {
    db = admin();
  } catch (error: any) {
    return NextResponse.json({ ok: false, reason: "config", message: String(error?.message || "") }, { status: 500 });
  }

  try {
    // ── check : 정말 남이 쓰는 이름인지 + 대신 쓸 이름 후보
    if (action === "check") {
      const rows = await rowsByNickname(db, nickname);
      const taken = rows.length > 0;
      const suggestion = taken ? await makeTempNickname(db, nickname, myPhoneDigits) : nickname;
      return NextResponse.json({ ok: true, taken, suggestion });
    }

    // ── claim : "예전에 이 번호로 주문했어요"
    if (action === "claim") {
      const claimedDigits = digitsOf(body.claimed_phone);
      if (!isOrderablePhone(claimedDigits)) {
        return NextResponse.json({ ok: false, reason: "bad_phone" });
      }

      const variants = koreanPhoneVariants(claimedDigits);
      const { data: found, error: findError } = await db
        .from("customers")
        .select("id, customer_phone, customer_name, youtube_nickname, kakao_id")
        .eq("youtube_nickname", nickname)
        .in("customer_phone", variants)
        .limit(1);
      if (findError) throw new Error(findError.message);

      const target = (found || [])[0] as any;
      // 그 닉네임 + 그 번호 조합의 회원이 없으면 «접수하지 않는다» (사장님 목록을 깨끗하게)
      if (!target) return NextResponse.json({ ok: false, reason: "not_found" });

      // [갈라진 게 아닌 경우] 그 회원의 카톡이 «지금 이 카톡»이면 계정이 갈라진 게 아니다.
      //   폰을 바꿔 저장값이 날아갔을 뿐 → 요청을 만들지 않고 원래 이름 그대로 쓰게 한다.
      if (newKakaoId && text(target.kakao_id) && text(target.kakao_id) === newKakaoId) {
        return NextResponse.json({ ok: true, same_account: true });
      }

      // 같은 요청 다시 눌러도 줄이 늘어나지 않게 — 이미 접수된 게 있으면 그걸 그대로 돌려준다
      if (newKakaoId) {
        const { data: already, error: alreadyError } = await db
          .from("customer_link_requests")
          .select("id, temp_nickname, status")
          .eq("new_kakao_id", newKakaoId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(MAX_PENDING_PER_KAKAO + 1);
        if (alreadyError) throw new Error(alreadyError.message);

        const same = (already || []).find((row: any) => text(row?.temp_nickname).startsWith(nickname));
        if (same) {
          return NextResponse.json({ ok: true, temp_nickname: text(same.temp_nickname), duplicated: true });
        }
        // 장난 요청 폭주 방지
        if ((already || []).length > MAX_PENDING_PER_KAKAO) {
          return NextResponse.json({ ok: false, reason: "too_many" });
        }
      }

      const tempNickname = await makeTempNickname(db, nickname, myPhoneDigits);

      const { error: insertError } = await db.from("customer_link_requests").insert({
        nickname,
        claimed_phone: claimedDigits,
        target_customer_id: Number(target.id) || null,
        target_customer_phone: text(target.customer_phone),
        target_customer_name: text(target.customer_name),
        new_kakao_id: newKakaoId || null,
        new_kakao_nickname: newKakaoNickname || null,
        new_customer_phone: myPhoneDigits || null,
        temp_nickname: tempNickname,
        status: "pending",
      });
      if (insertError) throw new Error(insertError.message);

      return NextResponse.json({ ok: true, temp_nickname: tempNickname });
    }

    return NextResponse.json({ ok: false, reason: "bad_action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, reason: "server", message: String(error?.message || "") }, { status: 500 });
  }
}
