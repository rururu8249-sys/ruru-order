import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    // 기존 회원도 적용: 로그인 시 이 사람의 "kakao_id 없는 기존 주문"에 kakao_id를 소급 연결(전화번호 매칭).
    //   - 신규 주문만이 아니라 옛 주문까지 안 바뀌는 정체성으로 묶어, 이후 전화/이름 수정돼도 조회 안 깨짐.
    //   - kakao_id가 이미 있는 주문은 건드리지 않음(.is null). 다른 사람 주문 안 건드림(전화 일치만).
    //   - 주문/입금/정산/포인트 로직과 무관(kakao_id 컬럼만). 실패해도 로그인은 정상 진행.
    if (kakaoId && phoneVariants.length > 0) {
      const { error: orderBackfillError } = await supabase
        .from("orders")
        .update({ kakao_id: kakaoId })
        .is("kakao_id", null)
        .in("customer_phone", phoneVariants);
      if (orderBackfillError) {
        console.warn("기존 주문 kakao_id 소급연결 실패(로그인은 정상):", orderBackfillError.message);
      }
    }

    const CUSTOMER_SELECT_COLUMNS =
      "id, youtube_nickname, customer_name, customer_phone, zipcode, address, detail_address, customer_memo, is_blocked, last_order_at, created_at, kakao_id, kakao_nickname, kakao_profile_image, customer_history";

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
        } else {
          updateData.customer_phone = customerPhoneDigits;
          recordChange("customer_phone", existing.customer_phone, customerPhoneDigits);
        }
      }

      // 변경 이력이 생겼으면 저장
      if (history.length > historyBefore) {
        updateData.customer_history = history;
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
      youtube_nickname: "",
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
