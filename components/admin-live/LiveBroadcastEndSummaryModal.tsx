"use client";

import MissionPayoutButton from "./MissionPayoutButton";

// [2026-09-08 4단계-B] 방송 종료 시점의 미션 결과(읽기 전용 스냅샷). 지급은 MissionPayoutButton → 기존 미션 API
export type LiveBroadcastEndMission = {
  title: string;
  goalType: "count" | "amount";
  goal: number;
  current: number;
  pct: number;
  reward: number;
  achieved: boolean;
  /** 방송 종료와 함께 미션도 종료(mission_active=false) 처리됐는지 */
  ended: boolean;
};

export type LiveBroadcastEndSummary = {
  title: string;
  broadcastDateText: string;
  startTimeText: string;
  endTimeText: string;
  durationText: string;
  orderCount: number;
  activeOrderCount: number;
  canceledCount: number;
  paidCount: number;
  paidAmount: number;
  bankPaidCount: number;
  bankPaidAmount: number;
  cardPaidCount: number;
  cardPaidAmount: number;
  unpaidCount: number;
  unpaidAmount: number;
  buyerCount: number;
  existingMemberCount: number;
  newMemberCount: number;
  visitorText: string;
  memberBasisText: string;
  /** 이번 방송에 미션이 켜져 있었으면 그 결과. 없으면 undefined */
  mission?: LiveBroadcastEndMission;
};

type Props = {
  summary: LiveBroadcastEndSummary;
  onClose: () => void;
  onOpenSettlement: () => void;
};

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function count(value: number, suffix = "건") {
  return `${Number(value || 0).toLocaleString("ko-KR")}${suffix}`;
}

function StatCard({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "slate" | "blue" | "green" | "orange" | "violet";
}) {
  const toneClass =
    tone === "blue"
      ? "border-rose-line bg-rose-soft text-blue-900"
      : tone === "green"
        ? "border-line bg-ok-bg text-emerald-900"
        : tone === "orange"
          ? "border-line bg-warn-bg text-orange-900"
          : tone === "violet"
            ? "border-violet-100 bg-violet-50 text-violet-900"
            : "border-line bg-surface text-ink";

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <div className="text-[11px] font-black text-ink-soft">{label}</div>
      <div className="mt-1 text-[22px] font-black tracking-[-0.05em]">{value}</div>
      {sub ? <div className="mt-1 text-[11px] font-bold text-ink-soft">{sub}</div> : null}
    </div>
  );
}

