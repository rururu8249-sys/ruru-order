import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { collectKnownPhoneDigits, selectBackfillPhoneDigits } from "@/lib/customerIdentity";

// app/api/customer-login-sync/route.ts
// 목적:
// - 카카오 로그인 완료 시점에 customers 테이블에 고객 기본정보를 자동 등록합니다.
// - 주문서 제출 전 고객도 관리자 회원목록에서 검색 가능하게 만들기 위한 1차 저장 API입니다.
//
// 주의:
// - 주문/입금/배송/정산/송장 저장 로직 없음.
// - customers 테이블에 현재 존재하는 컬럼만 사용합니다.
// - kakao_id, first_login_at, last_login_at 컬럼은 아직 없으므로 여기서 저장하지 않습니다.
// - 기존 고객은 전화번호 기준으로 찾고, 비어 있는 정보만 보완합니다.

type LoginSyncBody = {
  kakao_id?: unknown;
  kakao_nickname?: unknown;
  kakao_profile_image?: unknown;
  customer_name?: unknown;
  customer_phone?: unknown;
  customer_zipcode?: unknown;
  customer_address?: unknown;
  customer_detail_address?: unknown;
  // [2026-07-22 사장님 지시] 유튜브 닉네임 — 관문 통과 즉시 DB 반영용(기존엔 주문 제출 때만 저장돼 "닉네임 미입력" 회원이 남던 문제)
  youtube_nickname?: unknown;
};

type CustomerRow = {
  id?: string | number | null;
  youtube_nickname?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  zipcode?: string | null;
  address?: string | null;
  detail_address?: string | null;
  customer_memo?: string | null;
  is_blocked?: boolean | null;
  last_order_at?: string | null;
  created_at?: string | null;
  kakao_id?: string | null;
  kakao_nickname?: string | null;
  kakao_profile_image?: string | null;
  customer_history?: unknown;
  live_alert_optin?: boolean | null;
};

const cleanText = (value: unknown) => String(value ?? "").trim();

const normalizePhone = (value: unknown) => {
  const digits = cleanText(value).replace(/[^0-9]/g, "");

  if (digits.length === 11 && digits.startsWith("010")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10 && digits.startsWith("02")) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return digits;
};

const phoneDigits = (value: unknown) => cleanText(value).replace(/[^0-9]/g, "");

const makePhoneVariants = (value: unknown) => {
  const normalized = normalizePhone(value);
  const digits = phoneDigits(value);
  const variants = new Set<string>();

  if (normalized) variants.add(normalized);
  if (digits) variants.add(digits);

  if (digits.length === 11 && digits.startsWith("010")) {
    variants.add(`${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`);
  }

  if (digits.length === 10 && digits.startsWith("02")) {
    variants.add(`${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`);
  }

  if (digits.length === 10 && !digits.startsWith("02")) {
    variants.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
  }

  return Array.from(variants).filter(Boolean);
};

const createAdminSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const shouldFill = (current: unknown, incoming: string) => {
  return !cleanText(current) && Boolean(incoming);
};

