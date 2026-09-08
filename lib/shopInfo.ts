// lib/shopInfo.ts
// [2026-09-08] 상점 고유값 — 손님 문의 방식 · 카드결제(페이스터) 주소 · 손님에게 보여주는 입금계좌.
//
//   · 어디에 저장? settings 테이블(key/value). 새 키(shop_*)만 추가하고 기존 키는 손대지 않는다.
//   · 기본값 = 이 날짜 이전에 코드에 박혀 있던 값 그대로. 설정이 비어 있거나 못 읽으면
//     예전과 똑같이 보인다(운영 변화 0).
//   · 돈 로직 아님. 여기 계좌는 손님에게 "보여주고 복사해 주는" 값일 뿐이고,
//     입금 판정·뱅크다 자동입금확인·정산은 이 파일을 읽지 않는다.
//   · 저장은 /api/admin-live/shop-info (관리자 세션 + 서비스롤 키)로만 한다.
//     브라우저 anon 키로 직접 쓰지 않는다 — 계좌가 밖에서 바뀌면 안 되니까.

export type ShopContactType = "channel" | "openchat" | "kakao_id";

export type ShopInfo = {
  /** 손님이 문의하는 방법 */
  contactType: ShopContactType;
  /** channel/openchat = 주소(URL), kakao_id = 카카오톡 ID */
  contactValue: string;
  /** 관리자 사이드바 「카톡」 버튼이 여는 주소(선택). 비우면 contactValue 를 연다 */
  adminChatUrl: string;
  /** 카드결제(페이스터) 문자결제 페이지 주소 */
  paysterUrl: string;
  /** 손님에게 보여주는 무통장 입금계좌 */
  bankName: string;
  bankAccount: string;
  bankHolder: string;
};

export const SHOP_INFO_KEYS = [
  "shop_contact_type",
  "shop_contact_value",
  "shop_admin_chat_url",
  "shop_payster_url",
  "shop_bank_name",
  "shop_bank_account",
  "shop_bank_holder",
] as const;
export type ShopInfoKey = (typeof SHOP_INFO_KEYS)[number];

/** 2026-09-08 이전 하드코딩값 그대로. 설정이 없으면 이 값이 나간다. */
export const SHOP_INFO_DEFAULTS: ShopInfo = {
  contactType: "channel",
  contactValue: process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || "https://pf.kakao.com/_RMxaqX",
  adminChatUrl:
    "https://business.kakao.com/_RMxaqX/chats?t_src=business_partnercenter&t_ch=lnb&t_obj=%EB%82%B4%EC%B1%84%ED%8C%85_%ED%81%B4%EB%A6%AD",
  paysterUrl: "https://user.service.payster.co.kr/#/payment/smspayment",
  bankName: "새마을금고",
  bankAccount: "9002186993725",
  bankHolder: "유혜원",
};

export const CONTACT_TYPE_LABEL: Record<ShopContactType, string> = {
  channel: "카카오톡 채널",
  openchat: "카카오톡 오픈채팅",
  kakao_id: "카카오톡 ID (친구 추가)",
};

/** 사이드바 버튼처럼 짧게 부를 때 */
export const CONTACT_TYPE_SHORT: Record<ShopContactType, string> = {
  channel: "카톡채널",
  openchat: "오픈채팅",
  kakao_id: "카톡 ID",
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function isHttpUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value);
}

/** 카카오톡 ID 규칙(카카오 안내): 영문 소문자·숫자·특수문자(- _ .) 4~20자 */
export function isKakaoId(value: string) {
  return /^[a-z0-9._-]{4,20}$/i.test(value);
}

function isValidContact(type: string, value: string): type is ShopContactType {
  if (type === "kakao_id") return isKakaoId(value);
  if (type === "channel" || type === "openchat") return isHttpUrl(value);
  return false;
}

/**
 * settings 줄들 → ShopInfo. 비었거나 형식이 틀린 항목은 기본값으로 떨어진다.
 * 계좌는 은행·번호·예금주 3개가 다 있어야 저장값을 쓰고, 하나라도 비면 3개 모두 기본값
 * (새 계좌번호에 옛 예금주가 섞여 나가는 일이 없게).
 */