export default function LiveBroadcastEndSummaryModal({ summary, onClose, onOpenSettlement }: Props) {
  const hasUnpaid = summary.unpaidCount > 0 || summary.unpaidAmount > 0;
  const hasCanceled = summary.canceledCount > 0;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-3 py-5">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/80 bg-surface p-5 shadow-2xl">
        <div className="border-b border-line-soft pb-4">
          <div className="text-xs font-black tracking-[0.2em] text-rose-deep">BROADCAST SUMMARY</div>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-ink">방송 종료 요약</h2>
          <p className="mt-2 text-sm font-bold text-ink-soft">
            방송 종료 시점 기준으로 오늘 먼저 확인할 주문·결제 현황만 크게 정리했습니다.
          </p>
        </div>

        <div className="mt-4 rounded-3xl border border-line bg-surface-2 p-4">
          <div className="grid gap-3 text-sm font-bold text-ink md:grid-cols-5">
            <div className="md:col-span-2">
              <div className="text-[11px] font-black text-ink-mute">방송명</div>
              <div className="mt-1 text-lg font-black text-ink">{summary.title}</div>
            </div>
            <div>
              <div className="text-[11px] font-black text-ink-mute">방송일</div>
              <div className="mt-1 font-black text-ink">{summary.broadcastDateText}</div>
            </div>
            <div>
              <div className="text-[11px] font-black text-ink-mute">방송시간</div>
              <div className="mt-1 font-black text-ink">
                {summary.startTimeText} ~ {summary.endTimeText}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-black text-ink-mute">총 방송시간</div>
              <div className="mt-1 font-black text-rose-deep">{summary.durationText}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-line bg-warn-bg px-4 py-3">
          <div className="text-sm font-black text-orange-900">지금 확인할 일</div>
          <div className="mt-2 grid gap-2 text-xs font-bold text-warn-tx md:grid-cols-3">
            <div className="rounded-2xl bg-surface-2 px-3 py-2">
              {hasUnpaid
                ? `아직 못 받은 금액 ${count(summary.unpaidCount)} / ${money(summary.unpaidAmount)} 확인 필요`
                : "아직 못 받은 금액 없음"}
            </div>
            <div className="rounded-2xl bg-surface-2 px-3 py-2">
              {hasCanceled ? `취소/환불 ${count(summary.canceledCount)} 참고` : "취소/환불 없음"}
            </div>
            <div className="rounded-2xl bg-surface-2 px-3 py-2">
              {summary.mission
                ? summary.mission.achieved
                  ? summary.mission.reward > 0
                    ? "🎯 미션 달성 — 아래에서 구매자 전원 지급"
                    : "🎯 미션 달성 — 선물 명단은 이벤트 › 미션 탭"
                  : `🎯 미션 미달성 (${summary.mission.pct}%) — 지급 없음`
                : "미션 없음"}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard label="결제완료 매출" value={money(summary.paidAmount)} sub={count(summary.paidCount)} tone="blue" />
          <StatCard label="아직 못 받은 금액" value={money(summary.unpaidAmount)} sub={count(summary.unpaidCount)} tone="orange" />
          <StatCard label="주문서 수" value={count(summary.orderCount)} sub={`취소 제외 ${count(summary.activeOrderCount)}`} tone="slate" />
          <StatCard label="구매고객 수" value={count(summary.buyerCount, "명")} sub="전화번호 기준" tone="violet" />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <StatCard label="입금확인(무통장)" value={money(summary.bankPaidAmount)} sub={count(summary.bankPaidCount)} tone="green" />
          <StatCard label="카드결제완료" value={money(summary.cardPaidAmount)} sub={count(summary.cardPaidCount)} tone="blue" />
          <StatCard label="취소/환불" value={count(summary.canceledCount)} sub="결제완료 매출 제외" />
          <StatCard label="기존회원" value={count(summary.existingMemberCount, "명")} sub={summary.memberBasisText} tone="green" />
          <StatCard label="신규회원" value={count(summary.newMemberCount, "명")} sub={summary.memberBasisText} tone="blue" />
        </div>

        {summary.mission ? (
          <div className={`mt-4 rounded-3xl border px-4 py-4 ${summary.mission.achieved ? "border-ok-tx/40 bg-ok-bg" : "border-line bg-surface-2"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black text-ink-mute">🎯 미션 게이지</div>
                <div className="mt-1 text-base font-black text-ink">
                  {summary.mission.title || "오늘의 미션"} ·{" "}
                  <span className={summary.mission.achieved ? "text-ok-tx" : "text-rose-deep"}>{summary.mission.achieved ? "달성!" : "미달성"}</span>
                </div>
                <div className="mt-1 text-xs font-bold text-ink-soft">
                  {Number(summary.mission.current).toLocaleString("ko-KR")}
                  {summary.mission.goalType === "amount" ? "원" : "개"} / 목표 {Number(summary.mission.goal).toLocaleString("ko-KR")}
                  {summary.mission.goalType === "amount" ? "원" : "개"} ({summary.mission.pct}%)
                  {!summary.mission.ended ? " · ⚠ 미션 종료 처리가 안 됐어요 — 이벤트 › 미션 탭에서 종료해 주세요" : ""}
                </div>
              </div>
              {summary.mission.achieved ? (
                summary.mission.reward > 0 ? (
                  <MissionPayoutButton reward={summary.mission.reward} />
                ) : (
                  <div className="text-xs font-bold text-ink-soft">포인트 보상 없음 · 선물 줄 명단은 이벤트 › 미션 탭</div>
                )
              ) : (
                <div className="text-xs font-bold text-ink-mute">목표에 못 미쳐 지급하지 않습니다</div>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-3xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold leading-5 text-ink-soft">
          이번 방송 사이트 방문자: <span className="text-ink">{summary.visitorText}</span>
          <span className="ml-2 text-ink-mute">· 자세한 명단은 왼쪽 「접속 기록 보기」</span>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-black text-ink hover:bg-surface-2"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onOpenSettlement}
            className="rounded-2xl bg-rose-deep px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-rose-deep"
          >
            정산통계에서 보기
          </button>
        </div>
      </div>
    </div>
  );
}

