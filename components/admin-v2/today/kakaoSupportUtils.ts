// components/admin-v2/today/kakaoSupportUtils.ts
// 목적: 카톡 대화 복붙 내용을 오늘할일에서 빠르게 분류/응대하기 위한 표시용 유틸
// 주의: 키워드 기반 분석. 카카오 API/상담톡 API/DB 저장 로직 없음.

export type KakaoIssueType =
  | "product"
  | "refund"
  | "exchange"
  | "return"
  | "shipping"
  | "payment"
  | "address"
  | "complaint"
  | "general";

export type KakaoAnalysisResult = {
  issueType: KakaoIssueType;
  label: string;
  toneClass: string;
  riskLabel: string;
  summary: string;
  recommendedReply: string;
  memoTitle: string;
};

export type KakaoDetectedDate = {
  label: string;
  confidence: "auto" | "fallback" | "needs_check";
};

export const KAKAO_ISSUE_OPTIONS: Array<{ value: KakaoIssueType; label: string }> = [
  { value: "general", label: "일반문의" },
  { value: "product", label: "상품/추가구매" },
  { value: "payment", label: "입금/결제" },
  { value: "shipping", label: "배송/송장" },
  { value: "address", label: "주소확인" },
  { value: "exchange", label: "교환" },
  { value: "refund", label: "환불/취소" },
  { value: "return", label: "반품" },
  { value: "complaint", label: "불만/주의" },
];

const includesAny = (text: string, words: string[]) => words.some((word) => text.includes(word));

const getKstNow = () => {
  return new Date();
};

const pad2 = (value: number) => String(value).padStart(2, "0");

export function detectKakaoDate(rawText: string): KakaoDetectedDate {
  const text = String(rawText || "");
  const now = getKstNow();

  const year = now.getFullYear();

  const fullDateMatch = text.match(/(20\d{2})[.\-\/년\s]+(\d{1,2})[.\-\/월\s]+(\d{1,2})/);
  if (fullDateMatch) {
    return {
      label: `${fullDateMatch[1]}.${pad2(Number(fullDateMatch[2]))}.${pad2(Number(fullDateMatch[3]))}`,
      confidence: "auto",
    };
  }

  const monthDayMatch = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (monthDayMatch) {
    return {
      label: `${year}.${pad2(Number(monthDayMatch[1]))}.${pad2(Number(monthDayMatch[2]))}`,
      confidence: "auto",
    };
  }

  const dotDateMatch = text.match(/(\d{1,2})[.\/-](\d{1,2})(?!\d)/);
  if (dotDateMatch) {
    return {
      label: `${year}.${pad2(Number(dotDateMatch[1]))}.${pad2(Number(dotDateMatch[2]))}`,
      confidence: "needs_check",
    };
  }

  const timeMatch = text.match(/(오전|오후)?\s*(\d{1,2})\s*[:시]\s*(\d{2})?/);
  if (timeMatch) {
    const hour = Number(timeMatch[2] || 0);
    const minute = Number(timeMatch[3] || 0);
    return {
      label: `날짜확인 필요 · 시간 ${timeMatch[1] || ""} ${pad2(hour)}:${pad2(minute)}`,
      confidence: "needs_check",
    };
  }

  if (text.includes("어제")) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return {
      label: `${yesterday.getFullYear()}.${pad2(yesterday.getMonth() + 1)}.${pad2(yesterday.getDate())}`,
      confidence: "auto",
    };
  }

  if (text.includes("오늘")) {
    return {
      label: `${now.getFullYear()}.${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}`,
      confidence: "auto",
    };
  }

  return {
    label: new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now),
    confidence: "fallback",
  };
}

