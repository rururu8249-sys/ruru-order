"use client";

// [2026-10-21 입금 통합] 오른쪽 「입금」 창 맨 위 칩 두 개 — 같은 창 안에서 입금매칭(처리) ↔ 입금내역(조회)을 바꾼다.
//   화면 전환·표시만. 매칭 API·판정·뱅크다 동기화는 각 패널 그대로.
export type DepositDrawerMode = "match" | "ledger";

export default function AdminLiveDepositModeChips({ mode, unmatchedCount, onChange }: {
  mode: DepositDrawerMode;
  unmatchedCount: number;
  onChange: (mode: DepositDrawerMode) => void;
}) {
  const chip = (on: boolean) =>
    `h-9 rounded-full border px-3.5 text-[13px] font-semibold transition ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-surface-2"}`;
  return (
    <div className="sticky top-0 z-20 flex shrink-0 items-center gap-1.5 border-b border-line bg-surface px-3 py-2" aria-label="입금 화면 선택">
      <button type="button" aria-pressed={mode === "match"} onClick={() => onChange("match")} className={chip(mode === "match")}>
        입금매칭{unmatchedCount > 0 ? <span className="ml-1 tabular-nums">{unmatchedCount}</span> : null}
      </button>
      <button type="button" aria-pressed={mode === "ledger"} onClick={() => onChange("ledger")} className={chip(mode === "ledger")}>
        입금내역
      </button>
    </div>
  );
}
