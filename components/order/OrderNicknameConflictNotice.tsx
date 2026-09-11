"use client";

// components/order/OrderNicknameConflictNotice.tsx
// [2026-09-11 사장님 결정 · 전면 단순화] 닉네임이 겹치면 «아무것도 묻지 않는다».
//
//   예전(09-09): "예전에 주문하신 분인가요?" → 예전 번호 입력 → 접수… 4단계. 손님도 사장님도 헷갈렸다.
//   지금(09-11): 화면 하나. 「A」는 이미 쓰는 분이 계셔서 닉네임 뒤에 전화번호 끝 4자리를 붙였어요 「A2204」 → [확인] 끝.
//   ⚠ 문구에 «이름»이라 쓰지 않는다(사장님 지적 09-11) — 손님이 실명으로 오해한다. «닉네임 + 번호 끝 4자리»라고 그대로 말한다.
//
//   «누구인지»는 손님한테 안 묻는다. 시스템이 주소로 알아낸다.
//     · 주소·상세주소가 예전 회원과 같으면 DB 트리거(ruru_detect_split_account)가
//       customer_link_requests 에 «자동 감지» 한 줄을 넣는다 → 사장님이 [합치기] 한 번.
//     · 그래서 이 화면은 «이름만» 정한다. 요청 접수도, 번호 확인도 없다.
//
//   화면 규칙 (사장님 지침: 손님이 무조건 이해가 가야 한다)
//     · 질문 없음. 버튼 하나(확인). 조용한 글자 링크 하나(다른 이름으로 할래요).
//     · 어려운 말 금지(계정/병합/연동 X)
//
//   ⚠ 돈·포인트·주문·입금·배송 무접촉. 이 화면은 이름 하나 정해서 돌려줄 뿐이다.
//   ⚠ 여기서 정한 이름이 남과 겹칠 수는 없다 — /api/customer-link-request check 가 DB 에서 빈 이름을 고르고,
//      혹시라도 겹치면 DB 트리거(ruru_guard_nickname_takeover)가 저장을 막는다.

import { useEffect, useState } from "react";

type Props = {
  nickname: string;
  myPhoneDigits: string;
  kakaoId: string;
  kakaoNickname: string;
  /** 이 이름으로 진행 (관문 통과) */
  onUseNickname: (nickname: string) => void;
  /** 이름을 처음부터 다시 쓰기 */
  onBack: () => void;
};

const ROSE = "#7B2D43";

const wrapStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(15,23,42,0.68)",
  padding: "16px 12px",
};

const cardStyle: React.CSSProperties = {
  maxHeight: "92svh",
  width: "100%",
  maxWidth: "430px",
  overflowY: "auto",
  borderRadius: "28px",
  background: "#fff",
  boxShadow: "0 30px 90px rgba(15,23,42,0.42)",
};

const innerStyle: React.CSSProperties = {
  background: "linear-gradient(to bottom, #ffffff, #F5E6EB)",
  padding: "24px 18px",
};

const titleStyle: React.CSSProperties = {
  wordBreak: "keep-all",
  textWrap: "balance",
  fontSize: "20px",
  fontWeight: 800,
  lineHeight: 1.35,
  letterSpacing: "-0.05em",
  color: "#151923",
  textAlign: "center",
};

const leadStyle: React.CSSProperties = {
  marginTop: "12px",
  wordBreak: "keep-all",
  fontSize: "14.5px",
  fontWeight: 800,
  lineHeight: 1.6,
  letterSpacing: "-0.04em",
  color: ROSE,
  textAlign: "center",
};

const nameChip: React.CSSProperties = {
  margin: "18px auto 0",
  display: "block",
  width: "fit-content",
  maxWidth: "100%",
  borderRadius: "16px",
  background: "#fff",
  border: `2px solid ${ROSE}`,
  padding: "14px 24px",
  fontSize: "26px",
  fontWeight: 800,
  letterSpacing: "-0.04em",
  color: ROSE,
  wordBreak: "break-all",
  textAlign: "center",
};

const primaryButton = (disabled: boolean): React.CSSProperties => ({
  marginTop: "18px",
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "18px",
  border: "none",
  padding: "17px",
  fontSize: "17px",
  fontWeight: 800,
  letterSpacing: "-0.05em",
  cursor: disabled ? "default" : "pointer",
  background: disabled ? "#E5E5E5" : ROSE,
  color: disabled ? "#999" : "#fff",
});

