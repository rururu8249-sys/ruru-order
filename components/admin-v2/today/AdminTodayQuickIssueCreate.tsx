// components/admin-v2/today/AdminTodayQuickIssueCreate.tsx
// 목적: 오늘할일 오른쪽 상단 고객이슈 빠른등록
// 주의: 주문/입금/배송/정산 상태 변경 없음. admin_tasks 등록만 수행.

"use client";

import { useMemo, useState } from "react";
import type { CustomerRow, OrderGroup } from "@/lib/admin-v2/types";

type Props = {
  customers: CustomerRow[];
  groups: OrderGroup[];
};

type Candidate = {
  key: string;
  nickname: string;
  name: string;
  phone: string;
  orderNo: string;
  product: string;
  amount: number;
  source: "order" | "customer";
};

const ISSUE_TYPES = [
  { label: "교환", value: "exchange", taskType: "exchange" },
  { label: "반품", value: "return", taskType: "return" },
  { label: "환불", value: "refund", taskType: "refund" },
  { label: "구매", value: "purchase", taskType: "product" },
  { label: "진상", value: "complaint", taskType: "complaint" },
  { label: "기타", value: "etc", taskType: "general" },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function digits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function todayLabel() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${yyyy}.${mm}.${dd}(${weekday})`;
}

function groupOrderNo(group: OrderGroup) {
  const anyGroup = group as unknown as Record<string, any>;
  const first = (group.first || {}) as unknown as Record<string, any>;

  return clean(
    anyGroup.orderNumber ||
      anyGroup.order_number ||
      anyGroup.orderNo ||
      first.order_number ||
      first.order_no ||
      first.order_id ||
      group.groupId
  );
}

function groupPhone(group: OrderGroup) {
  const anyGroup = group as unknown as Record<string, any>;
  const first = (group.first || {}) as unknown as Record<string, any>;

  return clean(
    anyGroup.phone ||
      anyGroup.customer_phone ||
      first.customer_phone ||
      first.phone
  );
}

function customerKey(customer: CustomerRow) {
  const anyCustomer = customer as unknown as Record<string, any>;
  return clean(anyCustomer.id || `${customer.youtube_nickname}-${customer.customer_phone}-${customer.customer_name}`);
}

export default function AdminTodayQuickIssueCreate({ customers, groups }: Props) {
  const [keyword, setKeyword] = useState("");
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const candidates = useMemo<Candidate[]>(() => {
    const orderCandidates = groups.map((group) => {
      const anyGroup = group as unknown as Record<string, any>;
      const first = (group.first || {}) as unknown as Record<string, any>;

      return {
        key: `order-${group.groupId}`,
        nickname: clean(first.youtube_nickname || first.nickname || first.customer_nickname || anyGroup.nickname || anyGroup.customer_nickname),
        name: clean(first.customer_name),
        phone: groupPhone(group),
        orderNo: groupOrderNo(group),
        product: clean(anyGroup.itemSummary || anyGroup.item_summary || anyGroup.orderSummary || anyGroup.order_summary || first.product_name || first.item_name || first.product || first.title),
        amount: Number(anyGroup.totalAmount || anyGroup.total_amount || first.total_amount || first.final_amount || first.amount || 0),
        source: "order" as const,
      };
    });

    const customerCandidates = customers.map((customer) => ({
      key: `customer-${customerKey(customer)}`,
      nickname: clean(customer.youtube_nickname),
      name: clean(customer.customer_name),
      phone: clean(customer.customer_phone),
      orderNo: "",
      product: "",
      amount: 0,
      source: "customer" as const,
    }));

    const map = new Map<string, Candidate>();

    [...orderCandidates, ...customerCandidates].forEach((candidate) => {
      const dedupeKey = `${candidate.nickname}-${digits(candidate.phone)}-${candidate.name}`;
      if (!map.has(dedupeKey)) {
        map.set(dedupeKey, candidate);
      }
    });

    return Array.from(map.values()).filter((candidate) => candidate.nickname || candidate.name || candidate.phone);
  }, [customers, groups]);

  const filteredCandidates = useMemo(() => {
    const word = keyword.trim().toLowerCase();
    const number = digits(keyword);

    if (!searched || (!word && !number)) {
      return [];
    }

    return candidates
      .filter((candidate) => {
        const target = [
          candidate.nickname,
          candidate.name,
          candidate.phone,
          candidate.orderNo,
          candidate.product,
          candidate.amount,
        ]
          .join(" ")
          .toLowerCase();

        return target.includes(word) || (!!number && digits(target).includes(number));
      })
      .slice(0, 5);
  }, [candidates, keyword, searched]);

  const selectCandidate = (candidate: Candidate) => {
    setSelected(candidate);
    setNickname(candidate.nickname);
    setName(candidate.name);
    setPhone(candidate.phone);
  };

  const toggleType = (value: string) => {
    setSelectedTypes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  const saveIssue = async () => {
    if (!nickname.trim() && !name.trim() && !phone.trim()) {
      alert("고객을 검색해서 선택하거나 닉네임/이름/전화번호를 입력해주세요.");
      return;
    }

    if (selectedTypes.length === 0) {
      alert("이슈 유형을 1개 이상 선택해주세요.");
      return;
    }

    if (!memo.trim()) {
      alert("고객이슈 내용을 입력해주세요.");
      return;
    }

    const labels = ISSUE_TYPES.filter((item) => selectedTypes.includes(item.value)).map((item) => item.label);
    const firstType = ISSUE_TYPES.find((item) => selectedTypes.includes(item.value)) || ISSUE_TYPES[ISSUE_TYPES.length - 1];

    const title = `[고객이슈] ${nickname || name || phone} - ${labels.join(", ")}`;
    const body = [
      `자동날짜: ${todayLabel()}`,
      `이슈유형: ${labels.join(", ")}`,
      `닉네임: ${nickname || "-"}`,
      `이름: ${name || "-"}`,
      `전화번호: ${phone || "-"}`,
      selected?.orderNo ? `주문번호: ${selected.orderNo}` : "",
      selected?.product ? `상품명: ${selected.product}` : "",
      selected?.amount ? `주문금액: ${money(selected.amount)}` : "",
      "",
      memo.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    setSaving(true);

    try {
      const response = await fetch("/api/admin-v2/admin-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          task_type: firstType.taskType,
          title,
          body,
          customer_name: name.trim() || null,
          customer_nickname: nickname.trim() || null,
          related_product: selected?.product || null,
          source: "today_customer_issue_quick_create",
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        alert("고객이슈 등록 실패\n\n" + (result?.message || "알 수 없는 오류"));
        return;
      }

      window.dispatchEvent(new Event("ruru-admin-task-created"));
      alert("고객이슈를 등록했습니다.");

      setMemo("");
      setSelectedTypes([]);
      setSearched(false);
      setKeyword("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-yellow-200 bg-[#fff5bf] p-5 shadow-sm">
      <div className="pointer-events-none absolute right-3 top-2 rotate-12 text-[34px] text-neutral-400">📎</div>

      <div className="mb-4">
        <div className="text-[18px] font-black tracking-[-0.03em] text-neutral-950">새 고객이슈 등록</div>
        <div className="mt-1 text-[12px] font-bold text-neutral-500">
          닉네임·이름·주문번호·전화번호·상품명으로 검색 후 선택합니다.
        </div>
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setSearched(true);
            }}
            placeholder="닉네임, 이름, 주문번호, 전화번호, 상품명 검색"
            className="h-11 rounded-xl border border-neutral-200 bg-white px-4 text-[13px] font-bold outline-none focus:border-neutral-950"
          />
          <button
            type="button"
            onClick={() => setSearched(true)}
            className="h-11 rounded-xl bg-neutral-950 px-5 text-[13px] font-black text-white"
          >
            확인
          </button>
        </div>

        {searched ? (
          <div className="rounded-2xl border border-yellow-200 bg-white/70 p-2">
            <div className="mb-2 text-[12px] font-black text-neutral-600">추천 회원/주문 선택</div>

            {filteredCandidates.length === 0 ? (
              <div className="rounded-xl bg-white px-3 py-3 text-center text-[12px] font-bold text-neutral-400">
                검색 결과가 없습니다.
              </div>
            ) : (
              <div className="grid gap-1.5">
                {filteredCandidates.map((candidate) => {
                  const active = selected?.key === candidate.key;

                  return (
                    <button
                      key={candidate.key}
                      type="button"
                      onClick={() => selectCandidate(candidate)}
                      className={`grid grid-cols-[22px_1fr_1fr_120px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12px] font-black ${
                        active ? "border-neutral-950 bg-white text-neutral-950" : "border-neutral-200 bg-white/80 text-neutral-700"
                      }`}
                    >
                      <span className={`h-4 w-4 rounded-full border ${active ? "border-neutral-950 bg-neutral-950" : "border-neutral-300 bg-white"}`} />
                      <span className="truncate">{candidate.nickname || "-"}</span>
                      <span className="truncate">{candidate.name || "-"}</span>
                      <span className="truncate text-right">{candidate.phone || "-"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="grid gap-2 rounded-2xl border border-yellow-200 bg-white/60 p-3">
          <label className="grid grid-cols-[70px_1fr] items-center gap-2 text-[12px] font-black text-neutral-600">
            닉네임
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="h-10 rounded-xl border border-neutral-200 bg-white px-3 font-bold text-neutral-950 outline-none" />
          </label>
          <label className="grid grid-cols-[70px_1fr] items-center gap-2 text-[12px] font-black text-neutral-600">
            이름
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-10 rounded-xl border border-neutral-200 bg-white px-3 font-bold text-neutral-950 outline-none" />
          </label>
          <label className="grid grid-cols-[70px_1fr] items-center gap-2 text-[12px] font-black text-neutral-600">
            전화번호
            <input value={phone} onChange={(event) => setPhone(event.target.value)} className="h-10 rounded-xl border border-neutral-200 bg-white px-3 font-bold text-neutral-950 outline-none" />
          </label>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-black text-neutral-800">이슈 유형 / 복수 선택 가능</div>
          <div className="grid grid-cols-3 gap-2">
            {ISSUE_TYPES.map((type) => (
              <label
                key={type.value}
                className={`flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border text-[13px] font-black ${
                  selectedTypes.includes(type.value)
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-neutral-200 bg-white text-neutral-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type.value)}
                  onChange={() => toggleType(type.value)}
                  className="h-4 w-4 accent-neutral-950"
                />
                {type.label}
              </label>
            ))}
          </div>
        </div>

        <label className="grid gap-2">
          <span className="text-[13px] font-black text-neutral-800">고객이슈 내용</span>
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value.slice(0, 500))}
            placeholder="고객이슈 내용을 입력하세요..."
            className="min-h-[110px] rounded-xl border border-neutral-200 bg-white p-3 text-[13px] font-bold outline-none focus:border-neutral-950"
          />
          <div className="text-right text-[11px] font-bold text-neutral-400">{memo.length} / 500</div>
        </label>

        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-black text-neutral-700">📅 자동 날짜: {todayLabel()}</div>
          <button
            type="button"
            onClick={saveIssue}
            disabled={saving}
            className="h-12 rounded-xl bg-neutral-950 px-6 text-[14px] font-black text-white disabled:bg-neutral-300"
          >
            {saving ? "등록중..." : "고객이슈 등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
