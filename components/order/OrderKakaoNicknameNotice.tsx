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
  const isEmpty = youtubeNickname.trim().length === 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.68)", padding: "16px 12px" }}>
      <section style={{ maxHeight: "92svh", width: "100%", maxWidth: "430px", overflowY: "auto", borderRadius: "28px", background: "#fff", boxShadow: "0 30px 90px rgba(15,23,42,0.42)" }}>
        <div style={{ background: "linear-gradient(to bottom, #ffffff, #F5E6EB)", padding: "22px 18px" }}>
          <div style={{ margin: "0 auto 16px", display: "flex", width: "fit-content", alignItems: "center", gap: "8px", borderRadius: "999px", background: "#fee500", padding: "8px 16px", fontSize: "13px", fontWeight: 800, color: "#241b17" }}>
            <span style={{ display: "flex", height: "28px", width: "28px", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "#241b17", fontSize: "12px", color: "#fee500" }}>TALK</span>
            카카오 로그인 완료
          </div>

          <div style={{ textAlign: "center" }}>
            <h2 style={{ wordBreak: "keep-all", fontSize: "25px", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.07em", color: "#151923" }}>
              유튜브 닉네임을 입력해 주세요
            </h2>
            <p style={{ marginTop: "8px", wordBreak: "keep-all", fontSize: "15px", fontWeight: 800, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#7B2D43" }}>
              방송 채팅에서 쓰는 이름으로 주문·입금을 확인해요.
            </p>
          </div>

          <div style={{ marginTop: "16px" }}>
            <label htmlFor="youtubeNicknameInput" style={{ marginBottom: "8px", display: "block", fontSize: "15px", fontWeight: 800, letterSpacing: "-0.04em", color: "#333" }}>
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
              style={{ width: "100%", boxSizing: "border-box", borderRadius: "18px", border: `1.5px solid ${errorMessage ? "#FCA5A5" : "#D9C5CC"}`, background: "#fff", padding: "16px", fontSize: "17px", fontWeight: 800, letterSpacing: "-0.04em", color: "#151923", outline: "none" }}
            />

            {errorMessage && (
              <div style={{ marginTop: "12px", whiteSpace: "pre-line", wordBreak: "keep-all", borderRadius: "16px", border: "1px solid #FECACA", background: "#FEF2F2", padding: "12px 16px", fontSize: "13px", fontWeight: 800, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#B91C1C" }}>
                {errorMessage}
              </div>
            )}

            <div style={{ marginTop: "12px", wordBreak: "keep-all", borderRadius: "16px", background: "#F5E6EB", padding: "12px 16px", textAlign: "center", fontSize: "12px", fontWeight: 800, lineHeight: 1.6, letterSpacing: "-0.04em", color: "#7B2D43" }}>
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
              style={{ marginTop: "16px", display: "flex", width: "100%", alignItems: "center", justifyContent: "center", borderRadius: "18px", border: "none", padding: "16px", fontSize: "16px", fontWeight: 800, letterSpacing: "-0.05em", cursor: isEmpty ? "default" : "pointer", background: isEmpty ? "#E5E5E5" : "#7B2D43", color: isEmpty ? "#999" : "#fff" }}
            >
              {isEmpty ? "유튜브 닉네임을 입력해 주세요" : "유튜브 닉네임 저장하고 주문서 작성하기"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