export function parseShopInfo(rows: ReadonlyArray<{ key: string; value: unknown }> | null | undefined): ShopInfo {
  const map = new Map<string, string>();
  for (const row of rows || []) {
    if (row && typeof row.key === "string") map.set(row.key, clean(row.value));
  }
  const get = (key: ShopInfoKey) => map.get(key) || "";

  const typeRaw = get("shop_contact_type");
  const valueRaw = get("shop_contact_value");
  const storedContact = isValidContact(typeRaw, valueRaw);
  const contactType: ShopContactType = storedContact ? (typeRaw as ShopContactType) : SHOP_INFO_DEFAULTS.contactType;
  const contactValue = storedContact ? valueRaw : SHOP_INFO_DEFAULTS.contactValue;

  const adminRaw = get("shop_admin_chat_url");
  // 저장된 문의 방식이 없으면(=예전 그대로) 관리자 콘솔 주소도 예전 그대로.
  // 문의 방식을 바꿔 저장했는데 콘솔 주소를 안 적었으면 비워서 contactValue 를 열게 한다.
  const adminChatUrl = isHttpUrl(adminRaw) ? adminRaw : storedContact ? "" : SHOP_INFO_DEFAULTS.adminChatUrl;

  const paysterRaw = get("shop_payster_url");
  const paysterUrl = isHttpUrl(paysterRaw) ? paysterRaw : SHOP_INFO_DEFAULTS.paysterUrl;

  const bankName = get("shop_bank_name");
  const bankAccount = get("shop_bank_account");
  const bankHolder = get("shop_bank_holder");
  const bankOk = Boolean(bankName && bankHolder && isBankAccountNumber(bankAccount));

  return {
    contactType,
    contactValue,
    adminChatUrl,
    paysterUrl,
    bankName: bankOk ? bankName : SHOP_INFO_DEFAULTS.bankName,
    bankAccount: bankOk ? bankAccount : SHOP_INFO_DEFAULTS.bankAccount,
    bankHolder: bankOk ? bankHolder : SHOP_INFO_DEFAULTS.bankHolder,
  };
}

/** 계좌번호: 숫자·하이픈만, 숫자 6자리 이상 */
export function isBankAccountNumber(value: string) {
  return /^[0-9-]{6,30}$/.test(value) && value.replace(/[^0-9]/g, "").length >= 6;
}

/** ShopInfo → settings upsert 줄들 */
export function toShopInfoRows(info: ShopInfo): Array<{ key: ShopInfoKey; value: string }> {
  return [
    { key: "shop_contact_type", value: info.contactType },
    { key: "shop_contact_value", value: info.contactValue },
    { key: "shop_admin_chat_url", value: info.adminChatUrl },
    { key: "shop_payster_url", value: info.paysterUrl },
    { key: "shop_bank_name", value: info.bankName },
    { key: "shop_bank_account", value: info.bankAccount },
    { key: "shop_bank_holder", value: info.bankHolder },
  ];
}

export type ShopInfoValidation = { ok: true; value: ShopInfo } | { ok: false; message: string };

