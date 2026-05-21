// components/admin-v2/payment/ManualPaymentMatchDrawer.tsx
// 목적: 주문관리에서 미입금 주문의 입금내역을 직접 선택해 수동매칭하는 팝업
// UX 기준: 상단 닫기/X 없음. 하단 [취소] [수동매칭]만 사용.

"use client";

import { useEffect, useMemo, useState } from "react";
import type { DepositRow, OrderGroup } from "@/lib/admin-v2/types";

type Props = {
  group?: OrderGroup | null;
  orderGroup?: OrderGroup | null;
  deposits?: DepositRow[];
  onClose: () => void;
  onMatched?: () => Promise<void> | void;
  onConfirm?: (group: OrderGroup, deposit: DepositRow) => Promise<void> | void;
};

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

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
  if (Number(group.totalAmount || 0) > 0) {
    return Number(group.totalAmount || 0);
  }

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
  return group.rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);
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

  if (!status || status === "미확인" || status === "미매칭") {
    return false;
  }

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

  if (!parsedDate) {
    return timeText || raw || "-";
  }

  const dateText = `${parsedDate.getMonth() + 1}월 ${parsedDate.getDate()}일(${getKoreanWeekday(parsedDate)})`;

  return `${dateText} ${timeText || "-"}`;
}

