import type { OrderGroup } from "@/lib/admin-v2/types";

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString()}원`;
}

type Props = {
  group: OrderGroup;
  expectedAmount: number;
};

export default function ManualPaymentOrderSummary({ group, expectedAmount }: Props) {
  const first = group.first;
  const nickname = first.youtube_nickname || "-";
  const customerName = first.customer_name || "-";
  const phone = first.customer_phone || first.phone || "-";

  return (
    <section className="rounded-2xl border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black tracking-widest text-ink-mute">ORDER MATCH TARGET</div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-black tracking-[-0.04em] text-ink">{nickname}</span>
            <span className="text-xs font-black text-ink-mute">이름</span>
            <span className="text-sm font-black text-ink">{customerName}</span>
            <span className="text-xs font-black text-ink-mute">전화</span>
            <span className="text-sm font-black text-ink">{phone}</span>
            <span className="text-xs font-black text-ink-mute">수량</span>
            <span className="text-sm font-black text-ink">{group.totalQty || group.rows.length}개</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] font-bold text-ink-mute">
            주문번호 {group.groupId}
          </div>
        </div>

        <div className="shrink-0 rounded-xl bg-surface px-2.5 py-1.5 text-right shadow-sm">
          <div className="text-[10px] font-black text-ink-mute">입금예정</div>
          <div className="text-base font-black text-orange-600">{money(expectedAmount)}</div>
        </div>
      </div>
    </section>
  );
}
