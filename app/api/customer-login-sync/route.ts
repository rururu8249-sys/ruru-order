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

    const { data: existingRows, error: selectError } = await supabase
      .from("customers")
      .select(
        "id, youtube_nickname, customer_name, customer_phone, zipcode, address, detail_address, customer_memo, is_blocked, last_order_at, created_at"
      )
      .in("customer_phone", phoneVariants)
      .order("created_at", { ascending: false })
      .limit(1);

    if (selectError) {
      return NextResponse.json(
        {
          ok: false,
          message: selectError.message,
        },
        { status: 500 }
      );
    }

    const existing = Array.isArray(existingRows) ? (existingRows[0] as CustomerRow | undefined) : undefined;

    if (existing?.id) {
      const updateData: Record<string, string> = {};

      if (shouldFill(existing.customer_name, customerName)) {
        updateData.customer_name = customerName;
      }

      if (shouldFill(existing.zipcode, zipcode)) {
        updateData.zipcode = zipcode;
      }

      if (shouldFill(existing.address, address)) {
        updateData.address = address;
      }

      if (shouldFill(existing.detail_address, detailAddress)) {
        updateData.detail_address = detailAddress;
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({
          ok: true,
          mode: "exists",
          customer_id: existing.id,
          message: "기존 고객정보 유지",
        });
      }

      const { error: updateError } = await supabase
        .from("customers")
        .update(updateData)
        .eq("id", existing.id);

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

    const insertData = {
      youtube_nickname: "",
      customer_name: customerName,
      customer_phone: customerPhone,
      zipcode,
      address,
      detail_address: detailAddress,
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
