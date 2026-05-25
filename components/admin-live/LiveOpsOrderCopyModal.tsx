"use client";

import { showAdminToast } from "@/lib/adminToast";

import { useEffect, useMemo, useState } from "react";

export const ORDER_COPY_DONE_STORAGE_KEY = "ruru_admin_live_ops_order_copy_done_ids_v1";

type RecentOrder = {
  id?: string | number | null;
  order_id?: string | number | null;
  orderGroupId?: string | null;
  order_group_id?: string | null;
  orderNo?: string | null;
  order_no?: string | null;
  nickname?: string | null;
  maskedNickname?: string | null;
  itemSummary?: string | null;
  name?: string | null;
  amount?: number | string | null;
  createdAt?: string | null;
  created_at?: string | null;
};

type Props = {
  open: boolean;
  orders: RecentOrder[];
  onClose: () => void;
  onCopied?: (copiedKeys: string[]) => void;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function liveOpsOrderCopyKey(order: RecentOrder) {
  return clean(
    order.orderGroupId ||
      order.order_group_id ||
      order.id ||
      order.order_id ||
      order.orderNo ||
      order.order_no ||
      `${order.nickname || order.name}-${order.amount}-${order.createdAt || order.created_at}`
  );
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}


function maskNicknameForChat(value: unknown) {
  const text = clean(value);
  if (!text) return "고객";
  const chars = Array.from(text);

  if (chars.length <= 1) return `${chars[0] || "고객"}*`;
  if (chars.length <= 3) return `${chars[0]}**`;

  return `${chars.slice(0, 2).join("")}**`;
}

function customerName(order: RecentOrder) {
  return clean(order.maskedNickname) || maskNicknameForChat(order.nickname || order.name);
}

function buildOrderText(order: RecentOrder) {
  const summary = clean(order.itemSummary) || "상품명확인";
  return `${customerName(order)}님 → ${summary} · ${money(order.amount)}`;
}

function buildCopyText(orders: RecentOrder[]) {
  return `✅ 주문서 완료! ㅣ ${orders.map(buildOrderText).join(" ㅣ ")}`;
}

export function loadLiveOpsCopiedOrderKeys() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(ORDER_COPY_DONE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map((item) => String(item)));
  } catch {
    return new Set<string>();
  }
}

