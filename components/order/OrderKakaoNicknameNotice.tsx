// components/order/OrderKakaoNicknameNotice.tsx
// 목적: 카카오 로그인 후 유튜브 닉네임 1회 강제 확인 모달
// 주의:
// - UI/로컬 상태 전용 컴포넌트입니다.
// - 주문 저장, 고객 병합, 입금매칭, 정산, 배송비 로직을 건드리지 않습니다.
// - 유튜브 닉네임은 사람마다 다양하므로 빈칸만 막고 1글자/이모지/특수문자도 허용합니다.
// - 입력 중 자동 진행 금지. 엔터키 진행 금지. 반드시 버튼 클릭/터치로만 저장합니다.

type OrderKakaoNicknameNoticeProps = {
  kakaoNickname: string;
  youtubeNickname: string;
  onYoutubeNicknameChange: (value: string) => void;
  onConfirm: () => void;
};

export default function OrderKakaoNicknameNotice({
  kakaoNickname,
  youtubeNickname,
  onYoutubeNicknameChange,
  onConfirm,
}: OrderKakaoNicknameNoticeProps) {
  const displayKakaoNickname = kakaoNickname.trim() || "확인되지 않음";
  const isEmpty = youtubeNickname.trim().length === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/68 px-4 py-6 backdrop-blur-[3px]">
      <section className="w-full max-w-[430px] overflow-hidden rounded-[34px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.42)] ring-1 ring-white/70">
        <div className="relative bg-gradient-to-b from-white via-white to-blue-50 px-6 pb-7 pt-6">
          <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full bg-[#fee500] px-4 py-2 text-[14px] font-black tracking-[-0.04em] text-[#241b17] shadow-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#241b17] text-[15px] text-[#fee500]">
              TALK
            </span>
            카카오 로그인 완료
          </div>

          <div className="text-center">
            <p className="break-keep text-[18px] font-black leading-tight tracking-[-0.06em] text-slate-700">
              카톡 이름은{" "}
              <span className="text-blue-600">“{displayKakaoNickname}”</span>
              입니다
            </p>

            <div className="mt-5 rounded-[28px] bg-white px-4 py-5 shadow-[0_14px_34px_rgba(37,99,235,0.10)] ring-1 ring-blue-100">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[22px] bg-red-600 text-[14px] font-black text-white shadow-[0_10px_22px_rgba(220,38,38,0.24)]">
                ▶
              </div>

              <h2 className="break-keep text-[31px] font-black leading-[1.08] tracking-[-0.08em] text-[#151923]">
                주문 확인은
                <br />
                <span className="text-blue-600">유튜브 닉네임</span>
                <br />
                으로 해요
              </h2>
            </div>

            <p className="mt-4 break-keep text-[18px] font-black leading-relaxed tracking-[-0.05em] text-blue-700">
              딱 한 번만 설정하면 끝!
            </p>
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-[15px] font-black tracking-[-0.04em] text-slate-800">
              주문서에 사용할 유튜브 닉네임
            </label>

            <input
              value={youtubeNickname}
              onChange={(event) => onYoutubeNicknameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;

                event.preventDefault();
                event.stopPropagation();

                if (isEmpty) {
                  alert("주문 확인에 사용할 유튜브 닉네임을 입력해주세요.");
                  return;
                }

                onConfirm();
              }}
              placeholder="예) 썬0218, 네즈코, 백설공쥬"
              autoFocus
              className="w-full rounded-[22px] border border-blue-100 bg-white px-4 py-4 text-[18px] font-black tracking-[-0.04em] text-[#151923] outline-none shadow-inner placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            <button
              type="button"
              disabled={isEmpty}
              onClick={() => {
                if (isEmpty) {
                  alert("주문 확인에 사용할 유튜브 닉네임을 입력해주세요.");
                  return;
                }

                onConfirm();
              }}
              className={`mt-4 flex w-full items-center justify-center rounded-[22px] px-5 py-4 text-[18px] font-black tracking-[-0.05em] transition active:scale-[0.98] ${
                isEmpty
                  ? "bg-slate-200 text-slate-400 shadow-none"
                  : "bg-blue-600 text-white shadow-[0_16px_32px_rgba(37,99,235,0.28)]"
              }`}
            >
              {isEmpty ? "유튜브 닉네임을 입력해주세요" : "닉네임 저장하고 주문하기 →"}
            </button>

            <p className="mt-4 text-center text-[13px] font-black tracking-[-0.04em] text-slate-500">
              나중에 정보수정에서 변경 가능해요
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
