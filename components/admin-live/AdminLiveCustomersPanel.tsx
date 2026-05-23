import type { LiveOrder } from "./types";

type Props = {
  orders: LiveOrder[];
};

type CustomerSummary = {
  key: string;
  nickname: string;
  name: string;
  phone: string;
  orderCount: number;
  totalAmount: number;
  paidCount: number;
  unpaidCount: number;
  manualNeededCount: number;
  latestOrderAt: string;
};

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function digitsOnly(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function formatPhone(value: unknown) {
  const digits = digitsOnly(value);

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return clean(value) || "-";
}

function getOrderPhone(order: LiveOrder) {
  const row = order as any;
  return clean(row.customerPhone || row.customer_phone || row.phone || row.customer_phone_number);
}

function getOrderCreatedAt(order: LiveOrder) {
  const row = order as any;
  return clean(row.createdAt || row.created_at || row.orderDate || row.order_date);
}

function isPaid(order: LiveOrder) {
  return ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus);
}

function isUnpaid(order: LiveOrder) {
  return ["unpaid", "manual_match_needed", "card_unpaid"].includes(order.paymentStatus);
}

function latestDateLabel(value: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function buildCustomerSummaries(orders: LiveOrder[]) {
  const map = new Map<string, CustomerSummary>();

  orders.forEach((order) => {
    const phone = getOrderPhone(order);
    const nickname = clean(order.nickname) || "-";
    const name = clean(order.name) || "-";
    const phoneKey = digitsOnly(phone);
    const key = phoneKey || `${nickname}__${name}`;

    const current =
      map.get(key) ||
      ({
        key,
        nickname,
        name,
        phone,
        orderCount: 0,
        totalAmount: 0,
        paidCount: 0,
        unpaidCount: 0,
        manualNeededCount: 0,
        latestOrderAt: "",
      } satisfies CustomerSummary);

    current.orderCount += 1;
    current.totalAmount += Number(order.totalAmount || 0);

    if (isPaid(order)) current.paidCount += 1;
    if (isUnpaid(order)) current.unpaidCount += 1;
    if (order.paymentStatus === "manual_match_needed") current.manualNeededCount += 1;

    const createdAt = getOrderCreatedAt(order);
    if (createdAt && (!current.latestOrderAt || createdAt > current.latestOrderAt)) {
      current.latestOrderAt = createdAt;
    }

    if (nickname !== "-" && current.nickname === "-") current.nickname = nickname;
    if (name !== "-" && current.name === "-") current.name = name;
    if (phone && !current.phone) current.phone = phone;

    map.set(key, current);
  });

  return [...map.values()].sort((a, b) => {
    const aDate = a.latestOrderAt || "";
    const bDate = b.latestOrderAt || "";
    return bDate.localeCompare(aDate);
  });
}

function customerStatus(customer: CustomerSummary) {
  if (customer.manualNeededCount > 0) {
    return <span className="rounded-lg bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">입금확인 필요</span>;
  }

  if (customer.unpaidCount > 0) {
    return <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-700">미입금 있음</span>;
  }

  return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">정상</span>;
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-bold text-slate-400">{sub}</div>
    </div>
  );
}

export default function AdminLiveCustomersPanel({ orders }: Props) {
  const customers = buildCustomerSummaries(orders);
  const manualNeededCustomers = customers.filter((customer) => customer.manualNeededCount > 0);
  const unpaidCustomers = customers.filter((customer) => customer.unpaidCount > 0);
  const paidOnlyCustomers = customers.filter((customer) => customer.unpaidCount === 0 && customer.orderCount > 0);

  const topCustomers = customers.slice(0, 20);

  return (
    <section className="grid gap-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">CUSTOMER MANAGEMENT</div>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">고객관리</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              현재 연결은 읽기전용입니다. 고객 차단·메모 저장·정보 수정은 아직 실행하지 않습니다.
            </p>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            읽기전용 연결
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="주문 고객" value={`${customers.length.toLocaleString("ko-KR")}명`} sub="현재 주문 데이터 기준" />
          <SummaryCard label="정상 고객" value={`${paidOnlyCustomers.length.toLocaleString("ko-KR")}명`} sub="미입금 없음" />
          <SummaryCard label="미입금 포함" value={`${unpaidCustomers.length.toLocaleString("ko-KR")}명`} sub="미입금/카드 미결제 포함" />
          <SummaryCard label="입금확인 필요" value={`${manualNeededCustomers.length.toLocaleString("ko-KR")}명`} sub="수동 확인 대상" />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">최근 주문 고객</h2>
          <div className="text-xs font-bold text-slate-400">최대 20명 표시</div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[130px_120px_110px_150px_90px_120px_130px] bg-slate-50 px-4 py-3 text-xs font-black text-slate-500">
            <div>상태</div>
            <div>닉네임</div>
            <div>이름</div>
            <div>전화번호</div>
            <div className="text-right">주문수</div>
            <div className="text-right">누적금액</div>
            <div className="text-right">최근주문</div>
          </div>

          {topCustomers.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm font-bold text-slate-400">
              표시할 고객 정보가 없습니다.
            </div>
          ) : (
            topCustomers.map((customer) => (
              <div
                key={customer.key}
                className="grid grid-cols-[130px_120px_110px_150px_90px_120px_130px] items-center border-t border-slate-100 px-4 py-3 text-sm"
              >
                <div>{customerStatus(customer)}</div>
                <div className="truncate font-black text-slate-900">{customer.nickname || "-"}</div>
                <div className="truncate font-bold text-slate-600">{customer.name || "-"}</div>
                <div className="truncate font-bold text-slate-600">{formatPhone(customer.phone)}</div>
                <div className="text-right font-black text-slate-700">{customer.orderCount.toLocaleString("ko-KR")}건</div>
                <div className="text-right font-black text-slate-900">{money(customer.totalAmount)}</div>
                <div className="text-right text-xs font-bold text-slate-500">{latestDateLabel(customer.latestOrderAt)}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-700">
          다음 단계에서 고객 검색, 차단회원 표시, 특이사항 메모, 고객상세 화면을 순서대로 연결합니다.
          현재 화면은 주문 데이터 기반 조회 전용이라 customers DB를 수정하지 않습니다.
        </div>
      </div>
    </section>
  );
}