function saveLiveOpsCopiedOrderKeys(keys: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ORDER_COPY_DONE_STORAGE_KEY, JSON.stringify(Array.from(keys)));
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export default function LiveOpsOrderCopyModal({ open, orders, onClose, onCopied }: Props) {
  const [doneKeys, setDoneKeys] = useState<Set<string>>(() => new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [copiedText, setCopiedText] = useState("");
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!open) return;

    setDoneKeys(loadLiveOpsCopiedOrderKeys());
    setSelectedKeys(new Set());
    setCopiedText("");
  }, [open]);

  const visibleOrders = useMemo(() => {
    return (orders || []).filter((order) => {
      const key = liveOpsOrderCopyKey(order);
      return key && !doneKeys.has(key);
    });
  }, [orders, doneKeys]);

  const selectedOrders = useMemo(() => {
    return visibleOrders.filter((order) => selectedKeys.has(liveOpsOrderCopyKey(order)));
  }, [visibleOrders, selectedKeys]);

  const previewText = useMemo(() => {
    if (!selectedOrders.length) return "선택한 주문서 알림이 없습니다.";
    return buildCopyText(selectedOrders);
  }, [selectedOrders]);

  const allSelected =
    visibleOrders.length > 0 && visibleOrders.every((order) => selectedKeys.has(liveOpsOrderCopyKey(order)));

  const toggleOrder = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  };

  const toggleAll = () => {
    setSelectedKeys(() => {
      if (allSelected) return new Set();

      const next = new Set<string>();
      visibleOrders.forEach((order) => {
        const key = liveOpsOrderCopyKey(order);
        if (key) next.add(key);
      });

      return next;
    });
  };

  const resetHidden = () => {
    if (!window.confirm("복사완료로 숨긴 새 주문서 제출 알림을 다시 보이게 할까요?\n\n주문 DB는 변경되지 않습니다.")) return;

    const empty = new Set<string>();
    setDoneKeys(empty);
    setSelectedKeys(new Set());
    saveLiveOpsCopiedOrderKeys(empty);
    setCopiedText("");
  };

  const copySelected = async () => {
    if (!selectedOrders.length) {
      showAdminToast("복사할 주문서 알림을 선택해주세요.");
      return;
    }

    const text = buildCopyText(selectedOrders);
    const copiedKeys = selectedOrders.map(liveOpsOrderCopyKey).filter(Boolean);

    setCopying(true);

    try {
      await copyToClipboard(text);

      const nextDoneKeys = new Set(doneKeys);
      copiedKeys.forEach((key) => nextDoneKeys.add(key));

      setDoneKeys(nextDoneKeys);
      saveLiveOpsCopiedOrderKeys(nextDoneKeys);
      setSelectedKeys(new Set());
      setCopiedText(text);
      onCopied?.(copiedKeys);
    } catch {
      showAdminToast("자동복사에 실패했습니다. 미리보기 문구를 직접 복사해주세요.");
      setCopiedText(text);
    } finally {
      setCopying(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-3 py-4">
      <div className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[22px] font-black tracking-[-0.04em] text-slate-950">📃 새 주문서 제출</div>
              <div className="mt-1 text-sm font-bold text-slate-500">
                선택한 알림을 유튜브 채팅창용 한 줄 문구로 복사합니다.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 active:scale-[0.98]"
            >
              닫기
            </button>
          </div>

          <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] font-black leading-5 text-blue-800">
            복사 형식: ✅ 주문서 완료! ㅣ 닉네**님 → 상품명 옵션 1개 · 19,000원
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-black text-slate-700">
              미복사 알림 {visibleOrders.length.toLocaleString("ko-KR")}건 · 선택 {selectedOrders.length.toLocaleString("ko-KR")}건
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleAll}
                disabled={!visibleOrders.length}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:opacity-40"
              >
                {allSelected ? "전체해제" : "전체선택"}
              </button>

              <button
                type="button"
                onClick={resetHidden}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-500"
              >
                숨김 초기화
              </button>
            </div>
          </div>

          {visibleOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-400">
              복사할 새 주문서 제출 알림이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
              {visibleOrders.map((order) => {
                const key = liveOpsOrderCopyKey(order);
                const selected = selectedKeys.has(key);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleOrder(key)}
                    className={`grid w-full grid-cols-[34px_1fr] gap-3 px-4 py-3 text-left active:scale-[0.995] ${
                      selected ? "bg-blue-50" : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`mt-1 flex h-6 w-6 items-center justify-center rounded-lg border text-xs font-black ${
                        selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-transparent"
                      }`}
                    >
                      ✓
                    </span>

                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-950">
                        {customerName(order)}님
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-black text-slate-500">
                        {money(order.amount)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-800">
            {previewText}
          </div>

          {copiedText ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-black leading-5 text-emerald-700">
              복사 완료! 선택한 알림은 왼쪽 사이드바 목록에서 숨김 처리됩니다. 주문 DB는 변경되지 않았습니다.
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 bg-white p-4">
          <button
            type="button"
            onClick={copySelected}
            disabled={copying || !selectedOrders.length}
            className="h-12 w-full rounded-2xl bg-blue-600 text-sm font-black text-white shadow-sm active:scale-[0.99] disabled:bg-slate-300"
          >
            {copying ? "복사중..." : `복사 확인 · 선택 ${selectedOrders.length.toLocaleString("ko-KR")}건`}
          </button>
        </div>
      </div>
    </div>
  );
}
