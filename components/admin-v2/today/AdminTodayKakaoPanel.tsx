"use client";

// components/admin-v2/today/AdminTodayKakaoPanel.tsx
// 목적: 오늘할일에서 카톡 대화 붙여넣기 + 이슈태그 선택 + ChatGPT 분석문구 복사
// 중요:
// - 고객 메시지만 문의 분석
// - 유혜원/한두희 답변은 고객으로 인식하지 않고 관리자 답변으로 기록
// - 루루동이/카나나/챗봇 자동응답은 분석 제외

import { useMemo, useState } from "react";
import type { CustomerRow } from "@/lib/admin-v2/types";
import { supabase } from "@/lib/supabase";
import {
  analyzeKakaoConversation,
  buildKakaoMemoText,
  detectKakaoDate,
  getAnalysisByIssueType,
  type KakaoIssueType,
} from "@/components/admin-v2/today/kakaoSupportUtils";
import { buildKakaoCustomerOnlyConversation } from "@/components/admin-v2/today/kakaoConversationFilter";
import AdminTodayKakaoTimelineList from "@/components/admin-v2/today/AdminTodayKakaoTimelineList";
import AdminTodayKakaoGptPromptPanel from "@/components/admin-v2/today/AdminTodayKakaoGptPromptPanel";
import AdminTodayIssueTagSelector from "@/components/admin-v2/today/AdminTodayIssueTagSelector";
import type { AdminIssueTag } from "@/components/admin-v2/today/adminIssueTags";
import AdminTodayCollapsiblePanel from "@/components/admin-v2/today/AdminTodayCollapsiblePanel";
import {
  buildKakaoConversationTimeline,
  buildKakaoTimelineMemo,
  type KakaoTimelineItem,
} from "@/components/admin-v2/today/kakaoConversationTimeline";

const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_RMxaqX";
const KAKAO_CHANNEL_CHAT_URL = "https://business.kakao.com/_RMxaqX/chats?t_src=business_partnercenter&t_ch=lnb&t_obj=%EB%82%B4%EC%B1%84%ED%8C%85_%ED%81%B4%EB%A6%AD";

const DEFAULT_ADMIN_SENDER_TEXT = "유혜원, 유혜원님이 보냄, 한두희, 한두희님이 보냄";
const DEFAULT_AUTO_SENDER_TEXT = "루루동이님이 보냄, 카나나 상담매니저가 보냄, Kanana 상담매니저, 챗봇이 보냄, 카나나, 챗봇";

const digitsOnly = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");

const normalize = (value: unknown) => {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .toLowerCase();
};

