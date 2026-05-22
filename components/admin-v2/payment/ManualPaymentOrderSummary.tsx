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
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-black tracking-widest text-slate-400">ORDER MATCH TARGET</div>
          <h3 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">{nickname}</h3>
        </div>
        <div className="rounded-2xl bg-white px-4 py-2 text-right shadow-sm">
          <div className="text-[11px] font-black text-slate-400">입금예정금액</div>
          <div className="text-xl font-black text-orange-600">{money(expectedAmount)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Info label="이름" value={customerName} />
        <Info label="전화번호" value={phone} />
        <Info label="주문번호" value={group.groupId} wide />
        <Info label="상품수량" value={`${group.totalQty || group.rows.length}개`} />
      </div>
    </section>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={["rounded-2xl bg-white px-3 py-2 shadow-sm", wide ? "col-span-2" : ""].join(" ")}>
      <div className="text-[11px] font-black text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-black text-slate-800">{value}</div>
    </div>
  );
}
