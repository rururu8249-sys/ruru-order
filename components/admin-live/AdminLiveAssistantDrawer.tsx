"use client";

// [2026-10-22 AI 비서 8단계] 「AI 비서」 창 = 대화창 하나(AdminLiveAssistantChatBox) + 메모함 + 응대 방침.
//   옛 「물어보기 · 응대 문구 · 유튜브 SEO」 탭은 대화창 안으로 합쳐졌다(AI 가 도구를 골라 쓴다). 찾기·숫자·답장·SEO 전부 말로.
//   메모함 「손님 ○○ 찾기」 → 대화 탭에 그 말을 넣어 보낸다. DESIGN-ADMIN: 흰 판 · 밑줄 탭 · 이모지 없음.

import { useState } from "react";
import AdminLiveSideDrawer from "./AdminLiveSideDrawer";
import AdminLiveAssistantChatBox from "./AdminLiveAssistantChatBox";
import AdminLiveAssistantMemoBox from "./AdminLiveAssistantMemoBox";
import AdminLiveAssistantPolicyBox from "./AdminLiveAssistantPolicyBox";

type Tab = "chat" | "memo" | "policy";

export default function AdminLiveAssistantDrawer({
  onClose,
  onShowInOrders,
}: {
  onClose: () => void;
  /** 「주문서에서 보기」 — 실시간 주문서 검색칸에 이 글자를 넣고 기간 전체로 */
  onShowInOrders: (keyword: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const [ask, setAsk] = useState<{ n: number; text: string } | null>(null);

  return (
    <AdminLiveSideDrawer title="AI 비서" width={560} onClose={onClose}>
      <div className="space-y-3 p-4">
        <div role="tablist" aria-label="AI 비서 화면" className="-mt-1 flex flex-wrap gap-x-4 border-b border-line">
          {([["chat", "대화"], ["memo", "메모함"], ["policy", "응대 방침"]] as [Tab, string][]).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`-mb-px h-10 border-b-2 px-1 text-[14px] font-bold transition focus-visible:outline-2 focus-visible:outline-ink ${tab === k ? "border-ink text-ink" : "border-transparent text-ink-mute hover:text-ink"}`}>
              {label}
            </button>
          ))}
          {/* 비서 답이 답답할 때 — 사장님이 따로 쓰는 챗GPT 를 새 탭으로(사장님 요청 10/22 12:14). 조용한 보조 버튼, 오른쪽 끝 */}
          <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer"
            className="-mb-px ml-auto inline-flex h-10 items-center px-1 text-[13px] font-semibold text-ink-mute transition hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">
            챗GPT 열기 ↗
          </a>
        </div>
        {/* 대화는 탭을 옮겨도 살아 있게(display 만 끔) */}
        <div className={tab === "chat" ? "" : "hidden"}>
          <AdminLiveAssistantChatBox onShowInOrders={onShowInOrders} ask={ask} />
        </div>
        {tab === "memo" ? (
          <AdminLiveAssistantMemoBox onFindCustomer={(who) => { setTab("chat"); setAsk({ n: Date.now(), text: `${who} 손님 최근 주문 알려 줘` }); }} />
        ) : null}
        {tab === "policy" ? <AdminLiveAssistantPolicyBox /> : null}
      </div>
    </AdminLiveSideDrawer>
  );
}
