// lib/customer/customerSession.ts
// 전체 교체
// 위치: /Users/ruru/Desktop/ruru-order-app/lib/customer/customerSession.ts
// 목적: 고객 첫 화면에서 저장된 고객정보만 읽고/삭제합니다.
// 주문 저장, 금액, 카드수수료, 관리자 로직과 연결하지 않습니다.

export type SavedCustomerInfo = {
  youtubeNickname: string;
  customerName: string;
  customerPhone: string;
  zipcode: string;
  address: string;
  detailAddress: string;
};

export const CUSTOMER_SESSION_VERSION_KEY = "ruru_customer_session_version";
// [2026-08-31 사장님 지시 · 강제 재로그인] 계정분리 사고 기간(8/30 이전)에 여러 브라우저에
//   어긋난 번호·카카오 정보가 남았다(실사례: 하루한켠 님 네이버앱 — 주문내역이 안 보임).
//   버전을 올리면 모든 손님이 다음 접속 때 딱 한 번 카카오 로그인을 다시 하고,
//   그 순간 서버의 올바른 정보로 새로 채워진다. 주문·포인트·입금에는 아무 영향 없음.
export const REQUIRED_CUSTOMER_SESSION_VERSION = "kakao_required_20260831";
export const YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY = "ruru_youtube_nickname_confirm_version";
export const REQUIRED_YOUTUBE_NICKNAME_CONFIRM_VERSION = "youtube_confirmed_20260524";

export const CUSTOMER_STORAGE_KEYS = [
  "ruru_customer_session",
  "ruru_customer_phone",
  "ruru_youtube_nickname",
  "ruru_customer_name",
  "ruru_customer_zipcode",
  "ruru_customer_address",
  "ruru_customer_detail_address",
  // [2026-08-31 사고수정] 로그아웃이 카카오 키를 안 지우고 있었다.
  //   가족 공용 폰에서 로그아웃해도 앞사람 카카오가 남아, 다음 사람의 저장이
  //   앞사람 회원 줄로 들어갈 수 있었다(회원 식별이 카카오 우선이 되면서 위험 격상).
  "ruru_kakao_id",
  "ruru_kakao_nickname",
  "ruru_kakao_profile_image",
] as const;

const readStorage = (key: string) => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) || "";
};

export const readSavedCustomerInfo = (): SavedCustomerInfo => {
  return {
    youtubeNickname: readStorage("ruru_youtube_nickname"),
    customerName: readStorage("ruru_customer_name"),
    customerPhone: readStorage("ruru_customer_phone"),
    zipcode: readStorage("ruru_customer_zipcode"),
    address: readStorage("ruru_customer_address"),
    detailAddress: readStorage("ruru_customer_detail_address"),
  };
};

export const hasSavedCustomerInfo = (info: SavedCustomerInfo) => {
  return Boolean(
    info.customerPhone.trim() ||
      info.youtubeNickname.trim() ||
      info.customerName.trim() ||
      info.address.trim()
  );
};

export const getCustomerGreetingName = (info: SavedCustomerInfo) => {
  return (info.youtubeNickname || info.customerName || "").trim();
};

export const clearSavedCustomerInfo = () => {
  if (typeof window === "undefined") return;

  CUSTOMER_STORAGE_KEYS.forEach((key) => {
    window.localStorage.removeItem(key);
  });
  // [2026-08-31] 닉네임 재확인 깃발도 함께 청소 (세션 여부 판단 키가 아니라서 목록엔 안 넣는다)
  try { window.localStorage.removeItem("ruru_nickname_reconfirm"); } catch { /* 무시 */ }
};

export const markCustomerSessionVersionCurrent = () => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(CUSTOMER_SESSION_VERSION_KEY, REQUIRED_CUSTOMER_SESSION_VERSION);
};

export const isCustomerSessionVersionCurrent = () => {
  if (typeof window === "undefined") return true;

  return window.localStorage.getItem(CUSTOMER_SESSION_VERSION_KEY) === REQUIRED_CUSTOMER_SESSION_VERSION;
};

export const hasAnySavedCustomerStorage = () => {
  if (typeof window === "undefined") return false;

  return CUSTOMER_STORAGE_KEYS.some((key) => Boolean(window.localStorage.getItem(key)));
};

export const clearLegacyCustomerSessionIfNeeded = () => {
  if (typeof window === "undefined") return false;

  if (isCustomerSessionVersionCurrent()) return false;
  if (!hasAnySavedCustomerStorage()) return false;

  clearSavedCustomerInfo();
  window.localStorage.removeItem("ruru_kakao_id");
  window.localStorage.removeItem("ruru_kakao_nickname");
  window.localStorage.removeItem(CUSTOMER_SESSION_VERSION_KEY);
  window.localStorage.removeItem(YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY);

  return true;
};

export const markYoutubeNicknameConfirmVersionCurrent = () => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY,
    REQUIRED_YOUTUBE_NICKNAME_CONFIRM_VERSION,
  );
};

export const isYoutubeNicknameConfirmVersionCurrent = () => {
  if (typeof window === "undefined") return true;

  return (
    window.localStorage.getItem(YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY) ===
    REQUIRED_YOUTUBE_NICKNAME_CONFIRM_VERSION
  );
};

// [2026-08-31 사고수정] 로그아웃이 장바구니를 안 지웠다.
//   실측: 사장님 계정 재로그인 테스트(02:31) 때 예전에 담아둔 상품이 복원되며
//   담김 현황에 유령 선점으로 잡혔다. 공용 폰이면 남의 장바구니가 다음 사람에게 보인다.
//   → 명시적 로그아웃에서만 부른다. (강제 재로그인/버전 청소에서는 부르지 않는다 —
//      진행 중인 손님 장바구니를 일괄 날리면 팔릴 물건이 사라진다)
export const clearCartOnLogout = () => {
  if (typeof window === "undefined") return;
  try {
    const sessionKey = window.localStorage.getItem("ruru_cart_session_key") || "";
    if (sessionKey) {
      // 서버 선점도 지운다 — 페이지가 곧 이동하므로 keepalive 로 보낸다. 실패해도 TTL 로 풀린다.
      void fetch("/api/cart-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ action: "clear", sessionKey }),
      }).catch(() => {});
    }
    window.localStorage.removeItem("ruru_order_draft_v1");
    window.localStorage.removeItem("ruru_cart_session_key");
  } catch { /* 저장소 접근 불가 환경 */ }
};