/** 저장 전 검사 — 화면(설정 탭)과 서버(API)가 같은 함수를 쓴다 */
export function validateShopInfo(input: Partial<Record<keyof ShopInfo, unknown>> | null | undefined): ShopInfoValidation {
  const src = input || {};
  const contactTypeRaw = clean(src.contactType);
  const contactValue = clean(src.contactValue);
  const adminChatUrl = clean(src.adminChatUrl);
  const paysterUrl = clean(src.paysterUrl);
  const bankName = clean(src.bankName);
  const bankAccount = clean(src.bankAccount).replace(/\s+/g, "");
  const bankHolder = clean(src.bankHolder);

  if (contactTypeRaw !== "channel" && contactTypeRaw !== "openchat" && contactTypeRaw !== "kakao_id") {
    return { ok: false, message: "문의 방식을 골라 주세요." };
  }
  const contactType = contactTypeRaw as ShopContactType;
  if (contactType === "kakao_id") {
    if (!isKakaoId(contactValue)) return { ok: false, message: "카카오톡 ID는 영문·숫자·기호(- _ .) 4~20자로 적어 주세요." };
  } else if (!isHttpUrl(contactValue)) {
    return { ok: false, message: `${CONTACT_TYPE_LABEL[contactType]} 주소는 https:// 로 시작하는 주소여야 합니다.` };
  }
  if (adminChatUrl && !isHttpUrl(adminChatUrl)) {
    return { ok: false, message: "관리자 채팅 콘솔 주소는 https:// 로 시작하는 주소여야 합니다." };
  }
  if (!isHttpUrl(paysterUrl)) {
    return { ok: false, message: "카드결제(페이스터) 주소는 https:// 로 시작하는 주소여야 합니다." };
  }
  if (!bankName || bankName.length > 30) return { ok: false, message: "은행 이름을 적어 주세요. (30자까지)" };
  if (!isBankAccountNumber(bankAccount)) return { ok: false, message: "계좌번호는 숫자(하이픈 포함 가능) 6자리 이상으로 적어 주세요." };
  if (!bankHolder || bankHolder.length > 30) return { ok: false, message: "예금주를 적어 주세요. (30자까지)" };

  return {
    ok: true,
    value: { contactType, contactValue, adminChatUrl, paysterUrl, bankName, bankAccount, bankHolder },
  };
}

// ───────────── 손님 화면 문구 ─────────────

/** "새마을금고 9002186993725 (유혜원)" 꼴 — 쪽지·복사 문구용 */
export function bankLine(info: ShopInfo): string {
  return `${info.bankName} ${info.bankAccount} (${info.bankHolder})`;
}

/** 링크로 열 수 있는 주소. 카카오톡 ID 방식이면 null(누르면 ID 복사) */
export function contactHref(info: ShopInfo): string | null {
  return info.contactType === "kakao_id" ? null : info.contactValue;
}

/** 버튼 글자. short = "카톡채널 문의", long = "카톡채널로 문의하기" */
export function contactLabel(info: ShopInfo, form: "short" | "long" = "short"): string {
  switch (info.contactType) {
    case "openchat":
      return form === "long" ? "오픈채팅으로 문의하기" : "오픈채팅 문의";
    case "kakao_id":
      return form === "long" ? `카카오톡 ID「${info.contactValue}」로 문의하기` : `카톡 ID「${info.contactValue}」문의`;
    default:
      return form === "long" ? "카톡채널로 문의하기" : "카톡채널 문의";
  }
}

/** 버튼 아래 설명 한 줄 */
export function contactDesc(info: ShopInfo): string {
  switch (info.contactType) {
    case "openchat":
      return "입금·배송·주문 문의는 오픈채팅으로 남겨 주세요.";
    case "kakao_id":
      return `카카오톡에서 ID「${info.contactValue}」를 친구 추가하고 문의해 주세요.`;
    default:
      return "입금·배송·주문 문의는 카톡채널로 남겨 주세요.";
  }
}

/** 차단 안내 등에서 "문의는 ○○로 부탁드립니다." */
export function contactGuideSentence(info: ShopInfo): string {
  switch (info.contactType) {
    case "openchat":
      return "문의는 오픈채팅으로 부탁드립니다.";
    case "kakao_id":
      return `문의는 카카오톡 ID「${info.contactValue}」(친구 추가)로 부탁드립니다.`;
    default:
      return "문의는 카톡채널로 부탁드립니다.";
  }
}

/** 관리자 사이드바 「카톡」 버튼이 할 일 */
export function adminChatTarget(info: ShopInfo): { kind: "url"; url: string } | { kind: "id"; id: string } {
  if (info.adminChatUrl) return { kind: "url", url: info.adminChatUrl };
  if (info.contactType === "kakao_id") return { kind: "id", id: info.contactValue };
  return { kind: "url", url: info.contactValue };
}
