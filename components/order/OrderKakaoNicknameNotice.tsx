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
  errorMessage?: string;
  onYoutubeNicknameChange: (value: string) => void;
  onConfirm: () => void | Promise<void>;
};

export default function OrderKakaoNicknameNotice({
  kakaoNickname,
  youtubeNickname,
  errorMessage = "",
  onYoutubeNicknameChange,
  onConfirm,
}: OrderKakaoNicknameNoticeProps) {
  const displayKakaoNickname = kakaoNickname.trim() || "확인되지 않음";
  const isEmpty = youtubeNickname.trim().length === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/68 px-3 py-4 backdrop-blur-[3px]">
      <section className="max-h-[92svh] w-full max-w-[430px] overflow-y-auto rounded-[30px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.42)] ring-1 ring-white/70">
        <div className="bg-gradient-to-b from-white via-white to-blue-50 px-4 pb-5 pt-5 sm:px-6 sm:pb-7 sm:pt-6">
          <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full bg-[#fee500] px-4 py-2 text-[13px] font-black tracking-[-0.04em] text-[#241b17] shadow-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#241b17] text-[14px] text-[#fee500]">
              TALK
            </span>
            카카오 로그인 완료
          </div>

          <div className="text-center">
            <p className="break-keep text-[14px] font-black leading-relaxed tracking-[-0.04em] text-slate-500">
              카카오 이름: <span className="text-slate-800">“{displayKakaoNickname}”</span>
            </p>

            <div className="mt-4 rounded-[26px] bg-white px-4 py-5 shadow-[0_14px_34px_rgba(37,99,235,0.10)] ring-1 ring-blue-100">
              <h2 className="break-keep text-[26px] font-black leading-[1.12] tracking-[-0.07em] text-[#151923] sm:text-[30px]">
                유튜브 닉네임을
                <br />
                딱 1번만 입력해 주세요
              </h2>

              <p className="mt-3 break-keep text-[14px] font-black leading-relaxed tracking-[-0.04em] text-blue-700">
                방송 채팅에서 쓰는 이름으로
                <br />
                주문 확인과 입금 확인을 진행합니다.
              </p>
            </div>

            <p className="mt-4 break-keep rounded-[20px] bg-slate-50 px-4 py-3 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-slate-600">
              카카오 이름이 아니라
              <br />
              <span className="text-slate-950">유튜브 라이브 채팅에 보이는 닉네임</span>을 입력해 주세요.
            </p>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-[15px] font-black tracking-[-0.04em] text-slate-800">
              유튜브 닉네임 입력
            </label>

            <input
              id="youtubeNicknameInput"
              value={youtubeNickname}
              onChange={(event) => onYoutubeNicknameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.stopPropagation();
              }}
              placeholder="예) BTS, 블랙핑크, 홍길동"
              autoFocus
              className={`w-full rounded-[22px] border bg-white px-4 py-4 text-[17px] font-black tracking-[-0.04em] text-[#151923] outline-none shadow-inner placeholder:text-slate-400 focus:ring-4 ${
                errorMessage
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-blue-100 focus:border-blue-500 focus:ring-blue-100"
              }`}
            />

            {errorMessage && (
              <div className="mt-3 whitespace-pre-line break-keep rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-black leading-relaxed tracking-[-0.04em] text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="mt-3 break-keep rounded-[20px] bg-blue-50 px-4 py-3 text-center text-[12px] font-black leading-relaxed tracking-[-0.04em] text-blue-700">
              닉네임이 중복되면
              <br />
              닉네임 뒤에 전화번호 끝 4자리를 붙여 입력해 주세요.
              <br />
              예) 홍길동1234
            </div>

            <button
              type="button"
              disabled={isEmpty}
              onClick={() => void onConfirm()}
              className={`mt-4 flex w-full items-center justify-center rounded-[22px] px-4 py-4 text-[16px] font-black tracking-[-0.05em] transition active:scale-[0.98] ${
                isEmpty
                  ? "bg-slate-200 text-slate-400 shadow-none"
                  : "bg-blue-600 text-white shadow-[0_16px_32px_rgba(37,99,235,0.28)]"
              }`}
            >
              {isEmpty ? "유튜브 닉네임을 입력해 주세요" : "유튜브 닉네임 저장하고 주문서 작성하기"}
            </button>

            <p className="mt-3 break-keep text-center text-[12px] font-black leading-relaxed tracking-[-0.04em] text-slate-400">
              한 번 저장하면 다음 카카오 로그인부터 자동으로 불러옵니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
