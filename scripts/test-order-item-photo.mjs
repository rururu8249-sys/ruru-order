// [2026-08-31] 주문 항목 사진 연결 공용 규칙 테스트 — 전수조사에서 나온 실제 사례 기반
import { resolveOrderItemPhoto } from "../lib/orderItemPhoto.ts";

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = got === want;
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
}

// 3단 상품 픽스처 — 실데이터 구조(combo_mode + detail_photos)
function combo(names, photos) {
  return {
    id: "t1", product_name: "묶음", image_urls: ["group-first.jpg"],
    product_note: JSON.stringify({ combo_mode: true, combo_detail_values: names, detail_photos: photos || Object.fromEntries(names.map((n) => [n, `photo:${n}`])) }),
  };
}

// 1) 이름 수정 후 옛 주문 — 코드 매칭으로 생존 (MIU-201 실사례)
{
  const p = combo(["MIU(미우미우)-201 초코바나나 가디건", "MIU(미우미우)-38 상의"]);
  const r = resolveOrderItemPhoto(p, { productName: "MIU(미우미우)-201 가디건", color: "없음" });
  check("이름수정 코드매칭", r.matchedDetailName, "MIU(미우미우)-201 초코바나나 가디건");
  const r2 = resolveOrderItemPhoto(p, { productName: "MIU(미우미우)-201 상의", color: "없음" });
  check("이름수정 코드매칭2", r2.matchedDetailName, "MIU(미우미우)-201 초코바나나 가디건");
}

// 2) "특가" 접두어 — 코드는 문장 중간에 있어도 추출 (특가 MIU-24 실사례)
{
  const p = combo(["MIU(미우미우)-24 상의", "MIU(미우미우)-34 상의"]);
  const r = resolveOrderItemPhoto(p, { productName: "특가 MIU(미우미우)-24 상의", color: "없음" });
  check("특가 접두어", r.matchedDetailName, "MIU(미우미우)-24 상의");
}

// 3) 색상칸이 세부상품명의 앞부분 (이솝 테싯 실사례)
{
  const p = combo(["이솝 테싯50ml", "이솝 휠50ml"]);
  const r = resolveOrderItemPhoto(p, { productName: "이솝 향수", color: "이솝 테싯" });
  check("앞부분 매칭", r.matchedDetailName, "이솝 테싯50ml");
}

// 4) 괄호 차이 흡수 (립 샤넬 90호 고윤정/고윤정립 실사례)
{
  const p = combo(["립 샤넬 코코플래쉬 90호(고윤정)", "립 샤넬 코코플래쉬 144호", "립 샤넬 코코플래쉬 148호"]);
  const r = resolveOrderItemPhoto(p, { productName: "립", color: "립 샤넬 코코플래쉬 90호(고윤정립)" });
  check("괄호 차이", r.matchedDetailName, "립 샤넬 코코플래쉬 90호(고윤정)");
  const r2 = resolveOrderItemPhoto(p, { productName: "립", color: "립 샤넬 코코플래쉬 90호" });
  check("괄호 없이", r2.matchedDetailName, "립 샤넬 코코플래쉬 90호(고윤정)");
}

// 5) 로에베 아이레(수텔레사) — 오타·괄호 표기 차이 (실사례)
{
  const p = combo(["로에베 맨 001", "로에베 아이레 수틸레사", "로에베 우먼 001"]);
  const r = resolveOrderItemPhoto(p, { productName: "로에베 향수", color: "로에베 아이레(수텔레사)" });
  check("괄호제거 접두", r.matchedDetailName, "로에베 아이레 수틸레사");
  const r2 = resolveOrderItemPhoto(p, { productName: "로에베 향수", color: "로에베 아이레" });
  check("짧은 접두", r2.matchedDetailName, "로에베 아이레 수틸레사");
}

// 6) 어느 세부상품인지 모호하면 사진 없음 — 엉뚱한 사진 금지
{
  const p = combo(["립 A레드", "립 B핑크"]);
  const r = resolveOrderItemPhoto(p, { productName: "립", color: "없음" });
  check("모호 → 사진없음", r.source, "none");
  check("모호 → url 빈값", r.url, "");
}

// 7) 세부상품이 아예 없어진 표기(메종 썬데이모닝 실사례) → 사진 없음
{
  const p = combo(["메종 마르지엘라 버블배쓰", "메종 마르지엘라 세일링데이"]);
  const r = resolveOrderItemPhoto(p, { productName: "메종 마르지엘라 향수", color: "메종 썬데이모닝" });
  check("삭제된 세부 → 사진없음", r.source, "none");
}

// 8) 기존 정상 케이스 그대로 — 정확 일치·「세부 / 색상」 색상칸
{
  const p = combo(["MIU(미우미우)-201 초코바나나 가디건", "MIU(미우미우)-38 상의"]);
  const r = resolveOrderItemPhoto(p, { productName: "MIU(미우미우)-201 초코바나나 가디건", color: "없음" });
  check("정확 일치", r.matchedDetailName, "MIU(미우미우)-201 초코바나나 가디건");
  const r2 = resolveOrderItemPhoto(p, { productName: "미우미우", color: "MIU(미우미우)-201 초코바나나 가디건 / 없음" });
  check("색상칸 세부/색상", r2.matchedDetailName, "MIU(미우미우)-201 초코바나나 가디건");
}

// 9) 비슷한 코드끼리 안 섞임 — BB-80 vs BB-801 / BB-84M vs BB-84
{
  const p = combo(["BB(버버리)-80 전지현 트렌치코트", "BB(버버리)-801 상의", "BB(버버리)-84M 남성용", "BB(버버리)-84 아우터"]);
  const r = resolveOrderItemPhoto(p, { productName: "BB(버버리)-80 트렌치코트", color: "없음" });
  check("BB-80 정확", r.matchedDetailName, "BB(버버리)-80 전지현 트렌치코트");
  const r2 = resolveOrderItemPhoto(p, { productName: "BB(버버리)-84M 패딩", color: "없음" });
  check("BB-84M 구분", r2.matchedDetailName, "BB(버버리)-84M 남성용");
}

// 10) 일반(2단) 상품 — 대표사진 유지
{
  const p = { id: "t2", product_name: "뉴발란스1906A", image_url: "direct.jpg", product_note: "" };
  const r = resolveOrderItemPhoto(p, { productName: "뉴발란스1906A그린 캐주얼", color: "그린" });
  check("2단 대표사진", r.url, "direct.jpg");
  check("2단 source", r.source, "direct");
}

// 11) 세부상품 사진이 등록 안 된 경우 → 묶음 첫 사진이라도 (detailProducts가 채워줌)
{
  const p = combo(["단독 세부"], { "단독 세부": "" });
  const r = resolveOrderItemPhoto(p, { productName: "단독 세부", color: "없음" });
  check("세부 사진없음 폴백", r.url, "group-first.jpg");
}

console.log(`pass=${pass} fail=${fail}`);
if (fail > 0) process.exit(1);