export function getAnalysisByIssueType(issueType: KakaoIssueType, rawText: string): KakaoAnalysisResult {
  const text = String(rawText || "").trim();
  const compact = text.replace(/\s+/g, " ");

  const commonSummary = compact ? compact.slice(0, 110) : "카톡 대화를 붙여넣으면 자동으로 분류합니다.";

  if (issueType === "product") {
    return {
      issueType: "product",
      label: "상품/추가구매",
      toneClass: "bg-pink-50 text-pink-700",
      riskLabel: "구매의사 높음",
      summary: commonSummary,
      recommendedReply:
        "확인해드릴게요 😊 원하시는 상품명/색상/사이즈 재고 가능 여부 확인 후 바로 안내드리겠습니다!",
      memoTitle: "상품/추가구매 문의",
    };
  }


  if (issueType === "refund") {
    return {
      issueType: "refund",
      label: "환불/취소",
      toneClass: "bg-red-50 text-red-700",
      riskLabel: "높음",
      summary: commonSummary,
      recommendedReply:
        "확인했습니다. 주문내역과 상품 상태 먼저 확인 후 안내드리겠습니다. 환불 가능 여부는 구매 전 안내된 교환/환불 기준과 상품 상태 확인 후 처리됩니다.",
      memoTitle: "환불/취소 문의",
    };
  }

  if (issueType === "exchange") {
    return {
      issueType: "exchange",
      label: "교환",
      toneClass: "bg-orange-50 text-orange-700",
      riskLabel: "중간",
      summary: commonSummary,
      recommendedReply:
        "확인했습니다. 교환은 업체 재고와 상품 상태 확인이 필요합니다. 주문 닉네임과 교환 원하시는 상품/색상/사이즈를 다시 한번 보내주세요.",
      memoTitle: "교환 문의",
    };
  }

  if (issueType === "return") {
    return {
      issueType: "return",
      label: "반품",
      toneClass: "bg-rose-50 text-rose-700",
      riskLabel: "높음",
      summary: commonSummary,
      recommendedReply:
        "확인했습니다. 반품 가능 여부는 상품 상태와 구매 전 안내된 기준 확인 후 안내드리겠습니다. 착용/세탁/포장 훼손 여부도 함께 확인 부탁드립니다.",
      memoTitle: "반품 문의",
    };
  }

  if (issueType === "shipping") {
    return {
      issueType: "shipping",
      label: "배송/송장",
      toneClass: "bg-blue-50 text-blue-700",
      riskLabel: "보통",
      summary: commonSummary,
      recommendedReply:
        "배송 확인해드리겠습니다. 송장은 출고 당일 밴드 또는 택배사 문자로 확인 가능하며, 문자함/스팸함도 함께 확인 부탁드립니다.",
      memoTitle: "배송/송장 문의",
    };
  }

  if (issueType === "payment") {
    return {
      issueType: "payment",
      label: "입금/결제",
      toneClass: "bg-emerald-50 text-emerald-700",
      riskLabel: "중요",
      summary: commonSummary,
      recommendedReply:
        "입금/결제 확인해드리겠습니다. 주문서의 닉네임/입금자명/금액이 정확히 일치해야 자동 확인될 수 있습니다. 다르면 확인에 시간이 걸릴 수 있습니다.",
      memoTitle: "입금/결제 문의",
    };
  }

  if (issueType === "address") {
    return {
      issueType: "address",
      label: "주소확인",
      toneClass: "bg-violet-50 text-violet-700",
      riskLabel: "중요",
      summary: commonSummary,
      recommendedReply:
        "주소 확인해드리겠습니다. 받으실 분 성함, 연락처, 도로명주소, 상세주소를 정확히 다시 보내주세요.",
      memoTitle: "주소 확인",
    };
  }

  if (issueType === "complaint") {
    return {
      issueType: "complaint",
      label: "불만/주의",
      toneClass: "bg-red-50 text-red-700",
      riskLabel: "높음",
      summary: commonSummary,
      recommendedReply:
        "불편드려 죄송합니다. 내용 먼저 정확히 확인하고 안내드리겠습니다. 주문 닉네임과 문의하신 상품명을 함께 보내주시면 빠르게 확인하겠습니다.",
      memoTitle: "불만/주의 문의",
    };
  }

  return {
    issueType: "general",
    label: text ? "일반문의" : "대화 없음",
    toneClass: "bg-neutral-100 text-neutral-700",
    riskLabel: text ? "보통" : "대기",
    summary: commonSummary,
    recommendedReply:
      text
        ? "확인했습니다. 주문 닉네임과 문의하신 상품명을 함께 보내주시면 확인 후 안내드리겠습니다."
        : "카톡 대화를 붙여넣어 주세요.",
    memoTitle: "일반 카톡 문의",
  };
}

