// components/order/OrderCustomerEntryPanel.tsx
// 목적: 주문 전 기존 고객 / 처음 주문 고객 진입 UI
// 주의: UI 전용. Supabase, 주문저장, 금액계산 로직 없음.

type OrderCustomerEntryPanelProps = {
  loginName: string;
  loginPhone: string;
  onLoginNameChange: (value: string) => void;
  onLoginPhoneChange: (value: string) => void;
  onLoadCustomer: () => void;
  onStartNew: () => void;
};

export default function OrderCustomerEntryPanel({
  loginName,
  loginPhone,
  onLoginNameChange,
  onLoginPhoneChange,
  onLoadCustomer,
  onStartNew,
}: OrderCustomerEntryPanelProps) {
  return (
    <section className="mt-5 rounded-[34px] bg-white p-5 shadow-[0_18px_40px_rgba(30,64,175,0.10)] ring-1 ring-blue-100">
      <div className="rounded-[28px] bg-[#f8fbff] p-4 ring-1 ring-blue-100">
        <h2 className="text-[22px] font-black tracking-[-0.05em] text-[#151923]">
          기존 고객이신가요?
        </h2>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-2">
            <span className="text-[15px] font-black text-[#151923]">이름</span>
            <input
              value={loginName}
              onChange={(event) => onLoginNameChange(event.target.value)}
              placeholder="이름을 입력해주세요"
              className="h-14 w-full rounded-2xl border border-blue-100 bg-white px-4 text-[16px] font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-500"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-[15px] font-black text-[#151923]">전화번호</span>
            <input
              value={loginPhone}
              onChange={(event) => onLoginPhoneChange(event.target.value)}
              placeholder="- 없이 숫자만 입력해주세요"
              inputMode="numeric"
              className="h-14 w-full rounded-2xl border border-blue-100 bg-white px-4 text-[16px] font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-500"
            />
          </label>

          <button
            type="button"
            onClick={onLoadCustomer}
            className="mt-1 h-14 rounded-2xl bg-blue-600 text-[18px] font-black text-white shadow-[0_12px_24px_rgba(37,99,235,0.22)] transition active:scale-[0.98]"
          >
            정보 불러오기
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-[28px] bg-white p-4 ring-1 ring-blue-100">
        <h2 className="text-[22px] font-black tracking-[-0.05em] text-[#151923]">
          처음 주문이신가요?
        </h2>

        <button
          type="button"
          onClick={onStartNew}
          className="mt-4 h-14 w-full rounded-2xl bg-[#151923] text-[18px] font-black text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] transition active:scale-[0.98]"
        >
          처음 주문 정보 입력하기
        </button>
      </div>
    </section>
  );
}
