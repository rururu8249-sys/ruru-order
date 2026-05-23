import type { DepositRow, OrderGroup } from "@/lib/admin-v2/types";

type Props = {
  deposits: DepositRow[];
  orderGroups: OrderGroup[];
};

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function getDepositAmount(deposit: DepositRow) {
  return Number((deposit as any).amount || (deposit as any).deposit_amount || 0);
}

function getDepositName(deposit: DepositRow) {
  const row = deposit as any;
  return text(row.depositor || row.deposit_depositor || row.sender_name || row.name) || "-";
}

function getDepositTime(deposit: DepositRow) {
  const row = deposit as any;
  return text(row.deposited_time || row.created_at || row.deposit_time) || "-";
}

function getDepositStatus(deposit: DepositRow) {
  const row = deposit as any;
  return text(row.match_status || row.status || "");
}

function isDepositConfirmed(deposit: DepositRow) {
  const row = deposit as any;
  const status = getDepositStatus(deposit);

  if (!status || status === "미확인" || status === "미매칭") {
    return false;
  }

  return (
    Boolean(row.confirmed_at) ||
    Boolean(row.match_order_group_id) ||
    Boolean(row.matched_order_group_id) ||
    ["수동입금확인", "자동입금확인", "입금확인", "매칭완료", "처리완료", "완료"].includes(status)
  );
}

function statusBadge(deposit: DepositRow) {
  if (isDepositConfirmed(deposit)) {
    const status = getDepositStatus(deposit) || "입금확인";

    if (status === "수동입금확인") {
      return <span className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">수동입금확인</span>;
    }

    if (status === "자동입금확인") {
      return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">자동입금확인</span>;
    }

    return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">입금확인</span>;
  }

  return <span className="rounded-lg bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">미매칭입금</span>;
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

export default function AdminLivePaymentPanel({ deposits, orderGroups }: Props) {
  const confirmedDeposits = deposits.filter(isDepositConfirmed);
  const unmatchedDeposits = deposits.filter((deposit) => !isDepositConfirmed(deposit));

  const totalAmount = deposits.reduce((sum, deposit) => sum + getDepositAmount(deposit), 0);
  const confirmedAmount = confirmedDeposits.reduce((sum, deposit) => sum + getDepositAmount(deposit), 0);
  const unmatchedAmount = unmatchedDeposits.reduce((sum, deposit) => sum + getDepositAmount(deposit), 0);

  const latestDeposits = [...deposits]
    .sort((a, b) => getDepositTime(b).localeCompare(getDepositTime(a)))
    .slice(0, 10);

  return (
    <section className="grid gap-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">PAYMENT CHECK</div>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">입금확인</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              현재 연결은 읽기전용입니다. 자동입금확인·수동입금확인·뱅크다 새로고침은 아직 실행하지 않습니다.
            </p>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            읽기전용 연결
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="전체 입금내역" value={`${deposits.length.toLocaleString("ko-KR")}건`} sub={money(totalAmount)} />
          <SummaryCard label="입금확인 완료" value={`${confirmedDeposits.length.toLocaleString("ko-KR")}건`} sub={money(confirmedAmount)} />
          <SummaryCard label="미매칭 입금" value={`${unmatchedDeposits.length.toLocaleString("ko-KR")}건`} sub={money(unmatchedAmount)} />
          <SummaryCard label="주문 그룹" value={`${orderGroups.length.toLocaleString("ko-KR")}건`} sub="현재 주문 데이터 기준" />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">최근 입금내역</h2>
          <div className="text-xs font-bold text-slate-400">최대 10건 표시</div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[150px_1fr_130px_130px] bg-slate-50 px-4 py-3 text-xs font-black text-slate-500">
            <div>입금일시</div>
            <div>입금자명</div>
            <div className="text-right">입금금액</div>
            <div className="text-center">상태</div>
          </div>

          {latestDeposits.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm font-bold text-slate-400">
              표시할 입금내역이 없습니다.
            </div>
          ) : (
            latestDeposits.map((deposit, index) => (
              <div
                key={String((deposit as any).id || index)}
                className="grid grid-cols-[150px_1fr_130px_130px] items-center border-t border-slate-100 px-4 py-3 text-sm"
              >
                <div className="truncate font-bold text-slate-500">{getDepositTime(deposit)}</div>
                <div className="truncate font-black text-slate-900">{getDepositName(deposit)}</div>
                <div className="text-right font-black text-slate-900">{money(getDepositAmount(deposit))}</div>
                <div className="text-center">{statusBadge(deposit)}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-700">
          다음 단계에서 실제 입금내역 새로고침, 자동입금확인, 수동입금확인을 순서대로 연결합니다.
          자동입금확인은 닉네임 완전일치 + 금액 완전일치 + 1:1 단일 후보 조건을 그대로 유지해야 합니다.
        </div>
      </div>
    </section>
  );
}