export function analyzeKakaoConversation(rawText: string): KakaoAnalysisResult {
  const text = String(rawText || "").trim();

  if (!text) return getAnalysisByIssueType("general", text);

  // 구매의사/추가구매/상품문의는 교환·환불보다 먼저 잡습니다.
  // 예: "블랙 샀는데 실버도 갖고싶어요", "230 주문될까요?", "하나 더 사고 싶어요"
  if (
    includesAny(text, [
      "갖고싶",
      "가지고싶",
      "사고싶",
      "구매하고싶",
      "주문될까요",
      "주문 가능",
      "주문가능",
      "재고",
      "있나요",
      "가능할까요",
      "하나 더",
      "또 사고",
      "추가구매",
      "추가 구매",
      "실버도",
      "블랙도",
      "화이트도",
      "색상도",
      "사이즈 있",
      "사이즈있",
    ])
  ) {
    return getAnalysisByIssueType("product", text);
  }

  if (includesAny(text, ["환불", "돈 돌려", "취소해주세요", "취소 해주세요", "결제취소"])) {
    return getAnalysisByIssueType("refund", text);
  }

  if (includesAny(text, ["교환", "사이즈 교환", "색상 교환", "사이즈 변경", "색상 변경", "바꿔주세요", "교환 가능"])) {
    return getAnalysisByIssueType("exchange", text);
  }

  if (includesAny(text, ["반품", "돌려보내", "회수", "반송"])) {
    return getAnalysisByIssueType("return", text);
  }

  if (includesAny(text, ["배송", "송장", "택배", "언제 와", "언제오", "출고", "도착"])) {
    return getAnalysisByIssueType("shipping", text);
  }

  if (includesAny(text, ["입금", "결제", "돈 보냈", "입금했", "카드", "링크", "확인 안"])) {
    return getAnalysisByIssueType("payment", text);
  }

  if (includesAny(text, ["주소", "동호수", "상세주소", "우편번호", "주소변경", "주소 변경"])) {
    return getAnalysisByIssueType("address", text);
  }

  if (includesAny(text, ["짜증", "화나", "신고", "불만", "왜", "말이 안", "늦잖", "안 해"])) {
    return getAnalysisByIssueType("complaint", text);
  }

  return getAnalysisByIssueType("general", text);
}

export function buildKakaoMemoText(params: {
  analysis: KakaoAnalysisResult;
  conversationText: string;
  customerName?: string | null;
  nickname?: string | null;
  kakaoDisplayName?: string;
  detectedDate?: KakaoDetectedDate;
  relatedProduct?: string;
  adminReplyText?: string;
  autoReplyText?: string;
}) {
  const nowText = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());

  const raw = String(params.conversationText || "").trim();
  const preview = raw.length > 500 ? `${raw.slice(0, 500)}...` : raw;

  return [
    `[카톡응대 ${nowText}] ${params.analysis.memoTitle}`,
    `문의일자: ${params.detectedDate?.label || nowText} (${params.detectedDate?.confidence || "fallback"})`,
    `카톡표시명: ${params.kakaoDisplayName || "-"}`,
    `연결고객: ${params.nickname || params.customerName || "-"}`,
    `관련상품: ${params.relatedProduct || "-"}`,
    `분류: ${params.analysis.label} / 위험도: ${params.analysis.riskLabel}`,
    `요약: ${params.analysis.summary}`,
    "",
    "고객 메시지:",
    preview || "-",
    "",
    "관리자 답변 기록:",
    params.adminReplyText?.trim() || "-",
    "",
    "자동응답 제외:",
    params.autoReplyText?.trim() ? "자동응답/챗봇 메시지 제외됨" : "-",
  ].join("\\n");
}
