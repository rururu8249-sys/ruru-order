"use client";

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
      ? "border-blue-100 bg-blue-50 text-blue-900"
      : tone === "green"
        ? "border-emerald-100 bg-emerald-50 text-emerald-900"
        : tone === "orange"
          ? "border-orange-100 bg-orange-50 text-orange-900"
          : tone === "violet"
            ? "border-violet-100 bg-violet-50 text-violet-900"
            : "border-slate-200 bg-white text-slate-950";

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <div className="text-[11px] font-black text-slate-500">{label}</div>
      <div className="mt-1 text-[22px] font-black tracking-[-0.05em]">{value}</div>
      {sub ? <div className="mt-1 text-[11px] font-bold text-slate-500">{sub}</div> : null}
    </div>
  );
}

export default function LiveBroadcastEndSummaryModal({ summary, onClose, onOpenSettlement }: Props) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-3 py-5">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-white/80 bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="text-xs font-black tracking-[0.2em] text-blue-600">BROADCAST SUMMARY</div>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-950">방송 종료 요약</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">방송 종료 시점 기준으로 주문·결제 현황을 한눈에 확인합니다.</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 text-sm font-bold text-slate-700 md:grid-cols-5">
            <div className="md:col-span-2">
              <div className="text-[11px] font-black text-slate-400">방송명</div>
              <div className="mt-1 text-lg font-black text-slate-950">{summary.title}</div>
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-400">방송일</div>
              <div className="mt-1 font-black text-slate-950">{summary.broadcastDateText}</div>
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-400">방송시간</div>
              <div className="mt-1 font-black text-slate-950">
                {summary.startTimeText} ~ {summary.endTimeText}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-400">총 방송시간</div>
              <div className="mt-1 font-black text-blue-700">{summary.durationText}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard label="결제완료 매출" value={money(summary.paidAmount)} sub={count(summary.paidCount)} tone="blue" />
          <StatCard label="아직 못 받은 금액" value={money(summary.unpaidAmount)} sub={count(summary.unpaidCount)} tone="orange" />
          <StatCard label="무통장 결제완료" value={money(summary.bankPaidAmount)} sub={count(summary.bankPaidCount)} tone="green" />
          <StatCard label="카드 결제완료" value={money(summary.cardPaidAmount)} sub={count(summary.cardPaidCount)} tone="blue" />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <StatCard label="주문서 수" value={count(summary.orderCount)} sub={`취소 제외 ${count(summary.activeOrderCount)}`} />
          <StatCard label="취소/환불" value={count(summary.canceledCount)} sub="결제완료 매출 제외" />
          <StatCard label="구매고객 수" value={count(summary.buyerCount, "명")} sub="전화번호 기준" tone="violet" />
          <StatCard label="기존회원" value={count(summary.existingMemberCount, "명")} sub={summary.memberBasisText} tone="green" />
          <StatCard label="신규회원" value={count(summary.newMemberCount, "명")} sub={summary.memberBasisText} tone="blue" />
        </div>

        <div className="mt-4 rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800">
          사이트 방문자 수: {summary.visitorText}
          <br />
          방문자 수는 방문 로그 테이블이 연결된 뒤 정확한 숫자로 표시하는 것이 안전합니다.
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onOpenSettlement}
            className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-100"
          >
            정산통계에서 보기
          </button>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-2xl bg-slate-200 px-4 py-3 text-sm font-black text-slate-500"
            title="방송 리포트 저장은 다음 단계에서 DB 구조 확인 후 연결합니다."
          >
            방송 리포트 저장은 다음 단계
          </button>
        </div>
      </div>
    </div>
  );
}
