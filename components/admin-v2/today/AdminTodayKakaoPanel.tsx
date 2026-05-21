"use client";

// components/admin-v2/today/AdminTodayKakaoPanel.tsx
// 목적: 오늘할일에서 카톡채널 열기 + 대화 복붙 분석 + 고객메모 저장
// 주의: 카카오 실제 채팅창 삽입 아님. 상담톡 API 연동 아님.

import { useMemo, useState } from "react";
import type { CustomerRow } from "@/lib/admin-v2/types";
import {
  analyzeKakaoConversation,
  buildKakaoMemoText,
} from "@/components/admin-v2/today/kakaoSupportUtils";

const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_RMxaqX";
const KAKAO_CHANNEL_CHAT_URL = "https://pf.kakao.com/_RMxaqX/chat";

const digitsOnly = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");

const normalize = (value: unknown) => {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .toLowerCase();
};

function findCustomerMatches(customers: CustomerRow[], text: string) {
  const normalizedText = normalize(text);
  const digitText = digitsOnly(text);

  if (!normalizedText && !digitText) return [];

  return customers
    .map((customer) => {
      let score = 0;

      const nickname = normalize(customer.youtube_nickname);
      const name = normalize(customer.customer_name);
      const phone = digitsOnly(customer.customer_phone);

      if (nickname && normalizedText.includes(nickname)) score += 5;
      if (name && normalizedText.includes(name)) score += 4;
      if (phone && digitText.includes(phone)) score += 6;
      if (phone && phone.length >= 4 && digitText.includes(phone.slice(-4))) score += 2;

      return { customer, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.customer);
}

export default function AdminTodayKakaoPanel({
  customers,
  onSaveCustomerMemo,
}: {
  customers: CustomerRow[];
  onSaveCustomerMemo: (customer: CustomerRow, memoText: string) => Promise<void>;
}) {
  const [conversationText, setConversationText] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const analysis = useMemo(() => analyzeKakaoConversation(conversationText), [conversationText]);
  const matches = useMemo(() => findCustomerMatches(customers, conversationText), [customers, conversationText]);

  const selectedCustomer = useMemo(() => {
    if (selectedCustomerId === "") return matches[0] || null;
    return customers.find((customer) => Number(customer.id) === Number(selectedCustomerId)) || null;
  }, [customers, matches, selectedCustomerId]);

  const memoText = useMemo(() => {
    return buildKakaoMemoText({
      analysis,
      conversationText,
      customerName: selectedCustomer?.customer_name,
      nickname: selectedCustomer?.youtube_nickname,
    });
  }, [analysis, conversationText, selectedCustomer]);

  const copyReply = async () => {
    try {
      await navigator.clipboard.writeText(analysis.recommendedReply);
      alert("추천 답변을 복사했습니다.");
    } catch {
      alert("복사에 실패했습니다. 추천 답변을 직접 드래그해서 복사해주세요.");
    }
  };

  const saveMemo = async () => {
    if (!conversationText.trim()) {
      alert("먼저 카톡 대화를 붙여넣어 주세요.");
      return;
    }

    if (!selectedCustomer) {
      alert("고객을 찾지 못했습니다. 대화 안에 닉네임/이름/전화번호가 있는지 확인하거나 고객관리에서 먼저 고객을 확인해주세요.");
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
            카톡채널은 새 창으로 열고, 대화는 복붙해서 분석/메모 저장합니다.
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

      <textarea
        value={conversationText}
        onChange={(event) => setConversationText(event.target.value)}
        placeholder="카톡채널 대화 내용을 여기에 붙여넣으세요."
        className="h-28 w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/70"
      />

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_0.95fr]">
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-black ${analysis.toneClass}`}>
              {analysis.label}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-neutral-600">
              위험도 {analysis.riskLabel}
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

      <div className="mt-3 rounded-2xl border border-neutral-100 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-black text-neutral-950">고객메모 연결</div>
            <div className="mt-0.5 text-xs font-bold text-neutral-500">
              대화에서 닉네임/이름/전화번호가 잡히면 고객 후보가 자동 표시됩니다.
            </div>
          </div>

          <button
            type="button"
            onClick={saveMemo}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white active:scale-[0.98] disabled:bg-neutral-300"
          >
            {saving ? "저장중" : "고객메모 저장"}
          </button>
        </div>

        {matches.length === 0 ? (
          <div className="rounded-xl bg-neutral-50 p-3 text-xs font-bold text-neutral-500">
            아직 자동 매칭된 고객이 없습니다. 대화에 닉네임/이름/전화번호가 포함되어 있는지 확인해주세요.
          </div>
        ) : (
          <select
            value={selectedCustomerId}
            onChange={(event) => setSelectedCustomerId(event.target.value ? Number(event.target.value) : "")}
            className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-blue-500"
          >
            <option value="">자동추천: {matches[0]?.youtube_nickname || matches[0]?.customer_name || "-"}</option>
            {matches.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.youtube_nickname || "-"} / {customer.customer_name || "-"} / {customer.customer_phone || "-"}
              </option>
            ))}
          </select>
        )}
      </div>
    </section>
  );
}
