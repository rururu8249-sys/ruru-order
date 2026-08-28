import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    console.error(`CUSTOMER_DETAIL_RED_EXPECTED: ${message}`);
    process.exit(1);
  }
}

const quick = fs.readFileSync("components/admin-live/quick-product/QuickProductFastForm.tsx", "utf8");
const order = fs.readFileSync("app/order/page.tsx", "utf8");
const submit = fs.readFileSync("app/api/customer-orders/submit/route.ts", "utf8");

assert(quick.includes("customer_detail_input_enabled"), "상품등록 저장 플래그가 아직 없습니다.");
assert(quick.includes("세부상품명 고객 직접입력"), "상품등록 ON/OFF UI가 아직 없습니다.");
assert(order.includes("registeredOptionCustomerDetail"), "고객 주문 입력 상태가 아직 없습니다.");
assert(order.includes("세부상품명을 입력해 주세요"), "고객 주문 입력 UI/검증이 아직 없습니다.");
assert(submit.includes("canonicalCustomerDetailProductName"), "서버 제출 정규화 검증이 아직 없습니다.");

const {
  CUSTOMER_DETAIL_NAME_MAX_LENGTH,
  buildCustomerDetailProductName,
  canonicalCustomerDetailProductName,
  customerDetailInputEnabled,
  extractCustomerDetailName,
  normalizeCustomerDetailName,
} = await import("../lib/customerDetailProductName.ts");

assert(CUSTOMER_DETAIL_NAME_MAX_LENGTH === 80, "고객 세부상품명 최대 길이는 80자여야 합니다.");
assert(normalizeCustomerDetailName("  루이비통 \n 네버풀   MM  ") === "루이비통 네버풀 MM", "공백/줄바꿈 정규화");
assert(normalizeCustomerDetailName("가".repeat(100)).length === 80, "최대 80자 제한");

assert(customerDetailInputEnabled({ customer_detail_input_enabled: true }) === true, "일반 상품 ON 허용");
assert(customerDetailInputEnabled(JSON.stringify({ customer_detail_input_enabled: true })) === true, "문자열 product_note 허용");
assert(customerDetailInputEnabled({ customer_detail_input_enabled: false }) === false, "OFF 차단");
assert(customerDetailInputEnabled({ customer_detail_input_enabled: true, combo_mode: true }) === false, "기존 조합형 상품은 안전상 차단");
assert(customerDetailInputEnabled({ customer_detail_input_enabled: true, brand_group: { enabled: true } }) === false, "브랜드 대표상품은 안전상 차단");

const built = buildCustomerDetailProductName("가방 특가", " 루이비통   네버풀 MM ");
assert(built === "가방 특가 · 루이비통 네버풀 MM", "주문 상품명 합성");
assert(extractCustomerDetailName("가방 특가", built) === "루이비통 네버풀 MM", "주문 상품명에서 고객 세부상품명 복원");
assert(extractCustomerDetailName("가방 특가", "다른상품 · 네버풀") === "", "다른 기본상품명에서 잘못 복원 금지");
assert(canonicalCustomerDetailProductName("가방 특가", "가방 특가 ·   루이비통  네버풀 MM") === built, "서버 canonical 이름 정규화");
assert(canonicalCustomerDetailProductName("가방 특가", "가방 특가") === "", "세부상품명 누락 시 서버 검증 실패");

console.log("customer detail product name tests passed");
