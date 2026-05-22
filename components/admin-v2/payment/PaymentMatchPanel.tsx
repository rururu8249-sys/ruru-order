// components/admin-v2/payment/PaymentMatchPanel.tsx
// 목적: 입금관리 메뉴를 무통장 입금내역 장부형 화면으로 단순화
// 주의:
// - 자동입금확인 조건은 useStrictAutoPaymentConfirm + auto-payment-match API 기준 유지
// - 수동매칭/자동매칭/주문상태/정산/배송비 계산 로직 변경 없음
// - 이 화면은 입금내역 표시, 검색, 날짜필터, 새로고침 UI만 담당

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DepositRow, OrderGroup } from "@/lib/admin-v2/types";
import useStrictAutoPaymentConfirm from "@/components/admin-v2/payment/useStrictAutoPaymentConfirm";

type Props = {
  deposits: DepositRow[];
  orderGroups: OrderGroup[];
  onOpenManualMatch: (group: OrderGroup) => void;
  onSyncBankdaDeposits: () => Promise<void> | void;
};

type AutoMatchPreviewCandidate = {
  order_id?: string;
  order_group_id?: string;
  order_nickname?: string | null;
  order_amount?: number | string | null;
  deposit_id?: string | number | null;
  deposit_depositor?: string | null;
  deposit_amount?: number | string | null;
};

type AutoMatchPreviewResult = {
  ok: boolean;
  summary?: {
    auto_match_preview_count?: number;
    eligible_unmatched_deposits?: number;
    eligible_unpaid_orders?: number;
  };
  candidates?: AutoMatchPreviewCandidate[];
};

const BANKDA_AUTO_SYNC_MIN_GAP_MS = 5 * 60 * 1000;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[\s\-_.]/g, "")
    .toLowerCase();
}

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function parseDepositDate(deposit: DepositRow) {
  const raw = String(deposit.deposited_time || deposit.created_at || "").trim();
  if (!raw) return null;

  const date = new Date(raw.replace(" ", "T"));
  return Number.isFinite(date.getTime()) ? date : null;
}

