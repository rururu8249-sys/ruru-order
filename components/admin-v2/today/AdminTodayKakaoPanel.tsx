"use client";

// components/admin-v2/today/AdminTodayKakaoPanel.tsx
// 목적: 오늘할일에서 카톡채널 열기 + 대화 복붙 분석 + 고객메모 저장
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
import AdminTodayKakaoManualFields from "@/components/admin-v2/today/AdminTodayKakaoManualFields";
import AdminTodayKakaoCustomerPicker from "@/components/admin-v2/today/AdminTodayKakaoCustomerPicker";
import AdminTodayKakaoTimelineList from "@/components/admin-v2/today/AdminTodayKakaoTimelineList";
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

  const copyReply = async () => {
    try {
      await navigator.clipboard.writeText(analysis.recommendedReply);
      alert("추천 답변을 복사했습니다.");
    } catch {
      alert("복사에 실패했습니다. 추천 답변을 직접 드래그해서 복사해주세요.");
    }
  };


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
            고객 메시지는 분석하고, 유혜원/한두희 답변은 관리자 답변으로 기록하며, 루루동이/카나나/챗봇 자동응답은 제외합니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={KAKAO_CHANNEL_CHAT_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-yellow-300 px-3 py-2 text-xs font-black text-neutral-950 active:scale-[0.98]"
          >
            카톡채널 채팅 열기
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

      <div className="grid gap-3 xl:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-black text-neutral-500">원본 카톡 대화 붙여넣기</div>
          <textarea
            value={conversationText}
            onChange={(event) => {
              setConversationText(event.target.value);
              setManualCustomerText("");
            }}
            placeholder="카톡채널 대화 원문 전체를 붙여넣으세요."
            className="h-32 w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-black text-neutral-500">분석 기준 대화</span>
            <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-black text-red-600">
              고객 {filteredConversation.customerCount}줄 · 관리자답변 {filteredConversation.adminCount}줄 · 자동응답 제외 {filteredConversation.autoCount}줄
            </span>
          </div>
          <textarea
            value={displayedCustomerText}
            onChange={(event) => setManualCustomerText(event.target.value)}
            placeholder="고객 메시지만 남는 영역입니다. 필요하면 직접 수정하세요."
            className="h-32 w-full resize-none rounded-2xl border border-blue-100 bg-blue-50/40 p-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
          />
          <div className="mt-1 text-[11px] font-bold text-neutral-500">
            이 칸의 내용만 고객 요청으로 분석합니다. 관리자/챗봇 답변은 고객 요청으로 보지 않습니다.
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
          <div className="mb-1 text-xs font-black text-blue-700">관리자 답변으로 기록할 이름/문구</div>
          <input
            value={adminSenderText}
            onChange={(event) => setAdminSenderText(event.target.value)}
            placeholder="예: 유혜원님이 보냄, 한두희님이 보냄"
            className="h-10 w-full rounded-xl border border-blue-100 bg-white px-3 text-xs font-bold outline-none focus:border-blue-500"
          />
          <div className="mt-1 text-[11px] font-bold text-blue-600">
            고객으로 분석하지 않고, 내가 답변한 내용으로 메모에 남깁니다.
          </div>
        </div>

        <div className="rounded-2xl border border-red-100 bg-red-50/40 p-3">
          <div className="mb-1 text-xs font-black text-red-700">완전 제외할 자동응답 이름/문구</div>
          <input
            value={autoSenderText}
            onChange={(event) => setAutoSenderText(event.target.value)}
            placeholder="예: 루루동이님이 보냄, 카나나 상담매니저가 보냄, 챗봇이 보냄"
            className="h-10 w-full rounded-xl border border-red-100 bg-white px-3 text-xs font-bold outline-none focus:border-red-500"
          />
          <div className="mt-1 text-[11px] font-bold text-red-600">
            카나나/챗봇/자동응답은 분석하지 않고 메모에서도 원문 제외 처리합니다.
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <AdminTodayKakaoTimelineList items={timelineItems} registeringItemId={registeringTaskItemId} onRegisterTask={registerTodayTaskFromItem} />

        <AdminTodayKakaoManualFields
          kakaoDisplayName={kakaoDisplayName}
          setKakaoDisplayName={setKakaoDisplayName}
          manualIssueType={manualIssueType}
          setManualIssueType={setManualIssueType}
          relatedProduct={relatedProduct}
          setRelatedProduct={setRelatedProduct}
          detectedDateLabel={detectedDate.label}
        />

        <div className="grid gap-3 xl:grid-cols-[1fr_0.95fr]">
          <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-black ${analysis.toneClass}`}>
                {analysis.label}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-neutral-600">
                위험도 {analysis.riskLabel}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-neutral-600">
                {detectedDate.confidence === "auto"
                  ? "날짜 자동인식"
                  : detectedDate.confidence === "needs_check"
                    ? "날짜 확인필요"
                    : "저장시각 기준"}
              </span>
            </div>

            <div className="text-xs font-black text-neutral-400">요약</div>
            <div className="mt-1 min-h-[40px] text-sm font-bold leading-relaxed text-neutral-800">
              {analysis.summary}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
            <div className="mb-2 text-xs font-black text-neutral-400">추천 답변</div>
            <div className="min-h-[58px] text-sm font-bold leading-relaxed text-neutral-800">
              {analysis.recommendedReply}
            </div>
            <button
              type="button"
              onClick={copyReply}
              className="mt-3 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
            >
              추천답변 복사
            </button>
          </div>
        </div>

        <AdminTodayKakaoCustomerPicker
          matches={matches}
          searchResults={searchResults}
          selectedCustomerId={selectedCustomerId}
          setSelectedCustomerId={setSelectedCustomerId}
          customerSearch={customerSearch}
          setCustomerSearch={setCustomerSearch}
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveMemo}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white active:scale-[0.98] disabled:bg-neutral-300"
          >
            {saving ? "저장중" : "고객메모 저장"}
          </button>
        </div>
      </div>
    </section>
  );
}
