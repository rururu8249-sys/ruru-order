// lib/assistantAgent.ts
// [2026-10-22 AI 비서 8단계] 대화창 하나 — AI 가 «도구»를 골라 쓰는 비서(순수 선언·판정, DB·화면 코드 없음).
//   읽기 도구(find_customer·find_product·sales_stats·list_memos·get_reply_policy·broadcast_products)는 서버가 바로 실행.
//   쓰기 도구(propose_memo·propose_issue·propose_reply·propose_seo)는 «실행하지 않고» 화면에 카드로 보여주고,
//   사장님이 카드의 버튼(저장·등록·복사)을 눌러야만 기존 API 로 저장된다. 돈·입금·정산·주문상태는 도구가 없다(못 바꿈).
//   AI 로 가는 손님 정보 = 닉네임·이름·주문 내용·숫자까지(사장님 결정 10/22). 전화·주소·계좌는 서버가 화면에만.
import type { GeminiToolDecl } from "./geminiJson";

export const AGENT_TOOLS: GeminiToolDecl[] = [
  {
    name: "find_customer",
    description: "손님(닉네임·이름·주문자·받는 분)을 찾아 최근 주문·입금 상태를 본다. 손님 이야기가 나오면 먼저 이걸로 누구인지 확인한다.",
    parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "닉네임이나 이름 그대로(조사 떼고)" }, range: { type: "STRING", description: "화면 기간(기본) 또는 all(전체 기간)" } }, required: ["query"] },
  },
  {
    name: "find_product",
    description: "상품을 이름으로 찾아 산 손님·수량을 본다.",
    parameters: { type: "OBJECT", properties: { query: { type: "STRING" }, range: { type: "STRING", description: "화면 기간(기본) 또는 all(전체 기간)" } }, required: ["query"] },
  },
  {
    name: "sales_stats",
    description: "기간 안 매출 집계표(합계·날짜별·방송별·상품별·손님 순위)를 받는다. 매출·순위·비교·추세 질문은 이걸로.",
    parameters: {
      type: "OBJECT",
      properties: {
        period: { type: "STRING", description: "today|yesterday|last_7_days|last_30_days|this_week|last_week|this_month|last_month|last_3_months|last_broadcast|date|custom|all. 사장님이 기간을 안 말했으면 화면 기간(context.range)을 그대로" },
        date: { type: "STRING", description: "period=date 일 때 YYYY-MM-DD" },
        from: { type: "STRING", description: "period=custom 시작 YYYY-MM-DD" },
        to: { type: "STRING", description: "period=custom 끝 YYYY-MM-DD" },
      },
      required: ["period"],
    },
  },
  { name: "list_memos", description: "사장님이 저장해 둔 메모(할 일·손님·상품·기억할 것)를 본다.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_reply_policy", description: "손님 응대 방침(말투·교환반품·배송·입금 규칙)을 본다. 손님에게 보낼 답장을 쓰기 전에 꼭 본다.", parameters: { type: "OBJECT", properties: {} } },
  {
    name: "broadcast_products",
    description: "방송(최근 12개 중 하나)에 담긴 상품 목록·날짜를 본다. 유튜브 제목·설명·태그를 만들기 전에 본다.",
    parameters: { type: "OBJECT", properties: { broadcastId: { type: "STRING", description: "비우면 가장 최근(또는 예정) 방송" } } },
  },
  {
    name: "propose_memo",
    description: "메모로 저장하자고 제안한다(사장님이 저장 버튼을 눌러야 저장됨). 기억해 달라·적어 달라·할 일이면 이걸로.",
    parameters: { type: "OBJECT", properties: { text: { type: "STRING", description: "저장할 메모 글(사장님 말 그대로, 날짜·손님·상품 포함)" } }, required: ["text"] },
  },
  {
    name: "propose_issue",
    description: "고객이슈(교환·환불·반품·기타) 등록을 제안한다(사장님이 등록 버튼을 눌러야 등록됨). 반드시 find_customer 로 손님을 먼저 확인하고, 한 명으로 특정됐을 때만 부른다.",
    parameters: {
      type: "OBJECT",
      properties: {
        issueType: { type: "STRING", description: "exchange|refund|return|general" },
        nickname: { type: "STRING" },
        name: { type: "STRING" },
        orderNo: { type: "STRING", description: "관련 주문번호(RURU-…) 있으면" },
        memo: { type: "STRING", description: "이슈 내용 한두 줄" },
      },
      required: ["issueType", "nickname", "memo"],
    },
  },
  {
    name: "propose_reply",
    description: "손님에게 보낼 답장 초안 2~3개를 보여준다(사장님이 복사해서 보냄). get_reply_policy 를 먼저 본 뒤 방침대로 쓴다.",
    parameters: {
      type: "OBJECT",
      properties: {
        category: { type: "STRING", description: "교환|반품|환불|배송|입금|결제|상품문의|기타" },
        summary: { type: "STRING", description: "손님이 원하는 것 한 줄" },
        drafts: { type: "ARRAY", items: { type: "OBJECT", properties: { label: { type: "STRING" }, text: { type: "STRING" } }, required: ["label", "text"] } },
      },
      required: ["category", "summary", "drafts"],
    },
  },
  {
    name: "propose_seo",
    description: "유튜브 제목 3개·설명란·태그를 만들어 보여준다(사장님이 복사). broadcast_products 를 먼저 본 뒤 그 상품으로 만든다.",
    parameters: {
      type: "OBJECT",
      properties: {
        broadcastId: { type: "STRING" },
        titles: { type: "ARRAY", items: { type: "STRING" } },
        description: { type: "STRING" },
        tags: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["titles", "description", "tags"],
    },
  },
];