export async function POST(request: NextRequest) {
  let body: LoginSyncBody;

  try {
    body = (await request.json()) as LoginSyncBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "요청 내용을 읽을 수 없습니다.",
      },
      { status: 400 }
    );
  }

  const customerName = cleanText(body.customer_name);
  const customerPhone = normalizePhone(body.customer_phone);
  const customerPhoneDigits = phoneDigits(customerPhone);
  const zipcode = cleanText(body.customer_zipcode);
  const address = cleanText(body.customer_address);
  const detailAddress = cleanText(body.customer_detail_address);
  const kakaoId = cleanText(body.kakao_id);
  const kakaoNickname = cleanText(body.kakao_nickname);
  const kakaoProfileImage = cleanText(body.kakao_profile_image);
  const youtubeNickname = cleanText(body.youtube_nickname).slice(0, 80);
  const nowIso = new Date().toISOString();

  if (customerPhoneDigits.length < 10) {
    return NextResponse.json(
      {
        ok: false,
        message: "전화번호가 없어 고객 자동등록을 건너뜁니다.",
      },
      { status: 400 }
    );
  }

  try {
    const supabase = createAdminSupabase();
    const phoneVariants = makePhoneVariants(customerPhone);

    const CUSTOMER_SELECT_COLUMNS =
      "id, youtube_nickname, customer_name, customer_phone, zipcode, address, detail_address, customer_memo, is_blocked, last_order_at, created_at, kakao_id, kakao_nickname, kakao_profile_image, customer_history, live_alert_optin";

    // ★ 고객 식별 원칙: 정체성은 카카오 계정(kakao_id)이다. 전화번호는 바뀔 수 있는 연락처일 뿐.
    //   ① kakao_id 로 먼저 찾는다 → 번호를 바꿔도 "같은 사람"으로 인식(중복 고객 row 생성 방지).
    //   ② 못 찾으면 전화번호로 폴백(카톡ID 없던 시절 옛 회원).
    //   ③ 그래도 없으면 신규 등록.
    let existing: CustomerRow | undefined;

    if (kakaoId) {
      const { data: byKakao, error: kakaoSelectError } = await supabase
        .from("customers")
        .select(CUSTOMER_SELECT_COLUMNS)
        .eq("kakao_id", kakaoId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (kakaoSelectError) {
        return NextResponse.json({ ok: false, message: kakaoSelectError.message }, { status: 500 });
      }
      existing = Array.isArray(byKakao) ? (byKakao[0] as CustomerRow | undefined) : undefined;
    }

    if (!existing) {
      const { data: byPhone, error: selectError } = await supabase
        .from("customers")
        .select(CUSTOMER_SELECT_COLUMNS)
        .in("customer_phone", phoneVariants)
        .order("created_at", { ascending: false })
        .limit(1);

      if (selectError) {
        return NextResponse.json({ ok: false, message: selectError.message }, { status: 500 });
      }
      existing = Array.isArray(byPhone) ? (byPhone[0] as CustomerRow | undefined) : undefined;
    }

    // [2026-08-29] 번호가 바뀐 손님도 옛 주문이 보이게 — "알려진 모든 번호"로 kakao_id 소급 연결
    //   왜 고쳤나(실측): 이전에는 이번 로그인에 담겨온 번호 하나로만 옛 주문을 찾았다.
    //     번호를 바꾸거나 배송지 번호로 주문한 손님의 옛 주문은 kakao_id가 빈 채 남아
    //     개인 주문내역에서 사라졌다(사고 사례: 루루짱929, 주문 3건 중 일부 미표시).
    //   무엇을 모으나: 현재번호 + 회원 프로필 번호 + customer_history의 번호 변경이력
    //                 + 이미 이 카카오계정에 연결된 주문의 번호.
    //   안전장치:
    //     · kakao_id가 이미 있는 주문은 절대 건드리지 않는다(.is null).
    //     · 그 번호를 "다른 카카오 계정"의 회원이 쓰고 있으면 그 번호는 제외한다(번호 재사용 → 남의 주문 방지).
    //     · 10자리 미만 값은 collectKnownPhoneDigits에서 이미 버린다.
    //   금액/입금/정산/배송/주문상태/포인트 값은 하나도 건드리지 않는다(orders.kakao_id 컬럼 1개만 채움).
    //   실패해도 로그인은 그대로 성공 처리한다.
    if (kakaoId) {
      try {
        const { data: linkedOrderRows } = await supabase
          .from("orders")
          .select("customer_phone")
          .eq("kakao_id", kakaoId)
          .limit(500);

        // 번호 개수 상한(20) — 쿼리 길이 폭주 방지. 앞쪽이 우선순위(현재번호 → 프로필 → 변경이력 → 연결주문).
        const knownDigits = collectKnownPhoneDigits({
          current: customerPhone,
          profilePhone: existing?.customer_phone,
          history: existing?.customer_history,
          linkedOrderPhones: Array.isArray(linkedOrderRows)
            ? linkedOrderRows.map((row) => (row as { customer_phone?: unknown }).customer_phone)
            : [],
        }).slice(0, 20);

        if (knownDigits.length > 0) {
          const lookupVariants = Array.from(
            new Set(knownDigits.flatMap((digits) => makePhoneVariants(digits)))
          ).filter(Boolean);

          const { data: phoneOwnerRows } = await supabase
            .from("customers")
            .select("customer_phone, kakao_id")
            .in("customer_phone", lookupVariants);

          const allowedDigits = selectBackfillPhoneDigits({
            knownDigits,
            owners: Array.isArray(phoneOwnerRows)
              ? (phoneOwnerRows as Array<{ customer_phone?: unknown; kakao_id?: unknown }>)
              : [],
            kakaoId,
          });
          const backfillVariants = Array.from(
            new Set(allowedDigits.flatMap((digits) => makePhoneVariants(digits)))
          ).filter(Boolean);

          if (backfillVariants.length > 0) {
            const { error: orderBackfillError } = await supabase
              .from("orders")
              .update({ kakao_id: kakaoId })
              .is("kakao_id", null)
              .in("customer_phone", backfillVariants);
            if (orderBackfillError) {
              console.warn("기존 주문 kakao_id 소급연결 실패(로그인은 정상):", orderBackfillError.message);
            }
          }
        }
      } catch (backfillError) {
        console.warn(
          "기존 주문 kakao_id 소급연결 건너뜀(로그인은 정상):",
          backfillError instanceof Error ? backfillError.message : backfillError
        );
      }
    }

    if (existing?.id) {
      const updateData: Record<string, unknown> = {};

      // customer_history: 실제 변경되는 값만 기록 (기존 배열에 append)
      const history = Array.isArray(existing.customer_history) ? [...(existing.customer_history as unknown[])] : [];
      const historyBefore = history.length;
      const recordChange = (field: string, oldValue: unknown, newValue: string) => {
        history.push({ field, old_value: cleanText(oldValue), new_value: newValue, changed_at: nowIso });
      };

      if (shouldFill(existing.customer_name, customerName)) {
        updateData.customer_name = customerName;
        recordChange("customer_name", existing.customer_name, customerName);
      }

      if (shouldFill(existing.zipcode, zipcode)) {
        updateData.zipcode = zipcode;
      }

      if (shouldFill(existing.address, address)) {
        updateData.address = address;
        recordChange("address", existing.address, address);
      }

      if (shouldFill(existing.detail_address, detailAddress)) {
        updateData.detail_address = detailAddress;
        recordChange("detail_address", existing.detail_address, detailAddress);
      }

      // [유튜브 닉네임] 관문/재방문 시 즉시 반영 — 비어 있으면 채우고, 달라졌으면 갱신 + 변경이력 기록
      //   (닉네임 중복 검사는 고객 관문에서 이미 통과한 값만 들어옴. 주문/입금/포인트 로직 무관 — customers 표시/검색 필드)
      if (youtubeNickname && cleanText(existing.youtube_nickname) !== youtubeNickname) {
        updateData.youtube_nickname = youtubeNickname;
        recordChange("youtube_nickname", existing.youtube_nickname, youtubeNickname);
      }

      // 카카오 식별자: kakao_id는 비어있을 때만 보완, nickname은 있으면 갱신
      if (shouldFill(existing.kakao_id, kakaoId)) {
        updateData.kakao_id = kakaoId;
      }
      if (kakaoNickname) {
        updateData.kakao_nickname = kakaoNickname;
      }
      // 프로필 이미지: 로그인마다 최신 값으로 갱신
      if (kakaoProfileImage) {
        updateData.kakao_profile_image = kakaoProfileImage;
      }

      // ★ 카카오 계정으로 찾았는데 전화번호가 바뀐 경우 → customers 의 번호를 새 번호로 갱신한다.
      //   이 UPDATE 가 DB 트리거(trg_sync_identity_on_phone_change)를 깨워
      //   포인트 잔액·이력·차단이 새 번호로 함께 따라온다(고아 방지).
      //   단 다른 고객이 이미 그 번호를 쓰는 중이면(unique 충돌) 번호는 건드리지 않는다.
      //   (번호가 비어 있는 고객 row 도 이때 채워진다 — 그래야 포인트·주문과 연결된다)
      const existingPhoneDigits = phoneDigits(existing.customer_phone || "");
      if (customerPhoneDigits && existingPhoneDigits !== customerPhoneDigits) {
        const { data: conflictRows } = await supabase
          .from("customers")
          .select("id")
          .eq("customer_phone", customerPhoneDigits)
          .neq("id", existing.id)
          .limit(1);

        if (Array.isArray(conflictRows) && conflictRows.length > 0) {
          console.warn(
            `전화번호 변경 스킵(다른 고객이 사용 중): ${customerPhoneDigits}`
          );
          // [2026-08-29] 서버 로그만 남기면 사장님이 알 방법이 없어, 회원 변경이력에도 남긴다.
          //   회원카드 변경이력에 뜨므로 "번호가 왜 옛날 거지?" 를 바로 알 수 있다.
          //   customer_history 는 표시 전용 — 주문/입금/정산/포인트에 영향 없음.
          history.push({
            field: "customer_phone_change_skipped",
            old_value: cleanText(existing.customer_phone),
            new_value: customerPhoneDigits,
            note: "다른 회원이 이미 이 번호를 쓰고 있어 번호를 바꾸지 않았습니다(수동 확인 필요)",
            changed_at: nowIso,
          });
        } else {
          updateData.customer_phone = customerPhoneDigits;
          recordChange("customer_phone", existing.customer_phone, customerPhoneDigits);
        }
      }

      // 변경 이력이 생겼으면 저장
      if (history.length > historyBefore) {
        updateData.customer_history = history;
      }

      // [2026-07-29 사장님 지시] 방송알림 기본 ON
      //   - 한 번도 설정한 적 없는 회원(null)만 ON으로 채운다.
      //   - 본인이 직접 끈 회원(false)은 절대 다시 켜지 않는다(수신거부 존중).
      //   - 이미 true면 그대로 둔다(신청일 live_alert_optin_at 보존).
      //   - 알림 발송 대상(live_alert_optin) 외 다른 로직(주문/입금/정산/포인트) 무관.
      if (existing.live_alert_optin === null || existing.live_alert_optin === undefined) {
        updateData.live_alert_optin = true;
        updateData.live_alert_optin_at = nowIso;
        updateData.live_alert_optin_source = "kakao_login_default";
      }

      // last_login_at은 항상 갱신 (→ updateData가 비는 일이 없으므로 스킵 분기 미발생)
      updateData.last_login_at = nowIso;

      let { error: updateError } = await supabase
        .from("customers")
        .update(updateData)
        .eq("id", existing.id);

      // 번호 갱신이 unique 충돌(다른 고객이 그 사이 같은 번호를 차지)로 실패하면,
      //   번호만 빼고 다시 저장한다. 로그인이 절대 실패하지 않도록 하는 안전망.
      if (updateError && updateData.customer_phone) {
        const conflictLike = /duplicate|unique|23505/i.test(updateError.message || "");
        if (conflictLike) {
          console.warn("전화번호 갱신 충돌 → 번호 제외하고 재저장:", updateError.message);
          delete updateData.customer_phone;
          const retry = await supabase.from("customers").update(updateData).eq("id", existing.id);
          updateError = retry.error;
        }
      }

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            message: updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        mode: "updated",
        customer_id: existing.id,
        updated_fields: Object.keys(updateData),
      });
    }

    const insertData: Record<string, unknown> = {
      youtube_nickname: youtubeNickname || "",
      customer_name: customerName,
      customer_phone: customerPhoneDigits, // DB customer_phone 키는 숫자만(2026-06-16 정규화 + 주문 RPC 정합)
      zipcode,
      address,
      detail_address: detailAddress,
      kakao_id: kakaoId || null,
      kakao_nickname: kakaoNickname || null,
      kakao_profile_image: kakaoProfileImage || null,
      first_login_at: nowIso,
      last_login_at: nowIso,
      // [2026-07-29 사장님 지시] 신규 가입(카톡 간편로그인)은 방송알림 기본 ON
      live_alert_optin: true,
      live_alert_optin_at: nowIso,
      live_alert_optin_source: "kakao_signup_default",
    };

    const { data: insertedRows, error: insertError } = await supabase
      .from("customers")
      .insert(insertData)
      .select("id")
      .limit(1);

    if (insertError) {
      return NextResponse.json(
        {
          ok: false,
          message: insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "inserted",
      customer_id: insertedRows?.[0]?.id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "고객 자동등록 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 }
    );
  }
}
