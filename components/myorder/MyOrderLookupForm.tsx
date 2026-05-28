// components/myorder/MyOrderLookupForm.tsx
// 목적: 주문조회 이름/전화번호 입력 UI
// 주의: UI 전용. 조회 로직 없음.

type MyOrderLookupFormProps = {
  customerName: string;
  formattedPhone: string;
  loading: boolean;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSubmit: () => void;
};

export default function MyOrderLookupForm({
  customerName,
  formattedPhone,
  loading,
  onNameChange,
  onPhoneChange,
  onSubmit,
}: MyOrderLookupFormProps) {
  return (
    <section className="rounded-[26px] bg-white p-4 shadow-[0_12px_28px_rgba(30,64,175,0.08)] ring-1 ring-blue-100 min-[390px]:rounded-[28px] min-[390px]:p-5">
      <div className="mb-4">
        <h2 className="break-keep text-[21px] font-black leading-tight tracking-[-0.055em] text-[#151923] min-[390px]:text-[22px]">
          최근 7일 주문조회
        </h2>

        <p className="mt-1 break-keep text-sm font-bold leading-relaxed text-slate-600">
          이름과 전화번호를 입력하면 최근 주문내역을 확인할 수 있어요.
        </p>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-2">
          <span className="text-[14px] font-black text-[#151923]">이름</span>
          <input
            value={customerName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="이름을 입력해주세요"
            className="w-full rounded-2xl border border-blue-100 bg-white p-4 font-bold outline-none focus:border-blue-500"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-[14px] font-black text-[#151923]">전화번호</span>
          <input
            value={formattedPhone}
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder="- 없이 숫자만 입력해주세요"
            inputMode="numeric"
            className="w-full rounded-2xl border border-blue-100 bg-white p-4 font-bold outline-none focus:border-blue-500"
          />
        </label>

        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="mt-1 rounded-2xl bg-blue-600 p-3.5 text-[17px] font-black text-white shadow-[0_12px_24px_rgba(37,99,235,0.22)] transition active:scale-[0.97] disabled:opacity-60 min-[390px]:p-4 min-[390px]:text-[18px]"
        >
          {loading ? "조회중..." : "조회하기"}
        </button>
      </div>

      <a
        href="https://pf.kakao.com/_RMxaqX"
        target="_blank"
        rel="noreferrer"
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-slate-50 p-3 text-[14px] font-black text-[#151923] ring-1 ring-slate-100 active:scale-[0.98]"
      >
        <span>💬</span>
        카톡채널 문의
      </a>
    </section>
  );
}