function toDateKey(date: Date | null) {
  if (!date) return "";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function formatDepositTime(deposit: DepositRow) {
  const raw = String(deposit.deposited_time || "").trim();
  const createdRaw = String(deposit.created_at || "").trim();

  if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return raw.length === 5 ? `${raw}:00` : raw;
  }

  const date = parseDepositDate(deposit);

  if (!date) {
    if (raw) return raw;
    if (createdRaw) return createdRaw;
    return "-";
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isDepositConfirmed(deposit: DepositRow) {
  const status = String(deposit.match_status || "").trim();

  if (!status || status === "미확인" || status === "미매칭") {
    return false;
  }

  return (
    Boolean(deposit.confirmed_at) ||
    Boolean(deposit.match_order_group_id) ||
    ["수동입금확인", "자동입금확인", "입금확인", "매칭완료", "처리완료", "완료"].includes(status)
  );
}

function depositStatusLabel(deposit: DepositRow) {
  if (isDepositConfirmed(deposit)) {
    const status = String(deposit.match_status || "").trim();
    if (status === "자동입금확인") return "자동입금확인";
    if (status === "수동입금확인") return "수동입금확인";
    return status || "입금확인";
  }

  return "미매칭";
}

function statusClass(deposit: DepositRow) {
  const label = depositStatusLabel(deposit);

  if (label === "자동입금확인") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (label === "수동입금확인") {
    return "bg-blue-100 text-blue-700";
  }

  if (label === "입금확인" || label === "매칭완료") {
    return "bg-neutral-900 text-white";
  }

  return "bg-rose-50 text-rose-700";
}

export default function PaymentMatchPanel({
  deposits,
  orderGroups,
  onOpenManualMatch,
  onSyncBankdaDeposits,
}: Props) {
  void orderGroups;
  void onOpenManualMatch;

  const [serverDeposits, setServerDeposits] = useState<DepositRow[]>(deposits || []);
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(false);

  const [serverDepositLoading, setServerDepositLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoSyncLoading, setAutoSyncLoading] = useState(false);
  const [autoRunLoading, setAutoRunLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<AutoMatchPreviewResult | null>(null);
  const [lastAutoSyncLabel, setLastAutoSyncLabel] = useState("");
  const [lastAutoSyncMessage, setLastAutoSyncMessage] = useState("자동입금확인 대기중");

  const autoSyncInFlightRef = useRef(false);
  const lastBankdaSyncAtRef = useRef(0);

  const forceLoadServerDeposits = async () => {
    setServerDepositLoading(true);

    try {
      const response = await fetch("/api/admin-v2/deposits", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        alert("입금내역 조회 실패\n\n" + (result?.message || "알 수 없는 오류"));
        return;
      }

      setServerDeposits((result.deposits || []) as DepositRow[]);
    } finally {
      setServerDepositLoading(false);
    }
  };

  const runAutoMatchPreview = async () => {
    try {
      const response = await fetch("/api/admin-v2/auto-payment-match/preview", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json().catch(() => null)) as AutoMatchPreviewResult | null;

      if (!response.ok || !result?.ok) {
        setLastAutoSyncMessage(result?.summary ? "자동입금확인 후보 확인 실패" : "자동입금확인 대기중");
        return;
      }

      setPreviewResult(result);
    } catch {
      setLastAutoSyncMessage("자동입금확인 후보 확인 오류");
    }
  };

  const runBankdaSync = async () => {
    if (syncing || autoSyncInFlightRef.current) {
      setLastAutoSyncMessage("이미 입금내역 조회가 진행중입니다.");
      return;
    }

    setSyncing(true);

    try {
      await onSyncBankdaDeposits();
      await forceLoadServerDeposits();
      await runAutoMatchPreview();

      const nowLabel = new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      setLastAutoSyncLabel(nowLabel);
      setLastAutoSyncMessage("입금내역 새로고침 완료 · 엄격 자동입금확인 검사 완료");
    } finally {
      setSyncing(false);
    }
  };

  const runSilentBankdaAutoSync = async () => {
    if (autoSyncInFlightRef.current) return;

    const now = Date.now();
    const gap = now - lastBankdaSyncAtRef.current;

    if (lastBankdaSyncAtRef.current > 0 && gap < BANKDA_AUTO_SYNC_MIN_GAP_MS) {
      const remainSeconds = Math.ceil((BANKDA_AUTO_SYNC_MIN_GAP_MS - gap) / 1000);
      setLastAutoSyncMessage(`뱅크다 5분 제한 대기중 · 약 ${remainSeconds}초 후 재조회`);
      return;
    }

    lastBankdaSyncAtRef.current = now;
    autoSyncInFlightRef.current = true;
    setAutoSyncLoading(true);

    try {
      const response = await fetch("/api/bankda/sync-deposits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({}),
      });

      const result = await response.json().catch(() => null);

      const nowLabel = new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      setLastAutoSyncLabel(nowLabel);

      if (!response.ok || !result?.ok) {
        setLastAutoSyncMessage(result?.message || "입금 자동조회 실패");
        return;
      }

      const fetched = Number(result.rawCount ?? result.fetchedCount ?? 0);
      const inserted = Number(result.insertedCount ?? 0);
      const skipped = Number(result.skippedCount ?? 0);

      setLastAutoSyncMessage(
        `조회 ${fetched.toLocaleString("ko-KR")}건 · 신규 ${inserted.toLocaleString("ko-KR")}건 · 중복 ${skipped.toLocaleString("ko-KR")}건`
      );

      await forceLoadServerDeposits();
      await runAutoMatchPreview();
    } catch (error) {
      setLastAutoSyncMessage(error instanceof Error ? error.message : "입금 자동조회 오류");
    } finally {
      autoSyncInFlightRef.current = false;
      setAutoSyncLoading(false);
    }
  };

  useEffect(() => {
    setServerDeposits(deposits || []);
  }, [deposits]);

  useEffect(() => {
    void forceLoadServerDeposits();
    void runAutoMatchPreview();
  }, []);

  useEffect(() => {
    if (!autoSyncEnabled) return;

    void runSilentBankdaAutoSync();

    const timer = window.setInterval(() => {
      void runSilentBankdaAutoSync();
    }, 310000);

    return () => window.clearInterval(timer);
  }, [autoSyncEnabled]);

  useStrictAutoPaymentConfirm({
    enabled: autoSyncEnabled,
    previewResult,
    autoRunLoading,
    onMessage: setLastAutoSyncMessage,
    onStart: () => setAutoRunLoading(true),
    onFinish: () => setAutoRunLoading(false),
    onAfterSuccess: async () => {
      await forceLoadServerDeposits();
      await runAutoMatchPreview();
    },
  });

  const depositsForDisplay = serverDeposits.length > 0 ? serverDeposits : deposits;

  const filteredDeposits = useMemo(() => {
    const word = normalizeText(keyword);
    const amountKeyword = digitsOnly(keyword);

    return [...depositsForDisplay]
      .filter((deposit) => {
        if (showOnlyUnmatched && isDepositConfirmed(deposit)) return false;

        const depositDateKey = toDateKey(parseDepositDate(deposit));

        if (startDate && depositDateKey && depositDateKey < startDate) return false;
        if (endDate && depositDateKey && depositDateKey > endDate) return false;

        if (!word && !amountKeyword) return true;

        const targetText = normalizeText([
          deposit.depositor_name,
          deposit.match_status,
          deposit.confirmed_note,
          deposit.match_order_group_id,
        ].join(" "));

        const targetAmount = digitsOnly(deposit.amount);

        return (
          Boolean(word && targetText.includes(word)) ||
          Boolean(amountKeyword && targetAmount.includes(amountKeyword))
        );
      })
      .sort((a, b) => {
        const aTime = parseDepositDate(a)?.getTime() || 0;
        const bTime = parseDepositDate(b)?.getTime() || 0;
        return bTime - aTime;
      });
  }, [depositsForDisplay, keyword, startDate, endDate, showOnlyUnmatched]);

  const summary = useMemo(() => {
    const total = depositsForDisplay.length;
    const unmatched = depositsForDisplay.filter((deposit) => !isDepositConfirmed(deposit)).length;
    const matched = total - unmatched;
    const totalAmount = depositsForDisplay.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
    const unmatchedAmount = depositsForDisplay
      .filter((deposit) => !isDepositConfirmed(deposit))
      .reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);

    return {
      total,
      unmatched,
      matched,
      totalAmount,
      unmatchedAmount,
    };
  }, [depositsForDisplay]);

  const autoCandidateCount = Number(previewResult?.summary?.auto_match_preview_count || 0);

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-[-0.04em] text-neutral-950">
              무통장 입금내역
            </h2>
            <p className="mt-1 text-sm font-bold text-neutral-500">
              실제 들어온 입금만 단순하게 확인합니다. 자동입금확인은 엄격 조건에서만 백그라운드 처리됩니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-2 text-xs font-black ${autoSyncEnabled ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
              자동입금확인 {autoSyncEnabled ? "ON" : "OFF"}
            </span>

            <button
              type="button"
              onClick={() => setAutoSyncEnabled((value) => !value)}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-black text-neutral-700 active:scale-[0.98]"
            >
              {autoSyncEnabled ? "자동 끄기" : "자동 켜기"}
            </button>

            <button
              type="button"
              onClick={runBankdaSync}
              disabled={syncing || autoSyncLoading || serverDepositLoading}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white active:scale-[0.98] disabled:bg-neutral-300"
            >
              {syncing || autoSyncLoading || serverDepositLoading ? "조회중..." : "입금내역 새로고침"}
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-xs font-bold text-neutral-500">
          자동입금확인 기준: 닉네임 완전일치 + 금액 완전일치 + 1:1 단일 후보만 처리 · 현재 엄격 후보 {autoCandidateCount.toLocaleString("ko-KR")}건
          {lastAutoSyncLabel ? ` · 최근조회 ${lastAutoSyncLabel}` : ""} · {lastAutoSyncMessage}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <SummaryCard label="전체 입금" value={`${summary.total.toLocaleString("ko-KR")}건`} />
          <SummaryCard label="미매칭" value={`${summary.unmatched.toLocaleString("ko-KR")}건`} strong />
          <SummaryCard label="처리완료" value={`${summary.matched.toLocaleString("ko-KR")}건`} />
          <SummaryCard label="입금합계" value={money(summary.totalAmount)} />
          <SummaryCard label="미매칭금액" value={money(summary.unmatchedAmount)} strong />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_150px_auto] lg:items-end">
          <label className="grid gap-1">
            <span className="text-xs font-black text-neutral-500">검색</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="입금자명 또는 금액으로 검색"
              className="h-12 rounded-xl border border-neutral-200 px-4 text-sm font-bold outline-none focus:border-neutral-900"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black text-neutral-500">시작일</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-12 rounded-xl border border-neutral-200 px-3 text-sm font-bold outline-none focus:border-neutral-900"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black text-neutral-500">종료일</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-12 rounded-xl border border-neutral-200 px-3 text-sm font-bold outline-none focus:border-neutral-900"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setKeyword("");
              setStartDate("");
              setEndDate("");
              setShowOnlyUnmatched(false);
            }}
            className="h-12 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-700 active:scale-[0.98]"
          >
            초기화
          </button>
        </div>

        <label className="mt-3 inline-flex items-center gap-2 text-sm font-black text-neutral-700">
          <input
            type="checkbox"
            checked={showOnlyUnmatched}
            onChange={(event) => setShowOnlyUnmatched(event.target.checked)}
            className="h-4 w-4"
          />
          미매칭 입금만 보기
        </label>
      </section>

      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="grid grid-cols-[120px_minmax(180px,1fr)_140px_150px_160px] bg-neutral-950 px-4 py-3 text-[13px] font-black text-white">
          <div>상태</div>
          <div>입금자명</div>
          <div className="text-right">입금금액</div>
          <div className="text-center">입금시간</div>
          <div className="text-center">연결정보</div>
        </div>

        {filteredDeposits.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm font-black text-neutral-400">
            표시할 입금내역이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {filteredDeposits.map((deposit) => (
              <div
                key={deposit.id}
                className="grid grid-cols-[120px_minmax(180px,1fr)_140px_150px_160px] items-center px-4 py-3 text-sm hover:bg-neutral-50"
              >
                <div>
                  <span className={`inline-flex rounded-lg px-2.5 py-1 text-[12px] font-black ${statusClass(deposit)}`}>
                    {depositStatusLabel(deposit)}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="truncate text-base font-black text-neutral-950">
                    {deposit.depositor_name || "-"}
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold text-neutral-400">
                    ID {deposit.id}
                  </div>
                </div>

                <div className="text-right text-base font-black text-neutral-950">
                  +{money(deposit.amount)}
                </div>

                <div className="text-center text-xs font-black text-neutral-500">
                  {formatDepositTime(deposit)}
                </div>

                <div className="min-w-0 text-center text-xs font-bold text-neutral-500">
                  {deposit.match_order_group_id ? (
                    <span className="truncate text-blue-600">
                      {deposit.match_order_group_id}
                    </span>
                  ) : (
                    <span>-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-neutral-100 px-4 py-3 text-xs font-black text-neutral-400">
          표시 {filteredDeposits.length.toLocaleString("ko-KR")}건 / 전체 {depositsForDisplay.length.toLocaleString("ko-KR")}건
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${strong ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200 bg-neutral-50 text-neutral-950"}`}>
      <div className={`text-[12px] font-black ${strong ? "text-white/60" : "text-neutral-500"}`}>
        {label}
      </div>
      <div className="mt-1 text-lg font-black tracking-[-0.04em]">
        {value}
      </div>
    </div>
  );
}
