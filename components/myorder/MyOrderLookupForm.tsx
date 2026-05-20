// components/myorder/MyOrderLookupForm.tsx
// 목적: 로그아웃 상태 주문조회 입력폼
// 주의: UI 전용. 조회 조건, Supabase, DB 로직 없음.

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
    <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_26px_rgba(30,64,175,0.08)] ring-1 ring-blue-100">
      <div className="mb-4">
        <h2 className="text-[22px] font-black tracking-[-0.07em] text-[#151923]">
          최근 7일 주문조회
        </h2>

        <p className="mt-2 break-keep text-sm font-bold leading-relaxed tracking-[-0.04em] text-slate-600">
          이름과 전화번호를 입력하면 최근 7일 주문내역을 확인할 수 있어요.
        </p>
      </div>

      <div className="grid gap-3">
        <input
          value={customerName}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="이름"
          className="w-full rounded-2xl border border-blue-100 bg-blue-50/40 p-4 font-bold outline-none focus:border-blue-400 focus:bg-white"
        />

        <input
          value={formattedPhone}
          onChange={(event) => onPhoneChange(event.target.value)}
          placeholder="전화번호"
          inputMode="numeric"
          className="w-full rounded-2xl border border-blue-100 bg-blue-50/40 p-4 font-bold outline-none focus:border-blue-400 focus:bg-white"
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="rounded-2xl bg-blue-600 p-4 font-black text-white shadow-[0_10px_20px_rgba(37,99,235,0.20)] transition active:scale-[0.97] disabled:opacity-60"
        >
          {loading ? "조회중..." : "조회하기"}
        </button>
      </div>

      <a
        href="https://pf.kakao.com/_RMxaqX"
        target="_blank"
        rel="noreferrer"
        className="mt-4 block rounded-2xl bg-[#ffe04b] p-4 text-center text-sm font-black tracking-[-0.04em] text-[#3b2517] active:scale-[0.98]"
      >
        카톡채널 문의
      </a>
    </section>
  );
}