function findCustomerMatches(customers: CustomerRow[], text: string, displayName: string) {
  const combinedText = [text, displayName].join(" ");
  const normalizedText = normalize(combinedText);
  const digitText = digitsOnly(combinedText);

  if (!normalizedText && !digitText) return [];

  return customers
    .map((customer) => {
      let score = 0;

      const nickname = normalize(customer.youtube_nickname);
      const name = normalize(customer.customer_name);
      const phone = digitsOnly(customer.customer_phone);

      if (nickname && normalizedText.includes(nickname)) score += 8;
      if (name && normalizedText.includes(name)) score += 7;
      if (nickname && displayName && nickname === normalize(displayName)) score += 10;
      if (name && displayName && name === normalize(displayName)) score += 9;
      if (phone && digitText.includes(phone)) score += 6;
      if (phone && phone.length >= 4 && digitText.includes(phone.slice(-4))) score += 2;

      return { customer, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => item.customer);
}

function findCustomerBySearch(customers: CustomerRow[], search: string) {
  const word = normalize(search);
  const digits = digitsOnly(search);

  if (!word && !digits) return [];

  return customers
    .filter((customer) => {
      const nickname = normalize(customer.youtube_nickname);
      const name = normalize(customer.customer_name);
      const phone = digitsOnly(customer.customer_phone);

      return (
        (word && nickname.includes(word)) ||
        (word && name.includes(word)) ||
        (digits && phone.includes(digits)) ||
        (digits.length >= 4 && phone.endsWith(digits))
      );
    })
    .slice(0, 30);
}

export default function AdminTodayKakaoPanel({
  customers,
  onSaveCustomerMemo,
}: {
  customers: CustomerRow[];
  onSaveCustomerMemo: (customer: CustomerRow, memoText: string) => Promise<void>;
}) {
  const [conversationText, setConversationText] = useState("");
  const [manualCustomerText, setManualCustomerText] = useState("");
  const [adminSenderText, setAdminSenderText] = useState(DEFAULT_ADMIN_SENDER_TEXT);
  const [autoSenderText, setAutoSenderText] = useState(DEFAULT_AUTO_SENDER_TEXT);
  const [kakaoDisplayName, setKakaoDisplayName] = useState("");
  const [manualIssueType, setManualIssueType] = useState<KakaoIssueType | "">("");
  const [relatedProduct, setRelatedProduct] = useState("");
  const [selectedIssueTags, setSelectedIssueTags] = useState<AdminIssueTag[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [registeringTaskItemId, setRegisteringTaskItemId] = useState("");

  const filteredConversation = useMemo(
    () => buildKakaoCustomerOnlyConversation(conversationText, adminSenderText, autoSenderText),
    [conversationText, adminSenderText, autoSenderText]
  );

  const timelineItems = useMemo(
    () => buildKakaoConversationTimeline(conversationText, adminSenderText, autoSenderText),
    [conversationText, adminSenderText, autoSenderText]
  );

  const timelineMemoText = useMemo(() => buildKakaoTimelineMemo(timelineItems), [timelineItems]);

  const displayedCustomerText = manualCustomerText || filteredConversation.customerText;

  const analysisSourceText = useMemo(() => {
    return displayedCustomerText.trim();
  }, [displayedCustomerText]);

  const autoAnalysis = useMemo(() => analyzeKakaoConversation(analysisSourceText), [analysisSourceText]);

  const analysis = useMemo(() => {
    if (!manualIssueType) return autoAnalysis;
    return getAnalysisByIssueType(manualIssueType, analysisSourceText);
  }, [autoAnalysis, manualIssueType, analysisSourceText]);

  const detectedDate = useMemo(() => detectKakaoDate(analysisSourceText), [analysisSourceText]);

  const matches = useMemo(
    () => findCustomerMatches(customers, analysisSourceText, kakaoDisplayName),
    [customers, analysisSourceText, kakaoDisplayName]
  );

  const searchResults = useMemo(
    () => findCustomerBySearch(customers, customerSearch || kakaoDisplayName),
    [customers, customerSearch, kakaoDisplayName]
  );

  const selectedCustomer = useMemo(() => {
    if (selectedCustomerId === "") return matches[0] || searchResults[0] || null;

    return customers.find((customer) => Number(customer.id) === Number(selectedCustomerId)) || null;
  }, [customers, matches, searchResults, selectedCustomerId]);

  const memoText = useMemo(() => {
    return buildKakaoMemoText({
      analysis,
      conversationText: analysisSourceText,
      customerName: selectedCustomer?.customer_name,
      nickname: selectedCustomer?.youtube_nickname,
      kakaoDisplayName,
      detectedDate,
      relatedProduct,
      adminReplyText: filteredConversation.adminText,
      autoReplyText: filteredConversation.autoText,
      timelineText: timelineMemoText,
    });
  }, [
    analysis,
    analysisSourceText,
    selectedCustomer,
    kakaoDisplayName,
    detectedDate,
    relatedProduct,
    filteredConversation.adminText,
    filteredConversation.autoText,
    timelineMemoText,
  ]);


  const registerTodayTaskFromItem = async (item: KakaoTimelineItem) => {
    if (item.role !== "customer") {
      alert("고객 문의만 오늘할일에 등록할 수 있습니다.");
      return;
    }

    const cleanText = String(item.content || "").trim();

    if (!cleanText) {
      alert("등록할 고객 문의 내용이 없습니다.");
      return;
    }

    const customerLabel =
      selectedCustomer?.youtube_nickname ||
      selectedCustomer?.customer_name ||
      kakaoDisplayName ||
      item.senderLabel ||
      "고객 미확인";

    const itemAnalysis = item.analysis || analysis;
    const title = `${itemAnalysis.label} · ${customerLabel}`;
    const body = [
      `선택태그: ${selectedIssueTags.length > 0 ? selectedIssueTags.join(", ") : "미선택"}`,
      `문의시점: ${item.dateLabel}`,
      `보낸사람: ${item.senderLabel}`,
      `카톡표시명: ${kakaoDisplayName || "-"}`,
      `연결고객: ${selectedCustomer?.youtube_nickname || selectedCustomer?.customer_name || "-"}`,
      `관련상품: ${relatedProduct || "-"}`,
      `분류: ${itemAnalysis.label} / 위험도: ${itemAnalysis.riskLabel}`,
      "",
      "고객 메시지:",
      cleanText,
      "",
      "추천답변:",
      itemAnalysis.recommendedReply || "-",
    ].join("\n");

    const ok = window.confirm(
      `이 카톡 문의를 오늘할일에 등록할까요?\n\n${title}\n\n등록 후 처리완료 전까지 계속 표시됩니다.`
    );

    if (!ok) return;

    setRegisteringTaskItemId(item.id);

    const { error } = await supabase.from("admin_tasks").insert({
      task_type: itemAnalysis.issueType || "general",
      title,
      body,
      source: "kakao",
      priority: itemAnalysis.riskLabel === "높음" || itemAnalysis.riskLabel === "구매의사 높음" ? "high" : "normal",
      status: "open",
      customer_id: selectedCustomer?.id || null,
      customer_name: selectedCustomer?.customer_name || null,
      customer_nickname: selectedCustomer?.youtube_nickname || kakaoDisplayName || item.senderLabel || null,
      related_product: relatedProduct || null,
      raw_payload: {
        issueTags: selectedIssueTags,
        kakaoDisplayName,
        relatedProduct,
        timelineItem: item,
      },
    });

    setRegisteringTaskItemId("");

    if (error) {
      alert("오늘할일 등록 실패\n\n" + error.message);
      return;
    }

    setSelectedIssueTags([]);
    window.dispatchEvent(new CustomEvent("ruru-admin-task-created"));
    alert("오늘할일에 등록했습니다. 처리완료 전까지 계속 표시됩니다.");
  };


  const saveMemo = async () => {
    if (!analysisSourceText.trim() && !kakaoDisplayName.trim()) {
      alert("고객 메시지 또는 카톡 이름/닉네임을 입력해주세요.");
      return;
    }

    if (!selectedCustomer) {
      alert("연결할 고객을 선택해주세요. 닉네임/이름으로 직접 검색 후 선택할 수 있습니다.");
      return;
    }

    const ok = window.confirm(
      `${selectedCustomer.youtube_nickname || selectedCustomer.customer_name || "-"} 고객 메모에 카톡 분석 내용을 저장할까요?`
    );

    if (!ok) return;

    setSaving(true);
    try {
      await onSaveCustomerMemo(selectedCustomer, memoText);
      setConversationText("");
      setManualCustomerText("");
      setAdminSenderText(DEFAULT_ADMIN_SENDER_TEXT);
      setAutoSenderText(DEFAULT_AUTO_SENDER_TEXT);
      setKakaoDisplayName("");
      setManualIssueType("");
      setRelatedProduct("");
      setCustomerSearch("");
      setSelectedCustomerId("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
            카톡 응대 업무
          </h2>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            카톡 대화 붙여넣기 → 이슈태그 선택 → ChatGPT 분석 또는 오늘할일 등록만 사용합니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={KAKAO_CHANNEL_CHAT_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-yellow-300 px-3 py-2 text-xs font-black text-neutral-950 active:scale-[0.98]"
          >
            카톡채팅 열기
          </a>
          <a
            href={KAKAO_CHANNEL_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-700 active:scale-[0.98]"
          >
            채널 홈
          </a>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-black text-neutral-950">
                1. 카톡 대화 붙여넣기
              </div>
              <div className="mt-0.5 text-xs font-bold text-neutral-500">
                카톡채널 대화 원문을 그대로 붙여넣으세요.
              </div>
            </div>

            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-neutral-600">
              고객 {filteredConversation.customerCount}줄 · 제외 {filteredConversation.autoCount}줄
            </span>
          </div>

          <textarea
            value={conversationText}
            onChange={(event) => {
              setConversationText(event.target.value);
              setManualCustomerText("");
            }}
            placeholder="여기에 카톡 대화 전체를 붙여넣으세요."
            className="h-36 w-full resize-none rounded-2xl border border-neutral-200 bg-white p-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
          />
        </div>

        <AdminTodayIssueTagSelector
          selectedTags={selectedIssueTags}
          onChange={setSelectedIssueTags}
        />

        <AdminTodayKakaoGptPromptPanel
          rawText={conversationText}
          customerText={analysisSourceText}
          timelineText={timelineMemoText}
          kakaoDisplayName={kakaoDisplayName}
          relatedProduct={relatedProduct}
        />

        <AdminTodayCollapsiblePanel
          title="고객 문의별 오늘할일 등록"
          description="ChatGPT 분석과 별개로, 처리해야 하는 고객 문의만 골라 오늘할일에 등록합니다."
          badge={timelineItems.filter((item) => item.role === "customer").length > 0 ? `${timelineItems.filter((item) => item.role === "customer").length}개 문의` : "선택 사용"}
          defaultOpen={false}
        >
          <AdminTodayKakaoTimelineList
            items={timelineItems}
            registeringItemId={registeringTaskItemId}
            onRegisterTask={registerTodayTaskFromItem}
          />
        </AdminTodayCollapsiblePanel>
      </div>
    </section>
  );
}


