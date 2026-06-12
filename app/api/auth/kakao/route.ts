import { NextResponse } from "next/server";

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

  return NextResponse.json({
    kakao_id: String(userData.id || ""),
    kakao_nickname: kakaoAccount?.profile?.nickname || "",
      kakao_profile_image: kakaoAccount?.profile?.profile_image_url || "",

    kakao_phone: kakaoPhone,
    kakao_phone_needs_agreement: Boolean(kakaoAccount?.phone_number_needs_agreement),

    customer_name: receiverName || accountName || "",
    customer_phone: shippingPhone || kakaoPhone || "",
    customer_zipcode: String(bestShipping?.zone_number || bestShipping?.zip_code || "").trim(),
    customer_address: String(bestShipping?.base_address || "").trim(),
    customer_detail_address: String(bestShipping?.detail_address || "").trim(),

    kakao_shipping_needs_agreement: Boolean(
      shippingData?.shipping_addresses_needs_agreement,
    ),
    kakao_shipping_count: Array.isArray(shippingData?.shipping_addresses)
      ? shippingData.shipping_addresses.length
      : 0,
    kakao_shipping_error: shippingError,
  });
}
