"use client";

// components/customer/CustomerMissingDetailAddressPanel.tsx
// 목적: 상세주소 누락 시 브라우저 confirm 대신 화면 안 확인 패널 표시
// 주의: UI 전용. 주문 저장, 금액, 배송비, 입금, 정산 로직 없음.

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function CustomerMissingDetailAddressPanel({ open, onClose, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/40 px-4">
      <section className="w-full max-w-[540px] rounded-[28px] border border-amber-100 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-xl text-white">
            ⚠️
          </div>

          <div className="min-w-0">
            <div className="text-[11px] font-black tracking-[0.16em] text-amber-500">
              DETAIL ADDRESS CHECK
            </div>

            <h2 className="mt-1 text-[24px] font-black tracking-[-0.05em] text-slate-950">
              상세주소가 비어 있습니다.
            </h2>

            <p className="mt-3 break-keep text-[14px] font-bold leading-relaxed text-slate-600">
              아파트, 빌라, 오피스텔은 동·호수 누락 시 배송이 지연되거나 반송될 수 있습니다.
              정말 상세주소 없이 제출할 때만 아래 버튼을 눌러주세요.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 active:scale-[0.98]"
          >
            돌아가서 입력하기
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="h-12 rounded-2xl bg-amber-500 px-4 text-sm font-black text-white active:scale-[0.98]"
          >
            그래도 제출하기
          </button>
        </div>
      </section>
    </div>
  );
}
