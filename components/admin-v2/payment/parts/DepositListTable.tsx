"use client";

import { ADMIN_STATUS_LABELS, ADMIN_STATUS_TONES } from "@/components/admin-v2/ui/adminDesignSystem";
import { paymentConfirmStatusLabel } from "@/lib/admin-v2/paymentConfirmStatus";

type DepositRow = {
  id: string | number;
  depositor_name?: string | null;
  amount?: number | string | null;
  deposited_time?: string | null;
  created_at?: string | null;
  match_status?: string | null;
};

type DepositListTableProps = {
  deposits: DepositRow[];
};

const money = (value: any) => `${Number(value || 0).toLocaleString()}원`;

function formatDateLabel(value: any) {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="px-4 py-10 text-center text-sm font-bold text-neutral-500">
      {text}
    </div>
  );
}

function statusView(value: any) {
  const rawStatus = String(value || "").trim();
  const status = paymentConfirmStatusLabel(rawStatus || "미매칭");

  if (!rawStatus || rawStatus === "미확인" || rawStatus === "미매칭" || status === "미매칭") {
    return {
      label: ADMIN_STATUS_LABELS.unmatchedDeposit,
      tone: ADMIN_STATUS_TONES.unmatchedDeposit,
    };
  }

  if (status === "자동입금확인") {
    return {
      label: ADMIN_STATUS_LABELS.autoPaid,
      tone: ADMIN_STATUS_TONES.autoPaid,
    };
  }

  if (status === "수동입금확인") {
    return {
      label: ADMIN_STATUS_LABELS.manualPaid,
      tone: ADMIN_STATUS_TONES.manualPaid,
    };
  }

  if (["입금확인", "매칭완료", "처리완료", "완료", "연결완료"].includes(status)) {
    return {
      label: "입금확인",
      tone: ADMIN_STATUS_TONES.autoPaid,
    };
  }

  return {
    label: status,
    tone: ADMIN_STATUS_TONES.default,
  };
}

export default function DepositListTable({ deposits }: DepositListTableProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="grid grid-cols-[1fr_120px_120px] bg-neutral-950 px-3 py-2 text-[12px] font-black text-white">
        <div>입금자명</div>
        <div className="text-right">입금금액</div>
        <div className="text-center">처리 상태</div>
      </div>

      {deposits.length === 0 ? (
        <EmptyBox text="표시할 입금내역이 없습니다." />
      ) : (
        <div className="divide-y divide-neutral-100">
          {deposits.map((deposit) => {
            const view = statusView(deposit.match_status);

            return (
              <div
                key={deposit.id}
                className="grid grid-cols-[1fr_120px_120px] px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-black">{deposit.depositor_name || "-"}</div>
                  <div className="text-[11px] font-bold text-neutral-500">
                    {formatDateLabel(deposit.deposited_time || deposit.created_at)}
                  </div>
                </div>

                <div className="text-right font-black">{money(deposit.amount)}</div>

                <div className="text-center">
                  <span
                    className={[
                      "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-black",
                      view.tone,
                    ].join(" ")}
                  >
                    {view.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
