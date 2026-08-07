"use client";

// [2026-07-25 사장님 지침] 상시 시스템 점검 카드 — 관리자 열 때마다 자동 점검(읽기 전용 API).
//   이상 없는 날도 초록으로 "이상 없음"을 항상 표시(조용하면 어색하다는 지침).
//   데이터 변경 없음 — /api/admin-v2/integrity-check GET만 호출.

import { useCallback, useEffect, useState } from "react";

const CHECK_LABELS: Array<[string, string]> = [
  ["check1_auto_paid_no_deposit", "자동입금확인인데 입금없음"],
  ["check2_group_multi_deposit", "주문그룹 중복입금"],
  ["check3_duplicate_deposit", "중복 입금내역"],
  ["check4_cancel_not_restored", "취소인데 재고 미복구"],
  ["check5_stock_ledger_mismatch", "재고 장부 불일치"],
  ["check6_amount_formula", "금액 공식 불일치"],
  ["check7_point_mismatch", "포인트 잔액≠이력"],
  ["check8_paid_no_timestamp", "입금확인 시각 누락"],
  ["check9_date_inverted_match", "날짜 역전 매칭(오매칭 의심)"],
];

export default function SystemAuditCard({ onOpenDetail }: { onOpenDetail?: () => void }) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin-v2/integrity-check", { method: "GET", cache: "no-store" });
      setResult(await res.json());
    } catch (e: any) {
      setResult({ ok: false, message: e?.message || "점검 실패" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // [2026-07-26] 카드는 "최근 7일 + 현재 상태" 기준(recent_summary) — 5~6월 옛 기록으로
  //   상시 빨간불이 켜지지 않게. 과거 전체는 [자세히 보기] 팝업의 "전체 보기"에서 확인.
  const summary = result?.recent_summary || result?.summary || {};
  const bad = CHECK_LABELS
    .map(([key, label]) => ({ key, label, count: Number(summary[key] || 0) }))
    .filter((c) => c.count > 0);
  const failed = result != null && result.ok === false;
  const allOk = result != null && !failed && bad.length === 0;
  const time = result?.generated_at
    ? new Date(result.generated_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "";

  return (
    <div className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-black text-ink">🛡️ 시스템 점검</span>
        <span className="flex items-center gap-1.5">
          {time ? <span className="text-[10px] font-bold text-ink-mute">{time} 점검</span> : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title="다시 점검"
            className="rounded-full border border-line bg-surface px-1.5 py-0.5 text-[10px] font-black text-ink-soft disabled:opacity-50"
          >
            ↻
          </button>
        </span>
      </div>

      {loading && !result ? (
        <div className="py-2 text-center text-[11px] font-bold text-ink-mute">점검 중…</div>
      ) : failed ? (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
          ⚠️ 점검 실행 실패 — ↻ 눌러 다시 시도하세요.
        </div>
      ) : allOk ? (
        <div className="rounded-xl bg-emerald-50 px-3 py-2">
          <div className="text-[13px] font-black text-emerald-700">✅ 이상 없음</div>
          <div className="mt-0.5 text-[10px] font-bold text-emerald-700/70">재고·금액·포인트·입금 {CHECK_LABELS.length}개 항목 통과 · 최근 7일 기준</div>
        </div>
      ) : result ? (
        <div className="rounded-xl bg-red-50 px-3 py-2">
          <div className="text-[13px] font-black text-red-700">🚨 발견 {bad.reduce((s, c) => s + c.count, 0)}건</div>
          <ul className="mt-1 space-y-0.5">
            {bad.map((c) => (
              <li key={c.key} className="text-[11px] font-bold text-red-700/90">
                · {c.label} <b>{c.count}건</b>
              </li>
            ))}
          </ul>
          {onOpenDetail ? (
            <button
              type="button"
              onClick={onOpenDetail}
              className="mt-1.5 w-full rounded-lg border border-red-200 bg-white py-1 text-[11px] font-black text-red-700"
            >
              자세히 보기 →
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
