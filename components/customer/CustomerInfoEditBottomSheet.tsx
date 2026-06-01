// components/customer/CustomerInfoEditBottomSheet.tsx
// 목적: 주문서 화면 안에서 사용하는 고객 정보수정 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음.

type CustomerInfoEditBottomSheetProps = {
  open: boolean;

  youtubeNickname: string;
  customerName: string;
  customerPhone: string;
  address: string;
  detailAddress: string;

  youtubeNicknameError?: string;

  onYoutubeNicknameChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onDetailAddressChange: (value: string) => void;

  onOpenAddressSearch: () => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;

  saving?: boolean;
};

const inputClassName =
  "h-12 w-full rounded-[16px] bg-slate-50 px-4 text-[15px] font-black tracking-[-0.05em] text-slate-950 outline-none ring-1 ring-slate-100 transition placeholder:text-slate-300 focus:bg-white focus:ring-2 focus:ring-blue-500/30";

const labelClassName =
  "mb-1.5 block text-[12px] font-black tracking-[-0.04em] text-slate-500";

export default function CustomerInfoEditBottomSheet({
  open,
  youtubeNickname,
  customerName,
  customerPhone,
  address,
  detailAddress,
  youtubeNicknameError,
  onYoutubeNicknameChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onAddressChange,
  onDetailAddressChange,
  onOpenAddressSearch,
  onClose,
  onSave,
  saving = false,
}: CustomerInfoEditBottomSheetProps) {
  if (!open) return null;

  return (
    <div
      data-ruru-customer-info-edit-sheet="shell-v1"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 px-3"
      role="dialog"
      aria-modal="true"
      aria-label="정보수정"
    >
      <section className="w-full max-w-[430px] overflow-hidden rounded-t-[30px] bg-white shadow-[0_-22px_70px_rgba(15,23,42,0.22)]">
        <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-slate-200" />

        <div className="flex max-h-[88dvh] flex-col">
          <header className="shrink-0 px-4 pb-3 pt-5">
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <h2 className="text-[26px] font-black leading-none tracking-[-0.08em] text-slate-950">
                정보수정
              </h2>
              <span className="text-[12px] font-black tracking-[-0.05em] text-slate-400">
                배송정보 확인
              </span>
            </div>

            <p className="mt-2 text-[12px] font-bold leading-relaxed tracking-[-0.04em] text-slate-400">
              주문 전 닉네임, 연락처, 주소가 맞는지 확인해주세요.
            </p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            <div className="grid gap-3">
              <div className="rounded-[22px] bg-white p-3 ring-1 ring-slate-200">
                <label className={labelClassName} htmlFor="customerInfoEditNickname">
                  유튜브 닉네임
                </label>
                <input
                  id="customerInfoEditNickname"
                  value={youtubeNickname}
                  onChange={(event) => onYoutubeNicknameChange(event.target.value)}
                  className={inputClassName}
                  placeholder="채팅창에 보이는 닉네임"
                  autoComplete="nickname"
                />
                {youtubeNicknameError ? (
                  <p className="mt-1.5 text-[11px] font-bold tracking-[-0.04em] text-red-500">
                    {youtubeNicknameError}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11px] font-bold tracking-[-0.04em] text-slate-400">
                    현재 보이는 닉네임과 다르면 주문 누락이 생길 수 있습니다.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[22px] bg-white p-3 ring-1 ring-slate-200">
                  <label className={labelClassName} htmlFor="customerInfoEditName">
                    이름
                  </label>
                  <input
                    id="customerInfoEditName"
                    value={customerName}
                    onChange={(event) => onCustomerNameChange(event.target.value)}
                    className={inputClassName}
                    placeholder="이름"
                    autoComplete="name"
                  />
                </div>

                <div className="rounded-[22px] bg-white p-3 ring-1 ring-slate-200">
                  <label className={labelClassName} htmlFor="customerInfoEditPhone">
                    전화번호
                  </label>
                  <input
                    id="customerInfoEditPhone"
                    value={customerPhone}
                    onChange={(event) => onCustomerPhoneChange(event.target.value)}
                    className={inputClassName}
                    placeholder="01012345678"
                    inputMode="numeric"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="rounded-[22px] bg-white p-3 ring-1 ring-slate-200">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="block text-[12px] font-black tracking-[-0.04em] text-slate-500" htmlFor="customerInfoEditAddress">
                    주소
                  </label>

                  <button
                    type="button"
                    onClick={onOpenAddressSearch}
                    className="rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-black tracking-[-0.04em] text-white transition active:scale-[0.97]"
                  >
                    주소검색
                  </button>
                </div>

                <input
                  id="customerInfoEditAddress"
                  value={address}
                  onChange={(event) => onAddressChange(event.target.value)}
                  className={inputClassName}
                  placeholder="주소검색을 눌러 주소를 입력해주세요"
                  autoComplete="street-address"
                />

                <input
                  value={detailAddress}
                  onChange={(event) => onDetailAddressChange(event.target.value)}
                  className={`${inputClassName} mt-2`}
                  placeholder="상세주소를 입력해주세요"
                  autoComplete="address-line2"
                />
              </div>

            </div>
          </div>

          <footer className="grid shrink-0 grid-cols-[0.78fr_1.22fr] gap-2 border-t border-slate-100 bg-white px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex min-h-[50px] items-center justify-center rounded-[18px] bg-slate-100 px-3 text-[15px] font-black tracking-[-0.05em] text-slate-700 transition active:scale-[0.98] disabled:opacity-45"
            >
              취소
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex min-h-[50px] items-center justify-center rounded-[18px] bg-blue-600 px-3 text-[15px] font-black tracking-[-0.05em] text-white shadow-[0_12px_28px_rgba(37,99,235,0.22)] transition active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