const quietLink: React.CSSProperties = {
  marginTop: "14px",
  display: "block",
  width: "100%",
  border: "none",
  background: "transparent",
  fontSize: "13.5px",
  fontWeight: 800,
  letterSpacing: "-0.04em",
  color: "#8A8A8A",
  cursor: "pointer",
};

const infoBox: React.CSSProperties = {
  marginTop: "16px",
  borderRadius: "16px",
  background: "#F5E6EB",
  padding: "12px 14px",
  textAlign: "center",
  wordBreak: "keep-all",
  fontSize: "12.5px",
  fontWeight: 800,
  lineHeight: 1.65,
  letterSpacing: "-0.04em",
  color: ROSE,
};

const errorBox: React.CSSProperties = {
  marginTop: "12px",
  whiteSpace: "pre-line",
  wordBreak: "keep-all",
  borderRadius: "16px",
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  padding: "12px 16px",
  fontSize: "13.5px",
  fontWeight: 800,
  lineHeight: 1.6,
  letterSpacing: "-0.04em",
  color: "#B91C1C",
};

export default function OrderNicknameConflictNotice({
  nickname,
  myPhoneDigits,
  kakaoId,
  kakaoNickname,
  onUseNickname,
  onBack,
}: Props) {
  const [suggestion, setSuggestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tryCount, setTryCount] = useState(0);

  // 화면이 뜨는 순간 «빈 닉네임»을 서버에서 하나 받아온다 (1순위: 닉네임 + 내 번호 끝 4자리, 번호 모르면 닉네임 + 2, 3…)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch("/api/customer-link-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "check",
            nickname,
            customer_phone: myPhoneDigits,
            kakao_id: kakaoId,
            kakao_nickname: kakaoNickname,
          }),
        });
        const json = (await res.json().catch(() => null)) as any;
        const picked = String(json?.suggestion || "").trim();
        if (!picked) throw new Error("no_suggestion");
        if (alive) setSuggestion(picked);
      } catch {
        if (alive) setError("닉네임을 만들지 못했어요.\n잠시 후 다시 눌러주세요.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [nickname, myPhoneDigits, kakaoId, kakaoNickname, tryCount]);

  const canConfirm = !loading && !error && suggestion.length > 0;

  // 붙인 게 «내 전화번호 끝 4자리»인지(1순위), 아니면 그냥 숫자인지(번호를 아직 모를 때 2, 3, …)
  const last4 = myPhoneDigits.length >= 4 ? myPhoneDigits.slice(-4) : "";
  const appended = suggestion.startsWith(nickname) ? suggestion.slice(nickname.length) : "";
  const isPhoneTail = Boolean(last4) && appended === last4;

  return (
    <div style={wrapStyle}>
      <section style={cardStyle}>
        <div style={innerStyle}>
          <h2 style={titleStyle}>
            「{nickname}」는 이미 쓰는 분이 계셔서 닉네임 뒤에 {isPhoneTail ? "전화번호 끝 4자리를" : "숫자를"} 붙였어요
          </h2>

          <div style={nameChip}>{loading ? "…" : suggestion || "—"}</div>

          <p style={leadStyle}>
            {isPhoneTail ? `${nickname} + 내 번호 끝 ${last4}` : `${nickname} + ${appended || "숫자"}`}
            <br />
            입금하실 때도 이 닉네임으로 보내주시면
            <br />
            주문이 바로 확인돼요.
          </p>

          {error ? <div style={errorBox}>{error}</div> : null}

          {error ? (
            <button type="button" style={primaryButton(false)} onClick={() => setTryCount((n) => n + 1)}>
              다시 시도
            </button>
          ) : (
            <button type="button" disabled={!canConfirm} style={primaryButton(!canConfirm)} onClick={() => onUseNickname(suggestion)}>
              {loading ? "잠시만요…" : "확인"}
            </button>
          )}

          <button type="button" onClick={onBack} style={quietLink}>
            다른 닉네임으로 할래요
          </button>

          <div style={infoBox}>
            예전에 주문하셨던 분이면 주소를 그대로 쓰세요.
            <br />
            사장님이 확인해서 예전 주문·포인트를 이어드려요.
          </div>
        </div>
      </section>
    </div>
  );
}
