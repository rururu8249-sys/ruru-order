// [2026-09-03] 자동 썸네일 단어→그림 매핑 테스트 — 전수조사·사장님 정정에서 나온 실제 사례 누적
// 규칙 파일을 고칠 때마다 반드시 통과해야 함. 새 사고가 나면 케이스를 여기에 추가.
import { productThumbArtKey } from "../lib/brandWordmarkThumbnail.ts";

const cases = [
  // 신발 — 브랜드는 각자, 일반 단어는 무지 운동화
  ["운동화 240", "sneakers"], ["스니커즈", "sneakers"], ["미즈노 러닝화", "sneakers"],
  ["브룩스 고스트", "sneakers"], ["살로몬 XT-6", "sneakers"],
  ["뉴발란스 2002R", "newbalance"], ["뉴발 993", "newbalance"],
  ["노다 트레일", "norda"], ["호카 본디", "hoka"], ["아식스 젤카야노", "asics"],
  ["조던1", "nike"], ["나이키 에어포스", "nike"], ["나이키 에어맥스", "nike"], // 에어포스가 건어물(어포)로 새면 안 됨
  ["크록스 바야밴드", "crocs"], ["힐 240", "heels"], ["샌들 235", "sandals"],
  // 의류 — 브랜드·구체 단어 우선순위
  ["나이키 후드집업", "hoodie"], ["반팔 티셔츠", "tshirt"], ["몽클레어 가디건", "cardigan"],
  ["몽클레어", "padding"], ["MC(몽클레어)-101M 남성용 아우터", "padding"],
  ["버버리", "trench"], ["BB(버버리)-39 아우터", "trench"], ["여성 간절기 아우터", "trench"],
  ["무난한 니트", "knit"], ["밴드타입 원피스", "dress"],
  // 뷰티 — 사장님 정정: 스파클링 부스터=화장품
  ["더유핏 스파클링 부스터", "skincare"], ["시카 버블 스파클링 부스터", "skincare"],
  ["지수씨 미스트", "skincare"], ["노니 때비누", "skincare"], ["잇츠쏘미 콜라겐 필오프 마스크", "skincare"],
  ["르베라쥬 여성청결제", "skincare"], ["쫀득폼 4종류", "skincare"], ["스파겔 뱃살패치 5장 1박스", "skincare"],
  ["기미톡스3.0(80g)", "skincare"], ["잇츠쏘미 시카 프로바이오틱스 페미닌 워시", "skincare"],
  ["마스크팩 10매", "skincare"], ["마스카라", "cosmetics"],
  // 향수 — 브랜드·향 노트
  ["소바쥬", "perfume"], ["어디틱", "perfume"], ["1번 플로럴", "perfume"], ["2번 머스크", "perfume"],
  // 식품·음료·생활
  ["티나는 스물넷", "drink"], ["탄산수 500ml", "drink"], ["레몬 에이드", "drink"], ["티백 선물세트", "drink"],
  ["육포", "snack"], ["박달대게 대짜", "snack"], ["쥐포", "snack"], ["꾸이맨", "snack"],
  ["대왕발", "snack"], ["건오징어 철판구이", "snack"], ["엑스트라버진 올리브오일", "snack"],
  ["바디워시 대용량", "detergent"], ["모델 곰팡이 제거젤", "detergent"], ["이염방지시트50장", "detergent"], ["건조기 시트", "detergent"],
  ["일본칫솔1(12개세트)", "daily"], ["반려동물 1구 밥그릇(2컬러)", "daily"], ["분리수거봉투 70매", "daily"],
  ["뜯어쓰는 12겹 수세미", "daily"], ["르베르텀블러", "daily"], ["피카츄 밴드", "daily"],
  // 가방·잡화 — 백/팩/티 함정
  ["백팩", "backpack"], ["롱샴 르플리아쥬", "bag"], ["지갑", "wallet"],
  ["헤어밴드", "hairacc"], ["곱창밴드 세트", "hairacc"],
  ["무료나눔 상품당첨자(색상에 무나당첨 내역 작성 필수)", "randombox"],
  // 미인식(의도) — 엉뚱한 그림 금지, 글자 카드
  ["타임특가", ""], ["CH-33", ""], ["연어콜라겐&글루타치온60정", ""], ["떠아님 짱구공룡인형", ""],
];

let pass = 0, fail = 0;
for (const [name, want] of cases) {
  const got = productThumbArtKey(name, "");
  if (got === want) pass++;
  else { fail++; console.log(`FAIL: ${name} → ${got || "(글자카드)"} (원함: ${want || "(글자카드)"})`); }
}
console.log(`auto-thumb: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
