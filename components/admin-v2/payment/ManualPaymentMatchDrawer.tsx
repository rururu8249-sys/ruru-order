"use client";

import { useEffect, useMemo, useState } from "react";
import type { DepositRow, OrderGroup } from "@/lib/admin-v2/types";
import { matchesManualPaymentSearch } from "@/components/admin-v2/payment/manualPaymentMatchSearchUtils";
import ManualPaymentOrderSummary from "@/components/admin-v2/payment/ManualPaymentOrderSummary";
import ManualPaymentAmountSummary from "@/components/admin-v2/payment/ManualPaymentAmountSummary";
import ManualPaymentDepositRow from "@/components/admin-v2/payment/ManualPaymentDepositRow";

type Props = {
  group?: OrderGroup | null;
  orderGroup?: OrderGroup | null;
  deposits?: DepositRow[];
  onClose: () => void;
  onMatched?: () => Promise<void> | void;
  onConfirm?: (group: OrderGroup, deposit: DepositRow) => Promise<void> | void;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString()}원`;
}

function getOrderAmount(group: OrderGroup) {
  if (Number(group.totalAmount || 0) > 0) return Number(group.totalAmount || 0);

  return group.rows.reduce((sum, row) => {
    const amount =
      Number(row.final_amount || 0) ||
      Number(row.adjusted_total_price || 0) ||
      Number(row.total_price || 0) ||
      0;

    return sum + amount;
  }, 0);
}

function getOrderIds(group: OrderGroup) {
  return group.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
}

function getNameScore(depositName: string, nickname: string, customerName: string) {
  const d = normalizeText(depositName);
  const n = normalizeText(nickname);
  const c = normalizeText(customerName);

  if (!d) return 0;
  if (n && d === n) return 100;
  if (c && d === c) return 95;
  if (n && (d.includes(n) || n.includes(d))) return 80;
  if (c && (d.includes(c) || c.includes(d))) return 75;

  return 0;
}

function isDepositConfirmed(deposit: DepositRow) {
  const status = String(deposit.match_status || "").trim();

  if (!status || status === "미확인" || status === "미매칭") return false;

  return Boolean(deposit.confirmed_at) || ["수동입금확인", "자동입금확인", "입금확인", "매칭완료", "처리완료", "완료"].includes(status);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function getKoreanWeekday(date: Date) {
  return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] || "";
}

function makeLocalDate(value: string) {
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getDepositTimeLabel(value: unknown, createdAt?: unknown) {
  const raw = String(value || "").trim();
  const createdRaw = String(createdAt || "").trim();

  if (!raw && !createdRaw) return "-";

  let timeText = "";
  let dateSource = raw;

  if (/^\d{2}:\d{2}$/.test(raw)) {
    timeText = `${raw}:00`;
    dateSource = createdRaw;
  } else if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) {
    timeText = raw;
    dateSource = createdRaw;
  }

  const parsedDate = makeLocalDate(dateSource || createdRaw || raw);

  if (!timeText && parsedDate) {
    timeText = `${pad2(parsedDate.getHours())}:${pad2(parsedDate.getMinutes())}:${pad2(parsedDate.getSeconds())}`;
  }

  if (!timeText && raw) {
    timeText = raw.slice(0, 8);
  }

  if (!parsedDate) return timeText || raw || "-";

  const dateText = `${parsedDate.getMonth() + 1}월 ${parsedDate.getDate()}일(${getKoreanWeekday(parsedDate)})`;
  return `${dateText} ${timeText || "-"}`;
}

export default function ManualPaymentMatchDrawer(props: Props) {
  const group = props.group || props.orderGroup || null;
  const [serverDeposits, setServerDeposits] = useState<DepositRow[]>(props.deposits || []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedDepositIds, setSelectedDepositIds] = useState<number[]>([]);
  const [showAll, setShowAll] = useState(false);

  const first = group?.first || null;
  const nickname = first?.youtube_nickname || "";
  const customerName = first?.customer_name || "";
  const expectedAmount = group ? getOrderAmount(group) : 0;

  useEffect(() => {
    setServerDeposits(props.deposits || []);
  }, [props.deposits]);

  useEffect(() => {
    if (group) {
      setKeyword(nickname || customerName || "");
      setSelectedDepositIds([]);
      setShowAll(false);
      void loadDeposits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.groupId]);

  const refreshBankdaAndRunStrictAutoMatch = async () => {
    try {
      await fetch("/api/bankda/sync-and-auto-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ source: "manual_payment_match_drawer" }),
      });
    } catch (error) {
      console.warn("[manual-drawer] bankda sync failed", error);
    }

    try {
      const runResponse = await fetch("/api/admin-v2/auto-payment-match/strict-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ source: "manual_payment_match_drawer" }),
      });

      const runResult = await runResponse.json().catch(() => null);

      if (!runResponse.ok || !runResult?.ok) {
        console.warn("[manual-drawer] strict auto payment failed", runResult);
        return;
      }

      const matchedCount = Number(runResult?.matched_count || runResult?.summary?.matched_count || 0);
      if (matchedCount > 0) window.dispatchEvent(new CustomEvent("ruru:admin-today-refresh"));
    } catch (error) {
      console.warn("[manual-drawer] strict auto payment error", error);
    }
  };

  const loadDeposits = async () => {
    setLoading(true);

    try {
      await refreshBankdaAndRunStrictAutoMatch();
      window.dispatchEvent(new CustomEvent("ruru:admin-today-refresh"));

      const response = await fetch("/api/admin-v2/deposits", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setActionError("입금내역 불러오기 실패: " + (result?.message || "알 수 없는 오류"));
        return;
      }

      setServerDeposits((result.deposits || []) as DepositRow[]);
    } finally {
      setLoading(false);
    }
  };

  const depositsForDisplay = useMemo(() => {
    const word = normalizeText(keyword);

    return (serverDeposits || [])
      .filter((deposit) => {
        if (isDepositConfirmed(deposit)) return false;
        if (showAll) return true;

        const amountMatch = Number(deposit.amount || 0) === expectedAmount;
        const nameMatch = getNameScore(deposit.depositor_name, nickname, customerName) > 0;

        if (!word) return amountMatch || nameMatch;

        return (
          amountMatch ||
          nameMatch ||
          matchesManualPaymentSearch({
            keyword,
            depositName: deposit.depositor_name,
            amount: deposit.amount,
          })
        );
      })
      .sort((a, b) => {
        const aAmount = Number(a.amount || 0) === expectedAmount ? 1 : 0;
        const bAmount = Number(b.amount || 0) === expectedAmount ? 1 : 0;
        if (aAmount !== bAmount) return bAmount - aAmount;

        const aName = getNameScore(a.depositor_name, nickname, customerName);
        const bName = getNameScore(b.depositor_name, nickname, customerName);
        if (aName !== bName) return bName - aName;

        return Number(b.id || 0) - Number(a.id || 0);
      });
  }, [serverDeposits, keyword, expectedAmount, nickname, customerName, showAll]);

  const selectedDepositIdSet = useMemo(() => new Set(selectedDepositIds), [selectedDepositIds]);

  const selectedDeposits = useMemo(() => {
    return serverDeposits.filter((deposit) => selectedDepositIdSet.has(Number(deposit.id)));
  }, [serverDeposits, selectedDepositIdSet]);

  const selectedTotalAmount = useMemo(() => {
    return selectedDeposits.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
  }, [selectedDeposits]);

  const amountDifference = selectedTotalAmount - expectedAmount;
  const exactAmountMatched = expectedAmount > 0 && selectedDeposits.length > 0 && amountDifference === 0;

  if (!group || !first) return null;

  const confirmManualMatch = async () => {
    if (saving) return;

    setSaving(true);
    setActionError("");

    try {
      const orderIds = getOrderIds(group);
      const hasSelectedDeposits = selectedDeposits.length > 0;

      if (!hasSelectedDeposits) {
        const response = await fetch("/api/admin-v2/manual-payment-confirm-without-deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderGroupId: group.groupId,
            orderIds,
            expectedAmount,
          }),
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.ok) {
          setActionError(result?.message || "입금내역 없이 수동확인 실패");
          return;
        }

        await props.onMatched?.();
        props.onClose();
        return;
      }

      const depositIds = selectedDeposits
        .map((deposit) => Number(deposit.id))
        .filter((id) => Number.isFinite(id) && id > 0);

      const response = await fetch("/api/admin-v2/manual-payment-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderGroupId: group.groupId,
          orderIds,
          depositIds,
          depositId: depositIds[0] || null,
          expectedAmount,
          selectedTotalAmount,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setActionError(result?.message || "수동매칭 실패");
        return;
      }

      await props.onMatched?.();
      props.onClose();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/30">
      <aside className="fixed bottom-5 right-5 top-[118px] z-[95] flex w-[520px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black tracking-[0.18em] text-slate-400">MANUAL PAYMENT MATCH</div>
              <h2 className="mt-0.5 text-lg font-black tracking-[-0.04em] text-slate-950">수동 입금매칭</h2>
            </div>

            <div className="flex items-start gap-2">
              <div className="rounded-xl bg-orange-50 px-3 py-2 text-right text-[11px] font-black text-orange-700">
                돈 관련 작업<br />입금자명·금액 확인
              </div>
              <button
                type="button"
                onClick={props.onClose}
                disabled={saving}
                aria-label="수동 입금매칭 닫기"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-black text-slate-400 shadow-sm active:scale-[0.97] disabled:opacity-50"
              >
                ×
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            <ManualPaymentOrderSummary group={group} expectedAmount={expectedAmount} />

            <div className="grid grid-cols-[1fr_78px_84px] gap-2">
              <input
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setSelectedDepositIds([]);
                  setShowAll(false);
                }}
                placeholder="입금자명 또는 금액 검색"
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              />

              <button
                type="button"
                onClick={() => {
                  setKeyword("");
                  setShowAll(true);
                }}
                className="h-10 rounded-xl bg-slate-950 text-xs font-black text-white active:scale-[0.98]"
              >
                전체보기
              </button>

              <button
                type="button"
                onClick={loadDeposits}
                disabled={loading}
                className="h-10 rounded-xl bg-blue-600 text-xs font-black text-white active:scale-[0.98] disabled:bg-slate-300"
              >
                {loading ? "로딩중" : "새로고침"}
              </button>
            </div>

            <ManualPaymentAmountSummary
              expectedAmount={expectedAmount}
              selectedTotalAmount={selectedTotalAmount}
              selectedCount={selectedDeposits.length}
              amountDifference={amountDifference}
            />
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-black text-slate-700">
              미매칭 입금내역 {depositsForDisplay.length.toLocaleString()}건
            </div>
            <div className="text-xs font-bold text-slate-400">
              저장된 전체 입금내역 {serverDeposits.length.toLocaleString()}건
            </div>
          </div>

          {depositsForDisplay.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-14 text-center">
              <div className="text-3xl">🧾</div>
              <div className="mt-3 text-base font-black text-slate-600">표시할 미확인 입금내역이 없습니다.</div>
              <div className="mt-2 text-sm font-bold leading-6 text-slate-400">
                검색어를 지우거나 전체보기를 눌러주세요.<br />
                방금 입금된 건은 새로고침으로 다시 확인할 수 있습니다.
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {depositsForDisplay.map((deposit) => {
                const selected = selectedDepositIdSet.has(Number(deposit.id));
                const amountMatch = Number(deposit.amount || 0) === expectedAmount;
                const nameScore = getNameScore(deposit.depositor_name, nickname, customerName);

                let tag = "확인필요";
                if (amountMatch && nameScore >= 90) tag = "추천";
                else if (amountMatch && nameScore > 0) tag = "이름유사";
                else if (amountMatch) tag = "금액일치";
                else if (nameScore > 0) tag = "이름유사";

                return (
                  <ManualPaymentDepositRow
                    key={deposit.id}
                    deposit={deposit}
                    selected={selected}
                    tag={tag}
                    timeLabel={getDepositTimeLabel(deposit.deposited_time, deposit.created_at)}
                    onToggle={() => {
                      const id = Number(deposit.id);
                      setSelectedDepositIds((prev) =>
                        prev.includes(id)
                          ? prev.filter((item) => item !== id)
                          : [...prev, id]
                      );
                    }}
                  />
                );
              })}
            </div>
          )}
        </section>

        {actionError ? (
          <div className="shrink-0 border-t border-red-100 bg-red-50 px-4 py-3 text-sm font-black leading-5 text-red-700">
            수동입금 처리 오류: {actionError}
          </div>
        ) : null}

        <footer className="shrink-0 border-t border-slate-200 bg-white p-3.5">
          <button
            type="button"
            onClick={confirmManualMatch}
            disabled={saving}
            className="h-10 w-full rounded-xl bg-slate-950 text-[13px] font-black text-white active:scale-[0.98] disabled:bg-slate-300"
          >
            {saving
              ? "처리중..."
              : selectedDeposits.length === 0
                ? "입금내역 없이 수동확인"
                : exactAmountMatched
                  ? "수동매칭"
                  : "금액 다름 · 수동매칭"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
