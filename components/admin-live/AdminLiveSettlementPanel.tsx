import type { LiveOrder } from "./types";

type Props = {
  orders: LiveOrder[];
};

type SettlementRow = {
  label: string;
  count: number;
  amount: number;
  tone: "slate" | "emerald" | "red" | "orange" | "violet" | "blue";
  desc: string;
};

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function isPaid(order: LiveOrder) {
  return ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus);
}

function isUnpaid(order: LiveOrder) {
  return ["unpaid", "manual_match_needed", "card_unpaid"].includes(order.paymentStatus);
}

function isBank(order: LiveOrder) {
  return order.paymentMethod === "무통장입금";
}

function isCard(order: LiveOrder) {
  return order.paymentMethod === "카드결제";
}

function sumAmount(orders: LiveOrder[]) {
  return orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
}

function sumShippingFee(orders: LiveOrder[]) {
  return orders.reduce((sum, order) => sum + Number(order.shippingFee || 0), 0);
}

function toneClass(tone: SettlementRow["tone"]) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    orange: "bg-orange-100 text-orange-700",
    violet: "bg-violet-100 text-violet-700",
    blue: "bg-blue-100 text-blue-700",
  };

  return tones[tone];
}

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: SettlementRow["tone"] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-black text-slate-500">{label}</div>
        <span className={`rounded-full px-2 py-1 text-[11px] font-black ${toneClass(tone)}`}>
          조회
        </span>
      </div>
      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-bold text-slate-400">{sub}</div>
    </div>
  );
}

function SettlementTable({ rows }: { rows: SettlementRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="grid grid-cols-[170px_100px_150px_1fr] bg-slate-50 px-4 py-3 text-xs font-black text-slate-500">
        <div>구분</div>
        <div className="text-right">건수</div>
        <div className="text-right">금액</div>
        <div>설명</div>
      </div>

      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[170px_100px_150px_1fr] items-center border-t border-slate-100 px-4 py-3 text-sm"
        >
          <div>
            <span className={`rounded-lg px-2 py-1 text-xs font-black ${toneClass(row.tone)}`}>
              {row.label}
            </span>
          </div>
          <div className="text-right font-black text-slate-700">{row.count.toLocaleString("ko-KR")}건</div>
          <div className="text-right font-black text-slate-950">{money(row.amount)}</div>
          <div className="truncate text-xs font-bold text-slate-500">{row.desc}</div>
        </div>
      ))}
    </div>
  );
}

export default function AdminLiveSettlementPanel({ orders }: Props) {
  const paidOrders = orders.filter(isPaid);
  const unpaidOrders = orders.filter(isUnpaid);

  const bankPaidOrders = orders.filter((order) => isBank(order) && isPaid(order));
  const bankUnpaidOrders = orders.filter((order) => isBank(order) && !isPaid(order));
  const cardPaidOrders = orders.filter((order) => isCard(order) && isPaid(order));
  const cardUnpaidOrders = orders.filter((order) => isCard(order) && !isPaid(order));
  const manualNeededOrders = orders.filter((order) => order.paymentStatus === "manual_match_needed");

  const totalAmount = sumAmount(orders);
  const paidAmount = sumAmount(paidOrders);
  const unpaidAmount = sumAmount(unpaidOrders);
  const shippingFeeAmount = sumShippingFee(orders);

  const settlementRows: SettlementRow[] = [
    {
      label: "총 주문금액",
      count: orders.length,
      amount: totalAmount,
      tone: "slate",
      desc: "입금확인/미입금/카드결제 포함 전체 주문금액",
    },
    {
      label: "입금확인",
      count: paidOrders.length,
      amount: paidAmount,
      tone: "emerald",
      desc: "입금확인, 자동입금확인, 수동입금확인, 카드결제완료 포함",
    },
    {
      label: "미입금",
      count: unpaidOrders.length,
      amount: unpaidAmount,
      tone: "red",
      desc: "미입금, 입금확인 필요, 카드 미결제 포함",
    },
    {
      label: "입금확인 필요",
      count: manualNeededOrders.length,
      amount: sumAmount(manualNeededOrders),
      tone: "orange",
      desc: "수동 확인이 필요한 주문",
    },
    {
      label: "무통장 입금확인",
      count: bankPaidOrders.length,
      amount: sumAmount(bankPaidOrders),
      tone: "emerald",
      desc: "무통장입금 중 입금확인 완료",
    },
    {
      label: "무통장 미입금",
      count: bankUnpaidOrders.length,
      amount: sumAmount(bankUnpaidOrders),
      tone: "red",
      desc: "무통장입금 중 아직 입금확인 전",
    },
    {
      label: "카드결제완료",
      count: cardPaidOrders.length,
      amount: sumAmount(cardPaidOrders),
      tone: "violet",
      desc: "카드결제 완료 주문",
    },
    {
      label: "카드 미결제",
      count: cardUnpaidOrders.length,
      amount: sumAmount(cardUnpaidOrders),
      tone: "red",
      desc: "카드결제 방식이지만 아직 결제 전",
    },
  ];

  return (
    <section className="grid gap-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">SETTLEMENT STATS</div>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">정산통계</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              현재 연결은 읽기전용입니다. 정산 확정·금액 수정·환불 차감·엑셀 저장은 아직 실행하지 않습니다.
            </p>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            읽기전용 연결
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="총 주문금액" value={money(totalAmount)} sub={`${orders.length.toLocaleString("ko-KR")}건`} tone="slate" />
          <SummaryCard label="입금확인 금액" value={money(paidAmount)} sub={`${paidOrders.length.toLocaleString("ko-KR")}건`} tone="emerald" />
          <SummaryCard label="미입금 금액" value={money(unpaidAmount)} sub={`${unpaidOrders.length.toLocaleString("ko-KR")}건`} tone="red" />
          <SummaryCard label="배송비 합계" value={money(shippingFeeAmount)} sub="현재 주문 데이터 기준" tone="blue" />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">결제·입금 상태별 통계</h2>
          <div className="text-xs font-bold text-slate-400">조회 전용</div>
        </div>

        <SettlementTable rows={settlementRows} />

        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-700">
          이 화면은 현재 주문 데이터 기준의 조회용 통계입니다. 실제 정산 확정, 환불 차감, 카드수수료,
          기타매출/지출 반영은 다음 단계에서 별도 검증 후 연결해야 합니다.
        </div>
      </div>
    </section>
  );
}
