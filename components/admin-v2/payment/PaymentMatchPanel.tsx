// components/admin-v2/payment/PaymentMatchPanel.tsx
// 새 파일 생성
// 목적: 입금매칭 메뉴 전체 화면

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DepositRow, OrderGroup } from "@/lib/admin-v2/types";
import { formatDateLabel, money } from "@/lib/admin-v2/formatters";
import { buildItemSummary, isBankPaid, isBankUnpaid, orderBaseAmount, shortOrderCode } from "@/lib/admin-v2/orderHelpers";
import PaymentMatchTopActions from "@/components/admin-v2/payment/parts/PaymentMatchTopActions";
import PaymentMatchSyncStatus from "@/components/admin-v2/payment/parts/PaymentMatchSyncStatus";
import AutoMatchPreviewBox from "@/components/admin-v2/payment/parts/AutoMatchPreviewBox";
import PaymentOrderRow from "@/components/admin-v2/payment/parts/PaymentOrderRow";
import DepositListTable from "@/components/admin-v2/payment/parts/DepositListTable";
import PaymentMatchToolbar from "@/components/admin-v2/payment/parts/PaymentMatchToolbar";

type Props = {
  deposits: DepositRow[];
  orderGroups: OrderGroup[];
  onOpenManualMatch: (group: OrderGroup) => void;
  onSyncBankdaDeposits: () => Promise<void> | void;
};

type AutoMatchPreviewCandidate = {
  order_id?: string;
  order_group_id?: string;
  order_nickname?: string;
  order_amount?: number;
  order_status_text?: string;
  deposit_id?: string;
  deposit_depositor?: string;
  deposit_amount?: number;
  deposit_time_text?: string;
  reason?: string;
};

type AutoMatchPreviewItem = {
  type?: "order" | "deposit";
  id?: string;
  name?: string;
  amount?: number;
  reason?: string;
};

type AutoMatchPreviewResult = {
  ok: boolean;
  mode?: string;
  message?: string;
  rule?: string;
  summary?: {
    checked_orders?: number;
    checked_deposits?: number;
    eligible_unpaid_orders?: number;
    eligible_unmatched_deposits?: number;
    auto_match_preview_count?: number;
    ambiguous_count?: number;
    excluded_count?: number;
  };
  candidates?: AutoMatchPreviewCandidate[];
  ambiguous?: AutoMatchPreviewItem[];
  excluded?: AutoMatchPreviewItem[];
};

const normalizeText = (value: unknown) => String(value ?? "").replace(/[\\s\-_.]/g, "").toLowerCase();

const isDepositConfirmed = (deposit: DepositRow) => {
  const status = String(deposit.match_status || "").trim();

  if (!status || status === "미확인" || status === "미매칭") {
    return false;
  }

  const confirmedStatuses = [
    "자동입금확인",
    "수동입금확인",
    "입금확인",
    "매칭완료",
    "처리완료",
    "완료",
  ];

  return Boolean(deposit.confirmed_at) || confirmedStatuses.some((value) => status === value);
};

function getCandidateCount(group: OrderGroup, deposits: DepositRow[]) {
  const nickname = normalizeText(group.first.youtube_nickname);
  const name = normalizeText(group.first.customer_name);
  const amount = orderBaseAmount(group.first);

  return deposits.filter((deposit) => {
    if (isDepositConfirmed(deposit)) return false;
    const depositor = normalizeText(deposit.depositor_name);
    const amountMatch = Number(deposit.amount || 0) === amount;
    const nameMatch = Boolean(nickname && depositor.includes(nickname)) || Boolean(name && depositor.includes(name));
    return amountMatch || nameMatch;
  }).length;
}

const BANKDA_AUTO_SYNC_MIN_GAP_MS = 5 * 60 * 1000;
const BANKDA_MANUAL_SYNC_MIN_GAP_MS = 10 * 1000;

