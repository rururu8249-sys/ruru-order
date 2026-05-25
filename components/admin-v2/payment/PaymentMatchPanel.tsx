// components/admin-v2/payment/PaymentMatchPanel.tsx
// 목적: 입금관리 메뉴를 은행 입금내역 조회형 화면으로 단순화
// 주의:
// - 자동입금확인 조건/실행 로직 변경 없음
// - 수동매칭 저장 로직 변경 없음
// - Bankda 동기화 API 변경 없음
// - 이 화면은 입금내역 표시, 검색, 날짜필터, 선택합계, 새로고침 UI만 담당

"use client";

import { showAdminToast } from "@/lib/adminToast";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DepositRow, OrderGroup } from "@/lib/admin-v2/types";
import { formatDepositDateTime as formatPaymentDepositDateTime, formatKoreanDateOnly, getPaymentDateKeyOffset, parsePaymentDepositDate, toPaymentDateKey } from "@/components/admin-v2/payment/paymentDateFormatUtils";
import useStrictAutoPaymentConfirm from "@/components/admin-v2/payment/useStrictAutoPaymentConfirm";

type Props = {
  deposits: DepositRow[];
  orderGroups: OrderGroup[];
  onOpenManualMatch: (group: OrderGroup) => void;
  onSyncBankdaDeposits: () => Promise<void> | void;
  variant?: "admin-v2" | "admin-live";
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

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function parseDepositDate(deposit: DepositRow) {
  return parsePaymentDepositDate(deposit);
}

function toDateKey(date: Date | null) {
  return toPaymentDateKey(date);
}

function getTodayKey(offset = 0) {
  return getPaymentDateKeyOffset(offset);
}

function formatDepositDateTime(deposit: DepositRow) {
  return formatPaymentDepositDateTime(deposit);
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

function getDepositStatusText(deposit: DepositRow) {
  if (isDepositConfirmed(deposit)) {
    const status = String(deposit.match_status || "").trim();
    return status || "연결완료";
  }

  return "-";
}

function getBankName(deposit: DepositRow) {
  const row = deposit as any;
  return row.bank_name || row.bank || row.bank_code || "카카오뱅크";
}

function getAccountInfo(deposit: DepositRow) {
  const row = deposit as any;
  return row.account_number || row.account_no || row.account || "-";
}

function maskAccount(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "-";

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return raw;

  return `${digits.slice(0, 4)}-**-****-${digits.slice(-4)}`;
}

function getLinkedOrderText(deposit: DepositRow) {
  const row = deposit as any;
  return row.match_order_group_id || row.matched_order_group_id || row.order_group_id || "-";
}

function getMemoText(deposit: DepositRow) {
  const row = deposit as any;
  return row.memo || row.admin_memo || row.note || getDepositStatusText(deposit);
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[12px] font-black text-slate-500">{label}</div>
      <div className="mt-2 text-[22px] font-black tracking-[-0.04em] text-slate-950">{value}</div>
      {sub ? <div className="mt-1 text-[11px] font-bold text-slate-400">{sub}</div> : null}
    </div>
  );
}

export default function PaymentMatchPanel({
  deposits,
  orderGroups,
  onOpenManualMatch,
  onSyncBankdaDeposits,
  variant = "admin-v2",
}: Props) {
  void orderGroups;
  void onOpenManualMatch;
  const isAdminLiveVariant = variant === "admin-live";
  const sectionClassName = isAdminLiveVariant
    ? "grid w-full gap-4"
    : "mx-auto grid w-full max-w-[820px] gap-4";
  const todayLabel = formatKoreanDateOnly(new Date());


  const [serverDeposits, setServerDeposits] = useState<DepositRow[]>(deposits || []);
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState(getTodayKey(-7));
  const [endDate, setEndDate] = useState(getTodayKey(0));
  const [selectedDepositIds, setSelectedDepositIds] = useState<Array<string | number>>([]);

  const [serverDepositLoading, setServerDepositLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoSyncLoading, setAutoSyncLoading] = useState(false);
  const [autoRunLoading, setAutoRunLoading] = useState(false);
  const [lastAutoSyncLabel, setLastAutoSyncLabel] = useState("");
  const [lastAutoSyncMessage, setLastAutoSyncMessage] = useState("입금내역 조회 대기중");
  const [previewResult, setPreviewResult] = useState<AutoMatchPreviewResult | null>(null);

  const autoSyncInFlightRef = useRef(false);
  const lastBankdaSyncAtRef = useRef(0);

  useStrictAutoPaymentConfirm({
    enabled: true,
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


  // AUTO_RUN_AFTER_BANKDA_SYNC_PATCH
  // 뱅크다 입금내역 동기화 직후, 닉네임+주문그룹 합계금액+1:1 후보만 자동입금확인 처리합니다.
  // 상품명/옵션/구분자(|)는 자동입금확인 기준에 사용하지 않습니다.
  const runAutoMatchAfterBankdaSync = async () => {
    const response = await fetch("/api/admin-v2/auto-payment-match/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirm: "RUN_AUTO_MATCH",
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      setLastAutoSyncMessage(`자동입금확인 실패: ${result?.message || "알 수 없는 오류"}`);
      return 0;
    }

    const successCount = Number(
      result?.summary?.success_count ||
        result?.success_count ||
        result?.matched_count ||
        0
    );

    const failedCount = Number(result?.summary?.failed_count || result?.failed_count || 0);

    if (successCount > 0) {
      setLastAutoSyncMessage(
        failedCount > 0
          ? `자동입금확인 ${successCount.toLocaleString("ko-KR")}건 완료 / 실패 ${failedCount.toLocaleString("ko-KR")}건`
          : `자동입금확인 ${successCount.toLocaleString("ko-KR")}건 완료`
      );
    } else {
      setLastAutoSyncMessage("자동입금확인 후보 없음");
    }

    return successCount;
  };

  const forceLoadServerDeposits = async () => {
    setServerDepositLoading(true);

    try {
      const response = await fetch("/api/admin-v2/deposits", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        showAdminToast("입금내역 조회 실패\n\n" + (result?.message || "알 수 없는 오류"), "error");
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
      setLastAutoSyncMessage("입금내역 새로고침 완료");
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
      const response = await fetch("/api/bankda/sync-and-auto-match", {
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

      await forceLoadServerDeposits();

      await runAutoMatchAfterBankdaSync();
      await forceLoadServerDeposits();
      await runAutoMatchPreview();
      setLastAutoSyncMessage("입금내역 자동조회 완료");
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
    const timer = window.setInterval(() => {
      void runSilentBankdaAutoSync();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  const depositsForDisplay = serverDeposits.length > 0 ? serverDeposits : deposits;

  const filteredDeposits = useMemo(() => {
    const word = keyword.trim().toLowerCase();
    const numberKeyword = digitsOnly(keyword);

    return [...depositsForDisplay]
      .filter((deposit) => {
        const date = parseDepositDate(deposit);
        const dateKey = toDateKey(date);
        const amountText = String(deposit.amount || "");

        const matchDate =
          (!startDate || dateKey >= startDate) &&
          (!endDate || dateKey <= endDate);

        const textTarget = [
          deposit.depositor_name,
          deposit.amount,
          getBankName(deposit),
          getAccountInfo(deposit),
          getLinkedOrderText(deposit),
          getMemoText(deposit),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchKeyword =
          !word ||
          textTarget.includes(word) ||
          (!!numberKeyword && digitsOnly(amountText).includes(numberKeyword));

        return matchDate && matchKeyword;
      })
      .sort((a, b) => {
        const aDate = parseDepositDate(a)?.getTime() || 0;
        const bDate = parseDepositDate(b)?.getTime() || 0;
        return bDate - aDate;
      });
  }, [depositsForDisplay, keyword, startDate, endDate]);

  const visibleIdSet = useMemo(
    () => new Set(filteredDeposits.map((deposit) => deposit.id)),
    [filteredDeposits]
  );

  const selectedDeposits = useMemo(() => {
    return filteredDeposits.filter((deposit) => selectedDepositIds.includes(deposit.id));
  }, [filteredDeposits, selectedDepositIds]);

  const periodTotalAmount = useMemo(
    () => filteredDeposits.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0),
    [filteredDeposits]
  );

  const selectedTotalAmount = useMemo(
    () => selectedDeposits.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0),
    [selectedDeposits]
  );

  const todayTotalAmount = useMemo(() => {
    const today = getTodayKey(0);
    return depositsForDisplay
      .filter((deposit) => toDateKey(parseDepositDate(deposit)) === today)
      .reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
  }, [depositsForDisplay]);

  const isAllVisibleSelected =
    filteredDeposits.length > 0 &&
    filteredDeposits.every((deposit) => selectedDepositIds.includes(deposit.id));

  const toggleDeposit = (id: string | number) => {
    setSelectedDepositIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const toggleAllVisible = () => {
    setSelectedDepositIds((current) => {
      if (isAllVisibleSelected) {
        return current.filter((id) => !visibleIdSet.has(id as any));
      }

      return Array.from(new Set([...current, ...filteredDeposits.map((deposit) => deposit.id)]));
    });
  };

  const setQuickRange = (type: "today" | "yesterday" | "7days" | "30days") => {
    if (type === "today") {
      const today = getTodayKey(0);
      setStartDate(today);
      setEndDate(today);
      return;
    }

    if (type === "yesterday") {
      const yesterday = getTodayKey(-1);
      setStartDate(yesterday);
      setEndDate(yesterday);
      return;
    }

    if (type === "7days") {
      setStartDate(getTodayKey(-6));
      setEndDate(getTodayKey(0));
      return;
    }

    setStartDate(getTodayKey(-29));
    setEndDate(getTodayKey(0));
  };

  const resetFilters = () => {
    setKeyword("");
    setStartDate("");
    setEndDate("");
    setSelectedDepositIds([]);
  };

  return (
    <section className={sectionClassName}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-end gap-3">
            <h1 className="text-[30px] font-black tracking-[-0.04em] text-slate-950">입금확인</h1>
            <div className="pb-1 text-[14px] font-bold text-slate-500">입금내역을 주문과 비교해 자동·수동 입금확인을 처리합니다.</div>
          </div>
          <div className="mt-1 text-[12px] font-bold text-slate-400">
            {lastAutoSyncLabel ? `최근 새로고침 ${lastAutoSyncLabel}` : lastAutoSyncMessage}
          </div>
        </div>

        <button
          type="button"
          onClick={runBankdaSync}
          disabled={syncing || autoSyncLoading || serverDepositLoading}
          className="h-12 rounded-2xl bg-blue-600 px-6 text-[15px] font-black text-white shadow-sm active:scale-[0.98] disabled:bg-neutral-300"
        >
          {syncing || autoSyncLoading || serverDepositLoading ? "조회중..." : "입금내역 새로고침"}
        </button>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        <SummaryCard label="기간 총 입금액" value={money(periodTotalAmount)} sub={`${filteredDeposits.length.toLocaleString("ko-KR")}건`} />
        <SummaryCard label="선택 입금액" value={money(selectedTotalAmount)} sub={`선택 ${selectedDeposits.length.toLocaleString("ko-KR")}건`} />
        <SummaryCard label="오늘 입금액" value={money(todayTotalAmount)} sub={todayLabel} />
        <SummaryCard
          label="전체 저장건수"
          value={`${depositsForDisplay.length.toLocaleString("ko-KR")}건`}
          sub={previewResult?.summary?.auto_match_preview_count ? `자동확인 후보 ${previewResult.summary.auto_match_preview_count}건` : "조회 전용"}
        />
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_180px_180px_auto_auto] xl:items-end">
          <label className="grid gap-2">
            <span className="text-[12px] font-black text-slate-500">검색</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="입금자명 / 금액 / 메모 검색"
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-950"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-[12px] font-black text-slate-500">시작일</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-neutral-950"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-[12px] font-black text-slate-500">종료일</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-neutral-950"
            />
          </label>

          <button
            type="button"
            onClick={forceLoadServerDeposits}
            disabled={serverDepositLoading}
            className="h-11 rounded-xl bg-slate-950 px-6 text-sm font-black text-white disabled:bg-neutral-300"
          >
            조회
          </button>

          <button
            type="button"
            onClick={resetFilters}
            className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"
          >
            초기화
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setQuickRange("today")} className="h-9 rounded-xl bg-slate-950 px-4 text-[13px] font-black text-white">오늘</button>
          <button type="button" onClick={() => setQuickRange("yesterday")} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-700">어제</button>
          <button type="button" onClick={() => setQuickRange("7days")} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-700">7일</button>
          <button type="button" onClick={() => setQuickRange("30days")} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-700">30일</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isAllVisibleSelected}
              onChange={toggleAllVisible}
              className="h-4 w-4 accent-neutral-950"
            />
            <span className="text-sm font-black">전체선택</span>
          </label>

          <div className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">
            선택 {selectedDeposits.length.toLocaleString("ko-KR")}건
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-neutral-800">
            선택 합계 {money(selectedTotalAmount)}
          </div>

          <button
            type="button"
            onClick={() => setSelectedDepositIds([])}
            disabled={selectedDeposits.length === 0}
            className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 disabled:opacity-40"
          >
            선택 해제
          </button>
        </div>

        <div className="grid grid-cols-[44px_1.5fr_1.1fr_0.9fr_1.1fr_1fr_0.7fr] border-b border-slate-200 bg-slate-50 px-5 py-3 text-[13px] font-black text-slate-700">
          <div />
          <div>입금일시</div>
          <div>입금자명</div>
          <div className="text-right">입금금액</div>
          <div className="text-center">연결 주문</div>
          <div className="text-center">기록 메모</div>
          <div className="text-center">상세</div>
        </div>

        {filteredDeposits.length === 0 ? (
          <div className="px-5 py-14 text-center text-sm font-black text-slate-400">
            표시할 입금내역이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredDeposits.map((deposit) => (
              <div
                key={deposit.id}
                className="grid grid-cols-[44px_1.5fr_1.1fr_0.9fr_1.1fr_1fr_0.7fr] px-5 py-3 text-sm hover:bg-slate-50"
              >
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedDepositIds.includes(deposit.id)}
                    onChange={() => toggleDeposit(deposit.id)}
                    className="h-4 w-4 accent-neutral-950"
                  />
                </div>

                <div className="font-bold text-slate-700">{formatDepositDateTime(deposit)}</div>
                <div className="font-black text-slate-950">{deposit.depositor_name || "-"}</div>
                <div className="text-right font-black text-slate-950">+{money(deposit.amount)}</div>
                <div className="text-center font-bold text-slate-500">{getLinkedOrderText(deposit)}</div>
                <div className="text-center font-bold text-slate-500">{getMemoText(deposit)}</div>
                <div className="text-center">
                  <button
                    type="button"
                    className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"
                  >
                    보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 text-[13px] font-bold text-slate-500">
          <div>
            표시 {filteredDeposits.length.toLocaleString("ko-KR")}건 / 전체 {depositsForDisplay.length.toLocaleString("ko-KR")}건
          </div>
          <div>
            기간 합계 {money(periodTotalAmount)} · 선택 합계 {money(selectedTotalAmount)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[12px] font-bold text-slate-500">
        자동입금확인 기준은 기존 그대로 유지됩니다. 닉네임 완전일치 + 금액 완전일치 + 1:1 단일 후보일 때만 처리됩니다.
      </div>
    </section>
  );
}
