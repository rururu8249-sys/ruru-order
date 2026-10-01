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

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  // 구버전 관리자 번들은 구조화 계좌 필드 없이 flat 3키만 보낸다.
  const base = {
    contactType: SHOP_INFO_DEFAULTS.contactType,
    contactValue: SHOP_INFO_DEFAULTS.contactValue,
    adminChatUrl: SHOP_INFO_DEFAULTS.adminChatUrl,
    paysterUrl: SHOP_INFO_DEFAULTS.paysterUrl,
    bankName: SHOP_INFO_DEFAULTS.bankName,
    bankAccount: SHOP_INFO_DEFAULTS.bankAccount,
    bankHolder: SHOP_INFO_DEFAULTS.bankHolder,
  };
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
  const checkedBase = validateShopInfo(base);
  assert(checkedBase.ok, "구버전 flat 설정은 구조화 설정으로 변환되어야 한다");
  const rows = toShopInfoRows(checkedBase.value);
  equal(rows.length, 8, "저장 줄 8개");
  equal(rows.every((r) => r.key.startsWith("shop_")), true, "shop_ 키만 쓴다");
}

// 5) 예전 7키만 있어도 기본계좌 1개 + 전체고객 모드로 안전하게 마이그레이션
{
  const legacy = parseShopInfo([
    { key: "shop_bank_name", value: "국민은행" },
    { key: "shop_bank_account", value: "123456-78-901234" },
    { key: "shop_bank_holder", value: "홍길동" },
  ]);
  assert(Array.isArray(legacy.bankAccounts), "legacy 설정도 bankAccounts 배열을 제공해야 한다");
  equal(legacy.bankAccounts.length, 1, "legacy 계좌는 primary 한 개");
  equal(legacy.bankAccounts[0].id, "primary", "legacy 계좌 id");
  equal(legacy.bankAccounts[0].enabled, true, "legacy 계좌 활성");
  equal(legacy.bankRouting.mode, "all", "legacy는 전체고객 모드");
  equal(legacy.bankRouting.allAccountId, "primary", "legacy 전체 계좌");
}

// 6) v1 설정 두 계좌 + 회원구분 라우팅 해석
const splitConfig = {
  version: 1,
  accounts: [
    { id: "primary", enabled: true, label: "기존 계좌", bankName: "국민은행", bankAccount: "111-222-333333", bankHolder: "홍길동" },
    { id: "secondary", enabled: true, label: "신규 계좌", bankName: "신한은행", bankAccount: "444-555-666666", bankHolder: "김루루" },
  ],
  routing: { mode: "split", allAccountId: "primary", existingAccountId: "primary", firstOrderAccountId: "secondary" },
};
{
  const parsed = parseShopInfo([
    { key: "shop_bank_config_v1", value: JSON.stringify(splitConfig) },
    { key: "shop_bank_name", value: "무시은행" },
    { key: "shop_bank_account", value: "999999" },
    { key: "shop_bank_holder", value: "무시" },
  ]);
  equal(parsed.bankAccounts.length, 2, "v1 계좌 두 개");
  equal(parsed.bankRouting.mode, "split", "회원 구분 모드");
  equal(parsed.bankRouting.firstOrderAccountId, "secondary", "첫 주문 계좌");
  equal(parsed.bankName, "국민은행", "flat 은 primary 동기화");
  equal(bankLine(parsed.bankAccounts[1]), "신한은행 444-555-666666 (김루루)", "명시 계좌 한 줄");
}

// 7) 직렬화는 v1 JSON + legacy primary 3키를 함께 저장
{
  const checked = validateShopInfo({ ...SHOP_INFO_DEFAULTS, bankAccounts: splitConfig.accounts, bankRouting: splitConfig.routing });
  assert(checked.ok, "정상 split 설정은 통과해야 한다");
  const rows = toShopInfoRows(checked.value);
  equal(rows.length, 8, "설정 줄 8개");
  const configRow = rows.find((r) => r.key === "shop_bank_config_v1");
  assert(configRow, "v1 설정 줄이 있어야 한다");
  equal(configRow.value, JSON.stringify(splitConfig), "v1 JSON 결정적 직렬화");
  equal(rows.find((r) => r.key === "shop_bank_name")?.value, "국민은행", "legacy 은행은 primary와 동기화");
  equal(rows.find((r) => r.key === "shop_bank_account")?.value, "111-222-333333", "legacy 번호는 primary와 동기화");
  equal(rows.find((r) => r.key === "shop_bank_holder")?.value, "홍길동", "legacy 예금주는 primary와 동기화");
}

// 8) 잘못된 계좌/라우팅은 저장 거부
{
  const third = { id: "third", enabled: true, label: "세 번째", bankName: "우리은행", bankAccount: "777777", bankHolder: "박세번째" };
  equal(validateShopInfo({ ...SHOP_INFO_DEFAULTS, bankAccounts: [...splitConfig.accounts, third], bankRouting: splitConfig.routing }).ok, false, "세 번째 계좌 거부");
  equal(validateShopInfo({ ...SHOP_INFO_DEFAULTS, bankAccounts: [splitConfig.accounts[0], { ...splitConfig.accounts[1], id: "primary" }], bankRouting: splitConfig.routing }).ok, false, "중복 id 거부");
  equal(validateShopInfo({ ...SHOP_INFO_DEFAULTS, bankAccounts: [{ ...splitConfig.accounts[0], bankAccount: "12ab" }], bankRouting: { ...splitConfig.routing, mode: "all" } }).ok, false, "잘못된 계좌번호 거부");
  equal(validateShopInfo({ ...SHOP_INFO_DEFAULTS, bankAccounts: [splitConfig.accounts[0]], bankRouting: splitConfig.routing }).ok, false, "없는 secondary 참조 거부");
  equal(validateShopInfo({ ...SHOP_INFO_DEFAULTS, bankAccounts: [splitConfig.accounts[0], { ...splitConfig.accounts[1], enabled: false }], bankRouting: splitConfig.routing }).ok, false, "비활성 secondary 참조 거부");
}

// 9) split의 두 대상이 같은 활성 계좌여도 허용
{
  const same = validateShopInfo({
    ...SHOP_INFO_DEFAULTS,
    bankAccounts: [splitConfig.accounts[0]],
    bankRouting: { mode: "split", allAccountId: "primary", existingAccountId: "primary", firstOrderAccountId: "primary" },
  });
  equal(same.ok, true, "회원구분 두 대상 같은 계좌 허용");
}

// 10) 저장된 JSON이 깨지면 화면은 legacy 3키로 안전 복구
{
  const parsed = parseShopInfo([
    { key: "shop_bank_config_v1", value: "{broken" },
    { key: "shop_bank_name", value: "하나은행" },
    { key: "shop_bank_account", value: "123-456-789" },
    { key: "shop_bank_holder", value: "복구계좌" },
  ]);
  equal(parsed.bankAccounts.length, 1, "깨진 JSON은 legacy 한 계좌");
  equal(parsed.bankName, "하나은행", "깨진 JSON legacy 복구");
}

console.log("shop info tests passed");