export default function ManualPaymentMatchDrawer(props: Props) {
  const group = props.group || props.orderGroup || null;
  const [serverDeposits, setServerDeposits] = useState<DepositRow[]>(props.deposits || []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selectedDepositId, setSelectedDepositId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const first = group?.first || null;
  const nickname = first?.youtube_nickname || "";
  const customerName = first?.customer_name || "";
  const phone = first?.customer_phone || first?.phone || "";
  const expectedAmount = group ? getOrderAmount(group) : 0;

  useEffect(() => {
    setServerDeposits(props.deposits || []);
  }, [props.deposits]);

  useEffect(() => {
    if (group) {
      setKeyword(nickname || customerName || "");
      void loadDeposits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.groupId]);

  const loadDeposits = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin-v2/deposits", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        alert("입금내역 불러오기 실패\n\n" + (result?.message || "알 수 없는 오류"));
        return;
      }

      setServerDeposits((result.deposits || []) as DepositRow[]);
    } finally {
      setLoading(false);
    }
  };

  const depositsForDisplay = useMemo(() => {
    const word = normalizeText(keyword);
    const nicknameNorm = normalizeText(nickname);
    const customerNorm = normalizeText(customerName);

    return (serverDeposits || [])
      .filter((deposit) => {
        if (isDepositConfirmed(deposit)) return false;

        if (showAll) return true;

        const depositName = normalizeText(deposit.depositor_name);
        const amountText = digitsOnly(deposit.amount);
        const amountMatch = Number(deposit.amount || 0) === expectedAmount;
        const nameMatch =
          getNameScore(deposit.depositor_name, nickname, customerName) > 0;

        if (!word) {
          return amountMatch || nameMatch;
        }

        return (
          amountMatch ||
          nameMatch ||
          depositName.includes(word) ||
          word.includes(depositName) ||
          amountText.includes(digitsOnly(keyword)) ||
          (nicknameNorm && depositName.includes(nicknameNorm)) ||
          (customerNorm && depositName.includes(customerNorm))
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

  const selectedDeposit = useMemo(() => {
    return serverDeposits.find((deposit) => Number(deposit.id) === Number(selectedDepositId)) || null;
  }, [serverDeposits, selectedDepositId]);

  if (!group || !first) {
    return null;
  }

  const confirmManualMatch = async () => {
    if (!selectedDeposit) {
      alert("매칭할 입금내역을 선택해주세요.");
      return;
    }

    const ok = confirm(
      [
        "선택한 입금내역으로 수동매칭할까요?",
        "",
        `주문고객: ${nickname || customerName || "-"}`,
        `주문금액: ${money(expectedAmount)}`,
        "",
        `입금자명: ${selectedDeposit.depositor_name || "-"}`,
        `입금금액: ${money(selectedDeposit.amount)}`,
      ].join("\n")
    );

    if (!ok) return;

    setSaving(true);

    try {
      const response = await fetch("/api/admin-v2/manual-payment-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderGroupId: group.groupId,
          orderIds: getOrderIds(group),
          depositId: selectedDeposit.id,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        alert("수동매칭 실패\n\n" + (result?.message || "알 수 없는 오류"));
        return;
      }

      alert("수동매칭 완료\n\n주문 상태가 입금확인으로 변경되었습니다.");

      await props.onMatched?.();

      props.onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/35">
      <aside className="ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <header className="shrink-0 border-b border-neutral-200 p-5">
          <div className="text-[12px] font-black tracking-widest text-neutral-400">
            MANUAL PAYMENT MATCH
          </div>

          <h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">
            수동 입금매칭
          </h2>

          <div className="mt-4 grid gap-2 rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-700 md:grid-cols-2">
            <div>
              주문번호: <span className="font-black text-neutral-950">{group.groupId}</span>
            </div>
            <div>
              닉네임: <span className="font-black text-neutral-950">{nickname || "-"}</span>
            </div>
            <div>
              이름: <span className="font-black text-neutral-950">{customerName || "-"}</span>
            </div>
            <div>
              전화번호: <span className="font-black text-neutral-950">{phone || "-"}</span>
            </div>
            <div>
              입금예정금액: <span className="font-black text-neutral-950">{money(expectedAmount)}</span>
            </div>
            <div>
              상품수량: <span className="font-black text-neutral-950">{group.totalQty || group.rows.length}개</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_92px_92px] gap-2">
            <input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setShowAll(false);
              }}
              placeholder="입금자명 / 닉네임 / 이름 / 금액 검색"
              className="h-12 rounded-xl border border-neutral-200 px-4 text-base font-black outline-none focus:border-neutral-950"
            />

            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setShowAll(true);
              }}
              className="h-12 rounded-xl bg-neutral-950 text-sm font-black text-white active:scale-[0.98]"
            >
              전체보기
            </button>

            <button
              type="button"
              onClick={loadDeposits}
              disabled={loading}
              className="h-12 rounded-xl bg-blue-600 text-sm font-black text-white active:scale-[0.98] disabled:bg-neutral-300"
            >
              {loading ? "로딩중" : "다시불러오기"}
            </button>
          </div>

          <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-black leading-relaxed text-amber-800">
            수동매칭은 돈 관련 작업입니다. 입금자명과 금액을 반드시 확인하세요.
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-black text-neutral-700">
              입금내역 후보 {depositsForDisplay.length.toLocaleString()}건
            </div>
            <div className="text-xs font-bold text-neutral-400">
              저장된 전체 입금내역 {serverDeposits.length.toLocaleString()}건
            </div>
          </div>

          {depositsForDisplay.length === 0 ? (
            <div className="rounded-2xl bg-neutral-50 px-4 py-16 text-center text-base font-black text-neutral-500">
              표시할 미확인 입금내역이 없습니다.
              <br />
              검색어를 지우거나 전체보기를 눌러주세요.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-neutral-200">
              {depositsForDisplay.map((deposit) => {
                const selected = Number(selectedDepositId) === Number(deposit.id);
                const amountMatch = Number(deposit.amount || 0) === expectedAmount;
                const nameScore = getNameScore(deposit.depositor_name, nickname, customerName);

                let tag = "확인필요";

                if (amountMatch && nameScore >= 90) tag = "추천";
                else if (amountMatch && nameScore > 0) tag = "이름유사";
                else if (amountMatch) tag = "금액일치";
                else if (nameScore > 0) tag = "이름유사";

                return (
                  <button
                    key={deposit.id}
                    type="button"
                    onClick={() => setSelectedDepositId(Number(deposit.id))}
                    className={[
                      "grid w-full grid-cols-[38px_1fr_120px_100px_90px] items-center gap-2 border-b border-neutral-100 px-4 py-3 text-left transition active:scale-[0.995]",
                      selected ? "bg-blue-50" : "bg-white hover:bg-neutral-50",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "flex h-6 w-6 items-center justify-center rounded-md border text-xs font-black",
                        selected ? "border-blue-600 bg-blue-600 text-white" : "border-neutral-300 text-transparent",
                      ].join(" ")}
                    >
                      ✓
                    </div>

                    <div>
                      <div className="text-sm font-black text-neutral-950">
                        {deposit.depositor_name || "-"}
                      </div>
                      <div className="mt-0.5 text-xs font-bold text-neutral-400">
                        입금일시 {getDepositTimeLabel(deposit.deposited_time, deposit.created_at)}
                      </div>
                    </div>

                    <div className="text-right text-sm font-black text-neutral-950">
                      {money(deposit.amount)}
                    </div>

                    <div
                      className={[
                        "rounded-full px-2 py-1 text-center text-xs font-black",
                        tag === "추천"
                          ? "bg-blue-100 text-blue-700"
                          : tag === "금액일치"
                            ? "bg-green-100 text-green-700"
                            : tag === "이름유사"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-neutral-100 text-neutral-500",
                      ].join(" ")}
                    >
                      {tag}
                    </div>

                    <div className="text-right text-xs font-black text-neutral-400">
                      {deposit.match_status || "미확인"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-neutral-200 bg-white p-5">
          <button
            type="button"
            onClick={props.onClose}
            disabled={saving}
            className="h-13 rounded-xl border border-neutral-300 bg-white text-base font-black text-neutral-700 active:scale-[0.98] disabled:opacity-50"
          >
            취소
          </button>

          <button
            type="button"
            onClick={confirmManualMatch}
            disabled={saving || !selectedDeposit}
            className="h-13 rounded-xl bg-neutral-950 text-base font-black text-white active:scale-[0.98] disabled:bg-neutral-300"
          >
            {saving ? "처리중..." : "수동매칭"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
