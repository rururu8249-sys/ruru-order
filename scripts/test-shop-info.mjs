// [2026-09-08] 설정 › 상점 정보 — settings 줄 → ShopInfo 해석 / 저장 전 검사 / 손님 문구
//   실행: node --import ./scripts/_ts-resolve.mjs scripts/test-shop-info.mjs
import {
  SHOP_INFO_DEFAULTS,
  adminChatTarget,
  bankLine,
  contactDesc,
  contactHref,
  contactLabel,
  parseShopInfo,
  toShopInfoRows,
  validateShopInfo,
} from "../lib/shopInfo.ts";

function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected=${String(expected)} actual=${String(actual)}`);
}

// 1) 아무것도 저장 안 됨 → 기본값(예전 하드코딩값) 그대로
{
  const info = parseShopInfo([]);
  equal(info.contactType, "channel", "기본 문의방식");
  equal(info.contactValue, SHOP_INFO_DEFAULTS.contactValue, "기본 채널 주소");
  equal(info.adminChatUrl, SHOP_INFO_DEFAULTS.adminChatUrl, "기본 관리자 콘솔 주소");
  equal(info.bankAccount, "9002186993725", "기본 계좌");
  equal(bankLine(info), "새마을금고 9002186993725 (유혜원)", "계좌 한 줄");
  equal(parseShopInfo(null).paysterUrl, SHOP_INFO_DEFAULTS.paysterUrl, "null 도 기본값");
}

// 2) 계좌 3개 중 하나라도 비면 3개 모두 기본값 (새 번호 + 옛 예금주 섞임 방지)
{
  const info = parseShopInfo([
    { key: "shop_bank_name", value: "국민은행" },
    { key: "shop_bank_account", value: "123456-78-901234" },
  ]);
  equal(info.bankName, "새마을금고", "예금주 없으면 은행도 기본값");
  equal(info.bankAccount, "9002186993725", "예금주 없으면 계좌도 기본값");
}
{
  const info = parseShopInfo([
    { key: "shop_bank_name", value: "국민은행" },
    { key: "shop_bank_account", value: "123456-78-901234" },
    { key: "shop_bank_holder", value: "홍길동" },
  ]);
  equal(bankLine(info), "국민은행 123456-78-901234 (홍길동)", "3개 다 있으면 저장값");
}

// 3) 문의 방식 — 형식이 틀리면 기본값으로
{
  const bad = parseShopInfo([{ key: "shop_contact_type", value: "kakao_id" }, { key: "shop_contact_value", value: "" }]);
  equal(bad.contactType, "channel", "ID 비면 채널 기본값");
  const id = parseShopInfo([{ key: "shop_contact_type", value: "kakao_id" }, { key: "shop_contact_value", value: "ruru_live" }]);
  equal(id.contactType, "kakao_id", "ID 방식");
  equal(contactHref(id), null, "ID 방식은 링크 없음");
  equal(contactLabel(id, "long"), "카카오톡 ID「ruru_live」로 문의하기", "ID 긴 글자");
  equal(contactDesc(id).includes("ruru_live"), true, "ID 설명에 ID 포함");
  equal(id.adminChatUrl, "", "방식 바꿨고 콘솔 주소 없으면 비움");
  equal(adminChatTarget(id).kind, "id", "관리자 버튼은 ID 복사");
  // [2026-09-08 사장님] 오픈채팅은 안 씀 — 예전에 저장된 값이 있어도 기본(채널)으로 떨어진다
  const open = parseShopInfo([{ key: "shop_contact_type", value: "openchat" }, { key: "shop_contact_value", value: "https://open.kakao.com/o/abc" }]);
  equal(open.contactType, "channel", "오픈채팅 저장값은 무시 → 채널 기본값");
  equal(validateShopInfo({ ...SHOP_INFO_DEFAULTS, contactType: "openchat", contactValue: "https://open.kakao.com/o/abc" }).ok, false, "오픈채팅 저장 거부");
  const ch = parseShopInfo([
    { key: "shop_contact_type", value: "channel" },
    { key: "shop_contact_value", value: "https://pf.kakao.com/_abc" },
    { key: "shop_admin_chat_url", value: "https://business.kakao.com/_abc/chats" },
  ]);
  equal(adminChatTarget(ch).url, "https://business.kakao.com/_abc/chats", "콘솔 주소 있으면 그걸 연다");
  equal(contactLabel(ch, "long"), "카톡채널로 문의하기", "채널 긴 글자 = 예전 문구 그대로");
}

// 4) 저장 전 검사
{
  const base = { ...SHOP_INFO_DEFAULTS };
  equal(validateShopInfo(base).ok, true, "기본값은 통과");
  equal(validateShopInfo({ ...base, contactType: "kakao_id", contactValue: "ab" }).ok, false, "ID 2자 거부");
  equal(validateShopInfo({ ...base, contactType: "kakao_id", contactValue: "ruru.live_1" }).ok, true, "ID 형식 통과");
  equal(validateShopInfo({ ...base, contactType: "channel", contactValue: "pf.kakao.com/_abc" }).ok, false, "https 없는 주소 거부");
  equal(validateShopInfo({ ...base, contactType: "gogo" }).ok, false, "모르는 방식 거부");
  equal(validateShopInfo({ ...base, bankAccount: "" }).ok, false, "계좌 비면 거부");
  equal(validateShopInfo({ ...base, bankAccount: "12ab34" }).ok, false, "계좌에 글자 거부");
  equal(validateShopInfo({ ...base, bankHolder: "" }).ok, false, "예금주 비면 거부");
  equal(validateShopInfo({ ...base, paysterUrl: "javascript:alert(1)" }).ok, false, "페이스터 주소 형식 거부");
  const ok = validateShopInfo({ ...base, bankAccount: " 1234-5678 ", adminChatUrl: "" });
  equal(ok.ok && ok.value.bankAccount, "1234-5678", "계좌 공백 정리");
  equal(validateShopInfo(null).ok, false, "본문 없으면 거부");
  const rows = toShopInfoRows(base);
  equal(rows.length, 7, "저장 줄 7개");
  equal(rows.every((r) => r.key.startsWith("shop_")), true, "shop_ 키만 쓴다");
}

console.log("shop info tests passed");
