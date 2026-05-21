"use client";

// components/admin-v2/today/AdminTodayKakaoGptPromptPanel.tsx
// 목적: OpenAI API 없이, 현재 쓰는 ChatGPT 창에 붙여넣을 분석문구를 자동 생성/복사
// 주의: 유료 API 호출 없음. 주문/입금/배송/정산 상태 변경 없음.

const CHATGPT_URL = "https://chatgpt.com/";

function buildGptPrompt({
  rawText,
  customerText,
  timelineText,
  kakaoDisplayName,
  relatedProduct,
}: {
  rawText: string;
  customerText: string;
  timelineText: string;
  kakaoDisplayName: string;
  relatedProduct: string;
}) {
  return [
    "아래 카카오톡 상담 대화를 라이브커머스 운영자 입장에서 분석해줘.",
    "",
    "분석 기준:",
    "1. 최근 날짜/시간이 맨 위에 오도록 정리해줘.",
    "2. 고객 문의만 고객 문의로 분석해줘.",
    "3. 루루동이님이 보냄, 카나나 상담매니저가 보냄, Kanana 상담매니저, 챗봇이 보냄, 자동응답은 분석 제외해줘.",
    "4. 유혜원님이 보냄, 한두희님이 보냄, 유혜원이 보냄, 한두희가 보냄은 관리자 답변으로 인식해줘.",
    "5. '샀는데 또 갖고싶어요', '주문될까요', '재고 있나요', '하나 더 사고 싶어요'는 교환/환불이 아니라 상품문의/추가구매로 분류해줘.",
    "6. 교환/환불/반품/취소는 고객이 명확히 요청할 때만 분류해줘.",
    "7. 진짜 처리 필요한 것만 오늘할일 등록 추천으로 따로 모아줘.",
    "",
    "출력 형식:",
    "## 전체 요약",
    "- 핵심 상황:",
    "- 바로 해야 할 일:",
    "",
    "## 최근순 대화 정리",
    "- 날짜/시간:",
    "- 고객명 또는 카톡표시명:",
    "- 고객 문의:",
    "- 분류:",
    "- 관련 상품:",
    "- 처리 필요 여부:",
    "- 추천 답변:",
    "",
    "## 오늘할일 등록 추천 목록",
    "- 처리 필요한 것만:",
    "",
    `카톡표시명: ${kakaoDisplayName || "-"}`,
    `관련상품: ${relatedProduct || "-"}`,
    "",
    "[고객 메시지만 필터된 내용]",
    customerText || "-",
    "",
    "[사이트에서 순차 정리한 내용]",
    timelineText || "-",
    "",
    "[카톡 원본 대화]",
    rawText || "-",
  ].join("\n");
}

export default function AdminTodayKakaoGptPromptPanel({
  rawText,
  customerText,
  timelineText,
  kakaoDisplayName,
  relatedProduct,
}: {
  rawText: string;
  customerText: string;
  timelineText: string;
  kakaoDisplayName: string;
  relatedProduct: string;
}) {
  const prompt = buildGptPrompt({
    rawText,
    customerText,
    timelineText,
    kakaoDisplayName,
    relatedProduct,
  });

  const copyPrompt = async () => {
    if (!rawText.trim() && !customerText.trim()) {
      alert("카톡 대화 내용을 먼저 붙여넣어 주세요.");
      return;
    }

    try {
      await navigator.clipboard.writeText(prompt);
      alert("ChatGPT 분석문구를 복사했습니다.\n\nChatGPT 창에 붙여넣으면 됩니다.");
    } catch {
      alert("복사에 실패했습니다. 직접 복사해주세요.");
    }
  };

  const openChatGpt = () => {
    window.open(CHATGPT_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 text-sm font-black text-neutral-950">
        ChatGPT 분석
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={copyPrompt}
          className="rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white active:scale-[0.98]"
        >
          분석문구 복사
        </button>

        <button
          type="button"
          onClick={openChatGpt}
          className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white active:scale-[0.98]"
        >
          ChatGPT 열기
        </button>
      </div>
    </section>
  );
}