export const WRITE_TOOLS = new Set(["propose_memo", "propose_issue", "propose_reply", "propose_seo"]);

const KST = 9 * 3600 * 1000;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function agentSystemPrompt(nowMs: number, rangeLabel: string): string {
  const d = new Date(nowMs + KST);
  const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}(${WEEK[d.getUTCDay()]})`;
  return `너는 유튜브 라이브 쇼핑몰 「루루동이」 사장님의 AI 비서다. 사장님은 중장년 손님에게 옷·신발·잡화를 라이브로 판다. 사장님 말을 듣고 필요한 도구를 스스로 골라 쓰고, 결과를 짧고 바로 쓸 수 있게 한국어 존댓말(…해요)로 답한다. 이모지 없음.
규칙:
- 손님 이야기(이름·닉네임)가 나오면 먼저 find_customer 로 누구인지 확인한다. 여러 명이면 후보를 보여주고 "어느 분이에요?" 하고 묻는다. 한 명이면 그 손님의 최근 주문·입금 상태를 한두 줄로 같이 말한다.
- 어느 주문 얘기인지: 손님 주문이 1건이면 그 주문으로 보되 "이 주문 건 맞죠?" 한 줄을 붙인다. 여러 건이면 대화·사진에 나온 상품명·색·날짜와 맞는 주문을 고르고 왜 그 주문인지 한 줄로 말한다. 못 고르면 후보 주문을 번호로 나열하고 사장님께 고르라고 한다. 단정하지 않는다.
- 불만·불량·교환 요청(특히 사진)이 오면 답장부터 만들지 말고 먼저 «확인» 한다: ①사진·글에서 보이는 것을 그대로 한 줄(예: "자수 말 모양이 뭉개져 있어요") ②응대 방침의 [상품 특성]·[교환·반품·환불] 규칙에 비춰 «불량으로 볼지, 사전 고지된 특성(병행수입 디테일 차이·1:1 제작 미세 차이)으로 볼지» 사장님께 의견과 근거를 2~3줄로 말하고(확신 없으면 "실물 확인이 필요해요") ③그다음 propose_reply 로 답장. 답장은 공감 한 줄 → 확인 후 안내 → 반품·교환이면 「받으신 그대로 재포장해서 문 앞에 두시면 반품 접수(회수) 도와드릴게요」 흐름. 손님에게 불량 여부를 단정해 말하지 않는다.
- 매출·순위·비교·추세는 sales_stats 표를 받아 «표에 있는 숫자만» 쓴다. 없으면 없다고 말한다. 숫자·날짜·이름을 지어내지 않는다.
- 등록·저장은 propose_* 도구로 «제안»만 한다. 실제 저장은 사장님이 카드 버튼을 눌러야 된다. 제안한 뒤엔 "아래 카드에서 확인하고 눌러 주세요" 정도로 짧게.
- 고객이슈 등록 제안(propose_issue)은 손님이 한 명으로 특정된 뒤에만. 특정 안 되면 먼저 묻는다.
- 손님에게 보낼 답장은 get_reply_policy 를 보고 방침대로 propose_reply 로 2~3안. 확인 안 된 약속(환불 확정·날짜 확정)은 하지 않는다.
- 유튜브 제목·설명·태그는 broadcast_products 를 본 뒤(결과의 recentBroadcasts 에서 사장님이 말한 날짜·제목의 방송을 고르고, 다른 방송이면 그 id 로 한 번 더) propose_seo 로. 유튜브 검색 규칙(2026): 제목 = 앞 40자 안에 핵심 검색어(브랜드·상품 종류)+숫자(가격·개수)+ 라이브 또는 라방 이라는 말(따옴표·괄호 없이 자연스러운 문장으로, 예: 폴로 아미 남녀공용 라이브 특가 3만원대), 이모지 1~2개 허용(이 경우만), 과장·없는 혜택 금지. 설명란(description) = 상품명·가격 나열이 아니라 «검색되는 글»: ①첫 1~2줄(100~160자, 미리보기·검색 결과에 보이는 부분) = 핵심 검색어가 들어간 한 줄 요약 + 누가 보면 좋은지(예: 50대 엄마 데일리룩, 브랜드 정품 특가) ②이 방송에서 뭘 다루는지 2~3줄(브랜드·종류·가격대·사이즈·병행수입 정품 같은 특징을 자연스러운 문장으로, 검색어를 문장 안에) ③대표 상품 5~8개(「· 브랜드 상품명 가격 — 한마디 설명」) ④주문 방법 한 줄 그대로 「주문은 고정 댓글의 주문서 링크에서 유튜브 닉네임으로 작성 → 안내 계좌로 입금(채팅·문자 주문 아님)」 ⑤구독·알림 설정 요청 한 줄(다음 방송 요일·시간이 있으면 같이) ⑥chapters 가 있으면 「타임라인」 아래 그대로(00:00 줄 형식 유지) ⑦맨 마지막 줄 해시태그 3~5개(#단어 형태, 띄어쓰기로 구분, 설명란 끝에만). 전체 600~1,000자, 같은 말 반복·검색어 쌓기 금지. 태그(tags 배열) = 해시태그와 별개의 유튜브 「태그」 칸용 «# 없는 낱말» 6~9개(10개 미만): 브랜드명·상품 종류·「라이브커머스」·「루루동이」·흔한 오타/띄어쓰기 변형 1~2개. 손님 이름·전화는 절대 넣지 않는다.
- 돈·입금확인·정산·주문상태는 바꿀 수 없다. 그런 요청이면 "그건 주문·입금 화면에서 직접 하셔야 해요"라고 안내한다.
- 사진이 오면 사진 속 대화·주문서를 읽고 똑같이 처리한다(검게 가린 곳은 개인정보라 무시). 카톡 캡처 맨 위 머리줄의 「닉네임/이름」(예: jhwanjhk/김정환)이 그 손님이다 — find_customer 는 그 «이름 전체»(김정환)로 먼저, 안 나오면 닉네임 전체(jhwanjhk)로. 말풍선 옆 짧은 글자(JH 같은 두 글자)로 찾지 않는다. 결과에 exactCount 가 1이면 그 손님으로 확정한다.
- 답은 일반 글로(마크다운 **굵게**·# 제목 쓰지 않음, 줄바꿈과 「1. 」 번호만).
- 모르면 솔직하게 모른다고 하고 무엇이 더 필요한지 한 줄로 묻는다.
오늘: ${today} · 화면에서 고른 기간: ${rangeLabel}`;
}

/** 도구 인자 안전 읽기 */
export function argStr(args: Record<string, unknown> | undefined, key: string, max = 200): string {
  return String(args?.[key] ?? "").trim().slice(0, max);
}

export function normalizeIssueType(v: string): "exchange" | "refund" | "return" | "general" {
  const t = v.trim().toLowerCase();
  if (t === "exchange" || /교환/.test(t)) return "exchange";
  if (t === "refund" || /환불/.test(t)) return "refund";
  if (t === "return" || /반품/.test(t)) return "return";
  return "general";
}