export default function PaymentMatchPanel({ deposits, orderGroups, onOpenManualMatch, onSyncBankdaDeposits }: Props) {
  const [serverDeposits, setServerDeposits] = useState<DepositRow[]>(deposits || []);
  const [serverDepositLoading, setServerDepositLoading] = useState(false);

  const forceLoadServerDeposits = async () => {
    setServerDepositLoading(true);

    try {
      const response = await fetch("/api/admin-v2/deposits", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        alert("입금내역 화면 조회 실패\n\n" + (result?.message || "알 수 없는 오류"));
        return;
      }

      setServerDeposits((result.deposits || []) as DepositRow[]);
    } finally {
      setServerDepositLoading(false);
    }
  };

  useEffect(() => {
    setServerDeposits(deposits || []);
  }, [deposits]);

  useEffect(() => {
    void forceLoadServerDeposits();
  }, []);

  const depositsForDisplay = serverDeposits.length > 0 ? serverDeposits : deposits;

  const [keyword, setKeyword] = useState("");
  const [view, setView] = useState<"unmatched" | "paid" | "deposits" | "all">("unmatched");
  const [syncing, setSyncing] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<AutoMatchPreviewResult | null>(null);
  const [autoRunLoading, setAutoRunLoading] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoSyncLoading, setAutoSyncLoading] = useState(false);
  const [lastAutoSyncLabel, setLastAutoSyncLabel] = useState("");
  const [lastAutoSyncMessage, setLastAutoSyncMessage] = useState("자동조회 대기중");
  const autoSyncInFlightRef = useRef(false);
  const lastBankdaSyncAtRef = useRef(0);

  const runBankdaSync = async () => {
    const now = Date.now();
    const gap = now - lastBankdaSyncAtRef.current;

    if (syncing || autoSyncInFlightRef.current) {
      setLastAutoSyncMessage("이미 뱅크다 조회가 진행중입니다.");
      return;
    }

    if (lastBankdaSyncAtRef.current > 0 && gap < BANKDA_MANUAL_SYNC_MIN_GAP_MS) {
      setLastAutoSyncMessage("방금 조회했습니다. 잠시 후 다시 눌러주세요.");
      return;
    }

    lastBankdaSyncAtRef.current = now;
    setSyncing(true);

    try {
      await onSyncBankdaDeposits();
      await forceLoadServerDeposits();
      setView("deposits");
    } finally {
      setSyncing(false);
    }
  };

  const runAutoMatchPreview = async () => {
    setPreviewLoading(true);

    try {
      const response = await fetch("/api/admin-v2/auto-payment-match/preview", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null) as AutoMatchPreviewResult | null;

      if (!response.ok || !result?.ok) {
        alert("자동매칭 미리보기 실패\n\n" + (result?.message || "알 수 없는 오류"));
        return;
      }

      setPreviewResult(result);
    } finally {
      setPreviewLoading(false);
    }
  };

  const runAutoMatchExecute = async () => {
    const candidateCount = previewResult?.summary?.auto_match_preview_count ?? 0;

    if (candidateCount <= 0) {
      alert("자동매칭 가능한 후보가 없습니다.");
      return;
    }

    const confirmed = window.confirm(
      `자동매칭 후보 ${candidateCount}건을 실제 입금확인 처리합니다.\n\n닉네임 완전일치 + 금액 완전일치 + 1:1 단일 후보만 처리됩니다.\n진행할까요?`
    );

    if (!confirmed) return;

    setAutoRunLoading(true);

    try {
      const response = await fetch("/api/admin-v2/auto-payment-match/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          confirm: "RUN_AUTO_MATCH",
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        alert("자동매칭 실행 실패\n\n" + (result?.message || "알 수 없는 오류"));
        return;
      }

      alert(
        `자동매칭 실행 완료\n\n성공: ${result.summary?.success_count ?? 0}건\n실패: ${result.summary?.failed_count ?? 0}건`
      );

      await forceLoadServerDeposits();
      await runAutoMatchPreview();
    } finally {
      setAutoRunLoading(false);
    }
  };

  const runSilentBankdaAutoSync = async () => {
    if (autoSyncInFlightRef.current) return;

    const now = Date.now();
    const gap = now - lastBankdaSyncAtRef.current;

    if (lastBankdaSyncAtRef.current > 0 && gap < BANKDA_AUTO_SYNC_MIN_GAP_MS) {
      const remainSeconds = Math.ceil((BANKDA_AUTO_SYNC_MIN_GAP_MS - gap) / 1000);
      setLastAutoSyncMessage(`뱅크다 5분 제한 대기중 · 약 ${remainSeconds}초 후 다시 조회`);
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
        setLastAutoSyncMessage(result?.message || "자동조회 실패");
        return;
      }

      const fetched = Number(result.rawCount ?? result.fetchedCount ?? 0);
      const inserted = Number(result.insertedCount ?? 0);
      const skipped = Number(result.skippedCount ?? 0);
      const autoMatched = Number(result.autoMatchedCount ?? 0);
      const bankdaDescription = String(result.bankdaDescription || "").trim();

      if (bankdaDescription.includes("5분") || bankdaDescription.includes("경과")) {
        setLastAutoSyncMessage("뱅크다 5분 제한 대기중");
      } else {
        setLastAutoSyncMessage(
          `조회 ${fetched}건 · 신규 ${inserted}건 · 중복 ${skipped}건 · 자동후보검사 ${autoMatched}건`
        );
      }

      await forceLoadServerDeposits();
      await runAutoMatchPreview();
    } catch (error) {
      setLastAutoSyncMessage(error instanceof Error ? error.message : "자동조회 오류");
    } finally {
      autoSyncInFlightRef.current = false;
      setAutoSyncLoading(false);
    }
  };

  useEffect(() => {
    if (!autoSyncEnabled) return;

    void runSilentBankdaAutoSync();

    const timer = window.setInterval(() => {
      void runSilentBankdaAutoSync();
    }, 310000);

    return () => window.clearInterval(timer);
  }, [autoSyncEnabled]);

  const summary = useMemo(() => ({
    unpaid: orderGroups.filter((group) => isBankUnpaid(group.first)).length,
    paid: orderGroups.filter((group) => isBankPaid(group.first)).length,
    unconfirmedDeposits: depositsForDisplay.filter((deposit) => !isDepositConfirmed(deposit)).length,
    confirmedDeposits: depositsForDisplay.filter((deposit) => isDepositConfirmed(deposit)).length,
  }), [depositsForDisplay, orderGroups]);

  const filteredGroups = useMemo(() => {
    const word = normalizeText(keyword);

    return orderGroups
      .filter((group) => {
        if (view === "unmatched") return isBankUnpaid(group.first);
        if (view === "paid") return isBankPaid(group.first);
        if (view === "all") return true;
        return false;
      })
      .filter((group) => {
        if (!word) return true;
        const target = [
          group.groupId,
          group.first.order_lookup_code,
          group.first.youtube_nickname,
          group.first.customer_name,
          group.first.customer_phone,
          group.first.phone,
          buildItemSummary(group),
          String(orderBaseAmount(group.first)),
        ].map(normalizeText).join(" ");
        return target.includes(word);
      });
  }, [keyword, orderGroups, view]);

  const filteredDeposits = useMemo(() => {
    const word = normalizeText(keyword);

    return deposits
      .filter(() => view === "deposits")
      .filter((deposit) => {
        if (!word) return true;
        const target = [deposit.depositor_name, deposit.amount, deposit.match_status].map(normalizeText).join(" ");
        return target.includes(word);
      })
      .sort((a, b) => {
        const aTime = new Date(a.deposited_time || a.created_at || "").getTime() || 0;
        const bTime = new Date(b.deposited_time || b.created_at || "").getTime() || 0;
        return bTime - aTime;
      });
  }, [depositsForDisplay, keyword, view]);

  return (
    <div className="grid gap-3">
      <section className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[17px] font-black">입금매칭</div>
            <div className="mt-1 text-[12px] font-bold text-neutral-500">
              뱅크다에서 실제 입금내역을 가져온 뒤, 자동매칭이 안 된 건을 주문과 직접 연결합니다.
            </div>
          </div>

          <PaymentMatchTopActions
              previewLoading={previewLoading}
              syncing={syncing}
              autoSyncLoading={autoSyncLoading}
              onPreview={runAutoMatchPreview}
              onSync={runBankdaSync}
            />
        </div>
        <PaymentMatchSyncStatus
          autoSyncEnabled={autoSyncEnabled}
          autoSyncLoading={autoSyncLoading}
          lastAutoSyncLabel={lastAutoSyncLabel}
          lastAutoSyncMessage={lastAutoSyncMessage}
          serverDepositCount={depositsForDisplay.length}
          onToggleAutoSync={() => setAutoSyncEnabled((value) => !value)}
          onReloadList={forceLoadServerDeposits}
          serverDepositLoading={serverDepositLoading}
        />

        {previewResult && (
          <AutoMatchPreviewBox
            previewResult={previewResult}
            autoRunLoading={autoRunLoading}
            onRun={runAutoMatchExecute}
          />
        )}

        <div className="grid gap-2 md:grid-cols-4">
          <SummaryTile label="미입금 주문" value={`${summary.unpaid}건`} strong />
          <SummaryTile label="입금확인 주문" value={`${summary.paid}건`} />
          <SummaryTile label="미확인 입금내역" value={`${summary.unconfirmedDeposits}건`} strong />
          <SummaryTile label="처리완료 입금내역" value={`${summary.confirmedDeposits}건`} />
        </div>
      </section>

      <PaymentMatchToolbar
        view={view}
        keyword={keyword}
        onChangeView={setView}
        onChangeKeyword={setKeyword}
      />

      {view === "deposits" ? (
        <DepositListTable deposits={filteredDeposits} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="hidden grid-cols-[86px_130px_130px_minmax(240px,1fr)_110px_100px_110px] bg-neutral-950 px-3 py-2 text-[12px] font-black text-white lg:grid">
            <div>주문번호</div>
            <div>작성일</div>
            <div>고객</div>
            <div>주문내역</div>
            <div className="text-right">입금예정</div>
            <div className="text-center">자동후보</div>
            <div className="text-center">입금확인</div>
          </div>

          {filteredGroups.length === 0 ? (
            <EmptyBox text="표시할 주문이 없습니다." />
          ) : (
            <div className="divide-y divide-neutral-100">
              {filteredGroups.map((group) => {
                const candidateCount = getCandidateCount(group, deposits);
                const unpaid = isBankUnpaid(group.first);

                return (
                  <PaymentOrderRow
                    key={group.groupId}
                    orderCode={shortOrderCode(group)}
                    createdAtLabel={formatDateLabel(group.first.created_at)}
                    nickname={group.first.youtube_nickname || "-"}
                    customerName={group.first.customer_name || "-"}
                    itemSummary={buildItemSummary(group)}
                    expectedAmountText={money(orderBaseAmount(group.first))}
                    candidateCount={candidateCount}
                    unpaid={unpaid}
                    onOpenManualMatch={() => onOpenManualMatch(group)}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SummaryTile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${strong ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200 bg-neutral-50"}`}>
      <div className={`text-[12px] font-black ${strong ? "text-white/60" : "text-neutral-500"}`}>{label}</div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-3 py-2 text-[13px] font-black ${active ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-700"}`}>
      {children}
    </button>
  );
}

function EmptyBox({ text }: { text: string }) {
  return <div className="rounded-xl bg-neutral-50 p-6 text-center text-sm font-bold text-neutral-500">{text}</div>;
}
