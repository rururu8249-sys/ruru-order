"use client";

// components/admin-v2/today/AdminTodayDashboard.tsx
// 목적: admin-v2 첫 화면인 오늘할일 대시보드
// 주의: UI/요약 전용. 주문금액 계산, 배송비 계산, 입금매칭, 정산 저장, Supabase 쓰기 로직 없음.

type AdminTodayDashboardProps = {
  orders: any[];
  customers: any[];
  deposits: any[];
  onGoOrders: () => void;
  onGoShipping: () => void;
  onGoCustomers: () => void;
  onGoDeposits: () => void;
};

const toText = (value: any) => String(value ?? "").trim();

const toMoney = (value: any) => {
  const number = Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
  return `${number.toLocaleString()}원`;
};

const readOrderStatus = (order: any) => {
  return (
    toText(order.admin_order_status_v2) ||
    toText(order.admin_order_status) ||
    toText(order.order_manage_status) ||
    "미설정"
  );
};

const readShippingStatus = (order: any) => {
  return toText(order.shipping_status) || "미설정";
};

const readNickname = (order: any) => {
  return (
    toText(order.youtube_nickname) ||
    toText(order.nickname) ||
    toText(order.customer_nickname) ||
    "-"
  );
};

const readProductName = (order: any) => {
  return (
    toText(order.product_name) ||
    toText(order.order_product_name) ||
    toText(order.item_name) ||
    "-"
  );
};

const readCreatedTime = (value: any) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

function includesAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

function StatCard({
  icon,
  label,
  value,
  desc,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  desc: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black text-neutral-500">{label}</div>
          <div className="mt-2 text-2xl font-black text-neutral-950">{value}</div>
          <div className="mt-1 text-xs font-bold text-neutral-500">{desc}</div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-xl">
          {icon}
        </div>
      </div>
    </button>
  );
}

export default function AdminTodayDashboard({
  orders,
  customers,
  deposits,
  onGoOrders,
  onGoShipping,
  onGoCustomers,
  onGoDeposits,
}: AdminTodayDashboardProps) {
  const pendingOrders = orders.filter((order) => {
    const status = readOrderStatus(order);
    return includesAny(status, ["미설정", "미입금", "입금대기", "확인대기"]);
  });

  const shippingReadyOrders = orders.filter((order) => {
    const shippingStatus = readShippingStatus(order);
    return includesAny(shippingStatus, ["출고준비", "출고대기", "포장전", "미설정"]);
  });

  const issueOrders = orders.filter((order) => {
    const memo = [
      order.memo,
      order.admin_memo,
      order.customer_memo,
      order.request_memo,
      order.delivery_memo,
      order.special_note,
    ]
      .map(toText)
      .join(" ");

    return includesAny(memo, ["환불", "교환", "반품", "별도", "주소", "연락", "확인"]);
  });

  const recentOrders = orders.slice(0, 6);

  const recentDeposits = deposits.slice(0, 5);

  return (
    <section className="grid gap-4">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
        <div className="text-sm font-black text-blue-600">오늘할일</div>
        <h2 className="mt-1 text-2xl font-black tracking-[-0.05em] text-neutral-950">
          주문·입금·출고를 한 화면에서 확인하세요
        </h2>
        <p className="mt-2 text-sm font-bold text-neutral-500">
          현재 화면은 요약 전용입니다. 금액 계산, 입금매칭, 정산 저장 로직은 변경하지 않습니다.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard icon="📦" label="전체 주문" value={`${orders.length}건`} desc="최근 주문 기준" onClick={onGoOrders} />
        <StatCard icon="⏳" label="미확인 주문" value={`${pendingOrders.length}건`} desc="입금/확인 대기" onClick={onGoOrders} />
        <StatCard icon="🚚" label="출고 확인" value={`${shippingReadyOrders.length}건`} desc="출고준비/대기" onClick={onGoShipping} />
        <StatCard icon="💳" label="입금내역" value={`${deposits.length}건`} desc="뱅크다/입금매칭" onClick={onGoDeposits} />
        <StatCard icon="👥" label="고객" value={`${customers.length}명`} desc="고객관리 이동" onClick={onGoCustomers} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-neutral-950">최근 주문</h3>
              <p className="text-xs font-bold text-neutral-500">최근 6건만 표시됩니다.</p>
            </div>
            <button
              type="button"
              onClick={onGoOrders}
              className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
            >
              주문관리
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-100">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left">시간</th>
                  <th className="px-3 py-2 text-left">닉네임</th>
                  <th className="px-3 py-2 text-left">상품명</th>
                  <th className="px-3 py-2 text-right">금액</th>
                  <th className="px-3 py-2 text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm font-bold text-neutral-400">
                      아직 표시할 주문이 없습니다.
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((order, index) => (
                    <tr key={order.id ?? index} className="border-t border-neutral-100">
                      <td className="px-3 py-2 font-bold text-neutral-500">{readCreatedTime(order.created_at)}</td>
                      <td className="px-3 py-2 font-black text-neutral-900">{readNickname(order)}</td>
                      <td className="max-w-[260px] truncate px-3 py-2 font-bold text-neutral-700">{readProductName(order)}</td>
                      <td className="px-3 py-2 text-right font-black text-neutral-900">{toMoney(order.total_price ?? order.final_amount)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">
                          {readOrderStatus(order)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-neutral-950">오늘 체크할 이슈</h3>
                <p className="text-xs font-bold text-neutral-500">메모 기준 자동 요약</p>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                {issueOrders.length}건
              </span>
            </div>

            <div className="grid gap-2">
              {issueOrders.slice(0, 5).length === 0 ? (
                <div className="rounded-xl bg-neutral-50 p-4 text-sm font-bold text-neutral-500">
                  현재 메모 기준 이슈가 없습니다.
                </div>
              ) : (
                issueOrders.slice(0, 5).map((order, index) => (
                  <button
                    key={order.id ?? index}
                    type="button"
                    onClick={onGoOrders}
                    className="rounded-xl border border-neutral-100 bg-neutral-50 p-3 text-left active:scale-[0.99]"
                  >
                    <div className="text-sm font-black text-neutral-900">{readNickname(order)}</div>
                    <div className="mt-1 text-xs font-bold text-neutral-500">{readProductName(order)}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-neutral-950">최근 입금내역</h3>
                <p className="text-xs font-bold text-neutral-500">입금매칭 메뉴와 연결</p>
              </div>
              <button
                type="button"
                onClick={onGoDeposits}
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
              >
                입금매칭
              </button>
            </div>

            <div className="grid gap-2">
              {recentDeposits.length === 0 ? (
                <div className="rounded-xl bg-neutral-50 p-4 text-sm font-bold text-neutral-500">
                  아직 입금내역이 없습니다.
                </div>
              ) : (
                recentDeposits.map((deposit, index) => (
                  <div key={deposit.id ?? index} className="flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                    <div>
                      <div className="text-sm font-black text-neutral-900">
                        {toText(deposit.deposit_name) || toText(deposit.sender_name) || "입금자명 없음"}
                      </div>
                      <div className="text-xs font-bold text-neutral-500">{readCreatedTime(deposit.created_at)}</div>
                    </div>
                    <div className="text-sm font-black text-neutral-950">
                      {toMoney(deposit.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
