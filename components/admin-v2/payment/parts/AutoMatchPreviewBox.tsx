"use client";

type AutoMatchPreviewBoxProps = {
  previewResult: any;
  autoRunLoading: boolean;
  onRun: () => void;
};

const money = (value: any) => `${Number(value || 0).toLocaleString()}원`;

function CountCard({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        strong
          ? "border-neutral-900 bg-neutral-950 text-white"
          : "border-neutral-200 bg-white text-neutral-900"
      }`}
    >
      <div className={`text-[10px] font-bold ${strong ? "text-neutral-300" : "text-neutral-500"}`}>
        {label}
      </div>
      <div className="mt-0.5 text-[16px] font-black">{value}</div>
    </div>
  );
}

export default function AutoMatchPreviewBox({
  previewResult,
  autoRunLoading,
  onRun,
}: AutoMatchPreviewBoxProps) {
  const summary = previewResult?.summary || {};
  const candidates = Array.isArray(previewResult?.candidates) ? previewResult.candidates : [];
  const candidateCount = Number(summary.auto_match_preview_count || 0);

  if (candidateCount <= 0) {
    return (
      <section className="mb-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-black text-neutral-900">자동후보 없음</div>
            <div className="mt-0.5 text-[11px] font-bold text-neutral-500">
              닉네임+금액이 정확히 맞는 자동후보가 없습니다. 필요한 주문은 [입금 매칭하기]로 처리하세요.
            </div>
          </div>

          <div className="rounded-full bg-neutral-100 px-3 py-1 text-[12px] font-black text-neutral-500">
            후보 0건
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-black text-amber-950">
            자동후보 {candidateCount.toLocaleString()}건
          </div>
          <div className="mt-1 text-[12px] font-bold text-amber-800">
            닉네임+금액이 정확히 맞는 1:1 후보만 확정할 수 있습니다.
          </div>
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={autoRunLoading}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-black text-white active:scale-[0.98] disabled:bg-neutral-300"
        >
          {autoRunLoading ? "확정중..." : "후보 확정"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <CountCard label="검사 주문" value={`${Number(summary.checked_orders || 0).toLocaleString()}건`} />
        <CountCard label="검사 입금" value={`${Number(summary.checked_deposits || 0).toLocaleString()}건`} />
        <CountCard label="미결제 주문" value={`${Number(summary.eligible_unpaid_orders || 0).toLocaleString()}건`} />
        <CountCard label="미확인 입금" value={`${Number(summary.eligible_unmatched_deposits || 0).toLocaleString()}건`} />
        <CountCard label="자동후보" value={`${candidateCount.toLocaleString()}건`} strong />
        <CountCard
          label="애매/제외"
          value={`${(Number(summary.ambiguous_count || 0) + Number(summary.excluded_count || 0)).toLocaleString()}건`}
        />
      </div>

      <div className="mt-3 max-h-52 overflow-y-auto rounded-lg bg-white">
        {candidates.slice(0, 30).map((candidate: any, index: number) => (
          <div
            key={`${candidate.order_id || index}-${candidate.deposit_id || index}`}
            className="grid grid-cols-[1fr_110px_1fr_110px] gap-2 border-b border-neutral-100 px-3 py-2 text-[12px] font-bold"
          >
            <div className="truncate">
              주문: {candidate.order_nickname || "-"}
              <div className="text-[10px] text-neutral-500">
                {candidate.order_group_id || candidate.order_id || "-"}
              </div>
            </div>

            <div className="text-right font-black">{money(candidate.order_amount || 0)}</div>

            <div className="truncate">
              입금: {candidate.deposit_depositor || "-"}
              <div className="text-[10px] text-neutral-500">
                {candidate.deposit_time_text || "-"}
              </div>
            </div>

            <div className="text-right font-black">{money(candidate.deposit_amount || 0)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
