"use client";

// components/admin-v2/today/AdminTodayIssueControlPanel.tsx
// 목적: 오른쪽 고객 이슈 영역을 빠른등록/이슈큐/문의등록 3버튼 탭으로 통합
// 주의: 주문/입금/배송/정산 로직 없음.

import { useState } from "react";
import type { CustomerRow } from "@/lib/admin-v2/types";
import AdminTodayQuickIssueCreate from "@/components/admin-v2/today/AdminTodayQuickIssueCreate";
import AdminTodayPersistentTasks from "@/components/admin-v2/today/AdminTodayPersistentTasks";
import AdminTodayKakaoPanel from "@/components/admin-v2/today/AdminTodayKakaoPanel";

type IssuePanelTab = "create" | "queue" | "kakao";

const TABS: Array<{ key: IssuePanelTab; label: string; desc: string }> = [
  { key: "create", label: "빠른등록", desc: "고객 검색 후 바로 등록" },
  { key: "queue", label: "이슈큐", desc: "미해결/완료 확인" },
  { key: "kakao", label: "문의등록", desc: "카톡 복붙 등록" },
];

export default function AdminTodayIssueControlPanel({
  customers,
  onSaveCustomerMemo,
}: {
  customers: CustomerRow[];
  onSaveCustomerMemo: (customer: CustomerRow, memoText: string) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<IssuePanelTab>("queue");

  return (
    <section className="flex h-[760px] min-h-[760px] max-h-[760px] flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm 2xl:h-full 2xl:min-h-[760px] 2xl:max-h-none">
      <div className="mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-black tracking-[-0.05em] text-neutral-950">
              고객 이슈 컨트롤
            </h2>
            <p className="mt-1 text-xs font-bold text-neutral-500">
              검색·등록·확인을 오른쪽 패널에서 바로 처리합니다.
            </p>
          </div>

          <span className="rounded-full bg-neutral-950 px-3 py-1.5 text-[11px] font-black text-white">
            방송중 사용
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-neutral-100 p-1">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "rounded-xl px-2 py-2 text-center active:scale-[0.98]",
                  active ? "bg-white shadow-sm" : "text-neutral-500",
                ].join(" ")}
              >
                <div
                  className={[
                    "text-sm font-black",
                    active ? "text-neutral-950" : "text-neutral-500",
                  ].join(" ")}
                >
                  {tab.label}
                </div>
                <div className="mt-0.5 text-[10px] font-bold text-neutral-400">
                  {tab.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-h-[540px] overflow-y-auto pr-1">
      {activeTab === "create" ? (
        <AdminTodayQuickIssueCreate customers={customers} />
      ) : null}

      {activeTab === "queue" ? <AdminTodayPersistentTasks /> : null}

      {activeTab === "kakao" ? (
        <AdminTodayKakaoPanel
          customers={customers}
          onSaveCustomerMemo={onSaveCustomerMemo}
        />
      ) : null}
      </div>
    </section>
  );
}
