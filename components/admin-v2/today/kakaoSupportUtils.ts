// components/admin-v2/today/kakaoSupportUtils.ts
// 목적: 카톡 대화 복붙 내용을 오늘할일에서 빠르게 분류/응대하기 위한 표시용 유틸
// 주의: 키워드 기반 분석. 카카오 API/상담톡 API/DB 저장 로직 없음.

export type KakaoIssueType =
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

const includesAny = (text: string, words: string[]) => words.some((word) => text.includes(word));

export function analyzeKakaoConversation(rawText: string): KakaoAnalysisResult {
  const text = String(rawText || "").trim();
  const compact = text.replace(/\s+/g, " ");

  if (!text) {
    return {
      issueType: "general",
      label: "대화 없음",
      toneClass: "bg-neutral-100 text-neutral-600",
      riskLabel: "대기",
      summary: "카톡 대화를 붙여넣으면 자동으로 분류합니다.",
      recommendedReply: "카톡 대화를 붙여넣어 주세요.",
      memoTitle: "카톡 대화 분석",
    };
  }

  if (includesAny(text, ["환불", "돈 돌려", "취소해주세요", "취소 해주세요", "결제취소"])) {
    return {
      issueType: "refund",
      label: "환불/취소",
      toneClass: "bg-red-50 text-red-700",
      riskLabel: "높음",
      summary: compact.slice(0, 110),
      recommendedReply:
        "확인했습니다. 주문내역과 상품 상태 먼저 확인 후 안내드리겠습니다. 환불 가능 여부는 구매 전 안내된 교환/환불 기준과 상품 상태 확인 후 처리됩니다.",
      memoTitle: "환불/취소 문의",
    };
  }

  if (includesAny(text, ["교환", "사이즈 변경", "색상 변경", "바꿔", "변경 가능"])) {
    return {
      issueType: "exchange",
      label: "교환",
      toneClass: "bg-orange-50 text-orange-700",
      riskLabel: "중간",
      summary: compact.slice(0, 110),
      recommendedReply:
        "확인했습니다. 교환은 업체 재고와 상품 상태 확인이 필요합니다. 주문 닉네임과 교환 원하시는 상품/색상/사이즈를 다시 한번 보내주세요.",
      memoTitle: "교환 문의",
    };
  }

  if (includesAny(text, ["반품", "돌려보내", "회수", "반송"])) {
    return {
      issueType: "return",
      label: "반품",
      toneClass: "bg-rose-50 text-rose-700",
      riskLabel: "높음",
      summary: compact.slice(0, 110),
      recommendedReply:
        "확인했습니다. 반품 가능 여부는 상품 상태와 구매 전 안내된 기준 확인 후 안내드리겠습니다. 착용/세탁/포장 훼손 여부도 함께 확인 부탁드립니다.",
      memoTitle: "반품 문의",
    };
  }

  if (includesAny(text, ["배송", "송장", "택배", "언제 와", "언제오", "출고", "도착"])) {
    return {
      issueType: "shipping",
      label: "배송/송장",
      toneClass: "bg-blue-50 text-blue-700",
      riskLabel: "보통",
      summary: compact.slice(0, 110),
      recommendedReply:
        "배송 확인해드리겠습니다. 송장은 출고 당일 밴드 또는 택배사 문자로 확인 가능하며, 문자함/스팸함도 함께 확인 부탁드립니다.",
      memoTitle: "배송/송장 문의",
    };
  }

  if (includesAny(text, ["입금", "결제", "돈 보냈", "입금했", "카드", "링크", "확인 안"])) {
    return {
      issueType: "payment",
      label: "입금/결제",
      toneClass: "bg-emerald-50 text-emerald-700",
      riskLabel: "중요",
      summary: compact.slice(0, 110),
      recommendedReply:
        "입금/결제 확인해드리겠습니다. 주문서의 닉네임/입금자명/금액이 정확히 일치해야 자동 확인될 수 있습니다. 다르면 확인에 시간이 걸릴 수 있습니다.",
      memoTitle: "입금/결제 문의",
    };
  }

  if (includesAny(text, ["주소", "동호수", "상세주소", "우편번호", "주소변경", "주소 변경"])) {
    return {
      issueType: "address",
      label: "주소확인",
      toneClass: "bg-violet-50 text-violet-700",
      riskLabel: "중요",
      summary: compact.slice(0, 110),
      recommendedReply:
        "주소 확인해드리겠습니다. 받으실 분 성함, 연락처, 도로명주소, 상세주소를 정확히 다시 보내주세요.",
      memoTitle: "주소 확인",
    };
  }

  if (includesAny(text, ["짜증", "화나", "신고", "불만", "왜", "말이 안", "늦잖", "안 해"])) {
    return {
      issueType: "complaint",
      label: "불만/주의",
      toneClass: "bg-red-50 text-red-700",
      riskLabel: "높음",
      summary: compact.slice(0, 110),
      recommendedReply:
        "불편드려 죄송합니다. 내용 먼저 정확히 확인하고 안내드리겠습니다. 주문 닉네임과 문의하신 상품명을 함께 보내주시면 빠르게 확인하겠습니다.",
      memoTitle: "불만/주의 문의",
    };
  }

  return {
    issueType: "general",
    label: "일반문의",
    toneClass: "bg-neutral-100 text-neutral-700",
    riskLabel: "보통",
    summary: compact.slice(0, 110),
    recommendedReply:
      "확인했습니다. 주문 닉네임과 문의하신 상품명을 함께 보내주시면 확인 후 안내드리겠습니다.",
    memoTitle: "일반 카톡 문의",
  };
}

export function buildKakaoMemoText(params: {
  analysis: KakaoAnalysisResult;
  conversationText: string;
  customerName?: string | null;
  nickname?: string | null;
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
    `고객: ${params.nickname || params.customerName || "-"}`,
    `분류: ${params.analysis.label} / 위험도: ${params.analysis.riskLabel}`,
    `요약: ${params.analysis.summary}`,
    "",
    "원문:",
    preview || "-",
  ].join("\\n");
}
