import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// app/api/auth/kakao/route.ts
// 목적: 카카오 로그인 토큰 발급 후 카카오 프로필/전화번호/배송지 조회
// 주의:
// - 주문 저장, 입금, 정산, 배송비 계산 로직 없음.
// - 카카오에서 받은 값을 callback으로 넘겨 localStorage 자동입력에 사용합니다.

const normalizeKakaoPhone = (value: unknown) => {
  const raw = String(value || "").trim();

  if (!raw) return "";

  const digits = raw.replace(/[^0-9]/g, "");

  if (digits.startsWith("82010")) {
    return `010${digits.slice(5)}`;
  }

  if (digits.startsWith("8210")) {
    return `010${digits.slice(4)}`;
  }

  if (digits.startsWith("82") && digits.length > 2) {
    return `0${digits.slice(2)}`;
  }

  return digits;
};

const pickBestShippingAddress = (shippingData: any) => {
  const addresses = Array.isArray(shippingData?.shipping_addresses)
    ? shippingData.shipping_addresses
    : [];

  if (addresses.length === 0) return null;

  return [...addresses].sort((a, b) => {
    if (a?.is_default && !b?.is_default) return -1;
    if (!a?.is_default && b?.is_default) return 1;
    return Number(b?.updated_at || 0) - Number(a?.updated_at || 0);
  })[0];
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "code 없음" }, { status: 400 });
  }

  const requestUrl = new URL(request.url);
  const redirectUri = `${requestUrl.origin}/auth/kakao/callback`;

  const tokenResponse = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.KAKAO_REST_API_KEY || "",
      redirect_uri: redirectUri,
      code,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    return NextResponse.json(
      { error: "토큰 발급 실패", detail: tokenData },
      { status: 400 },
    );
  }

  const userResponse = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });

  const userData = await userResponse.json();
  const kakaoAccount = userData?.kakao_account || {};

  let shippingData: any = null;
  let shippingError: any = null;

  try {
    const shippingResponse = await fetch(
      "https://kapi.kakao.com/v1/user/shipping_address",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      },
    );

    shippingData = await shippingResponse.json();

    if (!shippingResponse.ok) {
      shippingError = shippingData;
      shippingData = null;
    }
  } catch (error: any) {
    shippingError = {
      message: error?.message || "배송지 조회 실패",
    };
  }

  const bestShipping = pickBestShippingAddress(shippingData);

  const kakaoPhone = normalizeKakaoPhone(kakaoAccount?.phone_number);
  const shippingPhone = normalizeKakaoPhone(bestShipping?.receiver_phone_number1);
  const receiverName = String(bestShipping?.receiver_name || "").trim();
  const accountName = String(kakaoAccount?.name || "").trim();

  // ── [2026-08-23 사장님 지시 · 근본 수정] 기존 회원이면 우리 DB 정보 우선 ──
  //   문제: 카카오가 내려주는 번호(카카오 배송지·계정 번호)가 옛 번호일 수 있는데,
  //         로그인할 때마다 이 값이 기기·회원 프로필을 덮어써서 고객이 두 명으로 갈라지고
  //         합배송·입금매칭이 어긋났다(smp미선 건: 병합해도 로그인 한 번에 원복).
  //   수정: kakao_id로 customers를 조회해 기존 회원이면 우리 DB의 번호·이름·주소를 응답에 사용.
  //         카카오 값은 "처음 온 손님" 자동입력에만 쓴다.
  //   안전: 조회 실패 시(환경변수·네트워크 등) 기존 동작 그대로 폴백 — 로그인은 절대 막히지 않는다.
  //         주문/입금/정산/포인트 로직 무접촉(로그인 응답 값 구성만 변경).
  let dbPhone = "";
  let dbName = "";
  let dbZipcode = "";
  let dbAddress = "";
  let dbDetailAddress = "";
  try {
    const kakaoIdText = String(userData.id || "").trim();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (kakaoIdText && supabaseUrl && serviceRoleKey) {
      const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const { data: dbRows } = await sb
        .from("customers")
        .select("customer_name, customer_phone, zipcode, address, detail_address")
        .eq("kakao_id", kakaoIdText)
        // [2026-08-30 수정] 예전엔 ascending: true(가장 오래된 줄)를 봤다.
        //   그런데 customer-login-sync 는 ascending: false(가장 최근 줄)를 정본으로 쓴다.
        //   같은 카카오 계정에 회원 줄이 둘 이상이면 두 API 가 서로 다른 번호를 보게 되어,
        //   로그인할 때마다 옛 번호가 되살아나는 사고의 원인이 된다. → 최근 줄 기준으로 통일한다.
        .order("created_at", { ascending: false })
        .limit(1);
      const dbCustomer = Array.isArray(dbRows) ? dbRows[0] : null;
      if (dbCustomer) {
        dbPhone = String(dbCustomer.customer_phone || "").replace(/[^0-9]/g, "");
        dbName = String(dbCustomer.customer_name || "").trim();
        dbZipcode = String(dbCustomer.zipcode || "").trim();
        dbAddress = String(dbCustomer.address || "").trim();
        dbDetailAddress = String(dbCustomer.detail_address || "").trim();
      }
    }
  } catch {
    // 조회 실패 → 카카오 값으로 기존 동작 유지
  }

  return NextResponse.json({
    kakao_id: String(userData.id || ""),
    kakao_nickname: kakaoAccount?.profile?.nickname || "",
      kakao_profile_image: kakaoAccount?.profile?.profile_image_url || "",

    kakao_phone: kakaoPhone,
    kakao_phone_needs_agreement: Boolean(kakaoAccount?.phone_number_needs_agreement),

    customer_name: dbName || receiverName || accountName || "",
    customer_phone: dbPhone || shippingPhone || kakaoPhone || "",
    // 주소는 한 출처로 묶어서 사용 — DB에 주소가 있으면 DB 세트(우편번호·상세 포함), 없으면 카카오 세트.
    //   (필드별로 섞으면 "DB 우편번호 + 카카오 도로명" 같은 불일치 주소가 생길 수 있다)
    customer_zipcode: dbAddress ? dbZipcode : String(bestShipping?.zone_number || bestShipping?.zip_code || "").trim(),
    customer_address: dbAddress || String(bestShipping?.base_address || "").trim(),
    customer_detail_address: dbAddress ? dbDetailAddress : String(bestShipping?.detail_address || "").trim(),

    kakao_shipping_needs_agreement: Boolean(
      shippingData?.shipping_addresses_needs_agreement,
    ),
    kakao_shipping_count: Array.isArray(shippingData?.shipping_addresses)
      ? shippingData.shipping_addresses.length
      : 0,
    kakao_shipping_error: shippingError,
  });
}
