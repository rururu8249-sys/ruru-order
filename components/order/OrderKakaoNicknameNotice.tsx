// components/order/OrderKakaoNicknameNotice.tsx
// 목적: 카카오톡 로그인 후 유튜브 닉네임 1회 강제 확인 모달
// 주의:
// - UI/로컬 상태 전용 컴포넌트입니다.
// - 주문 저장, 고객 병합, 입금매칭, 정산, 배송비 로직을 건드리지 않습니다.
// - 유튜브 닉네임은 사람마다 다양하므로 빈칸만 막고 1글자/이모지/특수문자도 허용합니다.
// - 입력 중 자동 진행 금지. 엔터키 진행 금지. 반드시 버튼 클릭/터치로만 저장합니다.
// - [2026-10-22 손님화면 리뉴얼 — 진입] DESIGN.md 기준 색·크기만 변경(로즈 없음·검정 알약 52px·입력칸 48px/24px). 문구·저장 동작 무변경.

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
  const isEmpty = youtubeNickname.trim().length === 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: "16px" }}>
      <section style={{ maxHeight: "92svh", width: "100%", maxWidth: "430px", overflowY: "auto", borderRadius: "24px", background: "#FFFFFF", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
        <div style={{ background: "#FFFFFF", padding: "24px 16px" }}>
          <div style={{ margin: "0 auto 16px", display: "flex", width: "fit-content", alignItems: "center", gap: "8px", borderRadius: "999px", background: "#FEE500", padding: "8px 16px", fontSize: "13px", fontWeight: 600, color: "#191919" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#191919" d="M12 3C6.48 3 2 6.58 2 11c0 2.86 1.88 5.37 4.7 6.78l-1 3.66a.4.4 0 0 0 .6.44l4.3-2.85c.46.05.93.07 1.4.07 5.52 0 10-3.58 10-8S17.52 3 12 3Z" /></svg>
            카카오톡 로그인 완료
          </div>

          <div style={{ textAlign: "center" }}>
            <h2 style={{ wordBreak: "keep-all", fontSize: "24px", fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.02em", color: "#111111" }}>
              유튜브 닉네임을 입력해 주세요
            </h2>
            <p style={{ marginTop: "8px", wordBreak: "keep-all", fontSize: "16px", fontWeight: 400, lineHeight: 1.5, color: "#39393B" }}>
              방송 채팅에서 쓰는 이름으로 주문·입금을 확인해요.
            </p>
          </div>

          <div style={{ marginTop: "16px" }}>
            <label htmlFor="youtubeNicknameInput" style={{ marginBottom: "8px", display: "block", fontSize: "15px", fontWeight: 600, color: "#111111" }}>
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
              style={{ width: "100%", boxSizing: "border-box", height: "48px", borderRadius: "24px", border: errorMessage ? "2px solid #D30005" : "1px solid #CACACB", background: "#FFFFFF", padding: "0 18px", fontSize: "17px", fontWeight: 600, color: "#111111", outline: "none" }}
            />

            {errorMessage && (
              <div style={{ marginTop: "12px", whiteSpace: "pre-line", wordBreak: "keep-all", padding: "0 4px", fontSize: "13px", fontWeight: 600, lineHeight: 1.5, color: "#D30005" }}>
                {errorMessage}
              </div>
            )}

            <div style={{ marginTop: "12px", wordBreak: "keep-all", borderRadius: "16px", background: "#F5F5F5", padding: "12px 16px", textAlign: "center", fontSize: "13px", fontWeight: 400, lineHeight: 1.5, color: "#39393B" }}>
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
              style={{ marginTop: "16px", display: "flex", width: "100%", alignItems: "center", justifyContent: "center", minHeight: "52px", borderRadius: "9999px", border: "none", padding: "8px 20px", wordBreak: "keep-all", lineHeight: 1.35, fontSize: "16px", fontWeight: 600, cursor: isEmpty ? "default" : "pointer", background: isEmpty ? "#E5E5E5" : "#111111", color: isEmpty ? "#707072" : "#FFFFFF" }}
            >
              {isEmpty ? "유튜브 닉네임을 입력해 주세요" : "유튜브 닉네임 저장하고 주문서 작성하기"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
