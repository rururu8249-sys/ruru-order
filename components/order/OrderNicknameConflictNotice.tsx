"use client";

// components/order/OrderNicknameConflictNotice.tsx
// [2026-09-09] 닉네임이 겹쳤을 때 «막다른 길»을 없애는 화면 (용서린 사고)
//
//   예전엔: "이미 사용 중인 닉네임입니다. 뒤에 번호 4자리를 붙여 입력해 주세요."  ← 끝. 손님이 갇힌다.
//   지금은: 갈림길 하나만 묻는다 → 예전 손님이면 «계정 연결 요청», 처음이면 «다른 이름»을 만들어 준다.
//
//   화면 규칙 (사장님 지침: 손님이 무조건 이해가 가야 한다)
//     · 한 화면에 질문 하나, 버튼 최대 두 개
//     · 어려운 말 금지(계정/병합/연동 X → "예전에 주문하신 그분"으로 쓴다)
//     · 손님이 직접 이름을 «만들지» 않는다. 우리가 만들어 주고 손님은 [네] 한 번만 누른다
//
//   ⚠ 돈·포인트·주문·입금·배송 무접촉. 이 화면은 이름만 정하고, 요청을 «접수»만 한다.

import { useState } from "react";

type Step = "ask" | "phone" | "newname" | "sent";

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
  fontSize: "24px",
  fontWeight: 800,
  lineHeight: 1.2,
  letterSpacing: "-0.06em",
  color: "#151923",
  textAlign: "center",
};

const leadStyle: React.CSSProperties = {
  marginTop: "10px",
  wordBreak: "keep-all",
  fontSize: "15px",
  fontWeight: 800,
  lineHeight: 1.6,
  letterSpacing: "-0.04em",
  color: ROSE,
  textAlign: "center",
};

const bigButton = (kind: "primary" | "ghost", disabled = false): React.CSSProperties => ({
  marginTop: "10px",
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "18px",
  border: kind === "ghost" ? `1.5px solid ${ROSE}` : "none",
  padding: "17px",
  fontSize: "16.5px",
  fontWeight: 800,
  letterSpacing: "-0.05em",
  cursor: disabled ? "default" : "pointer",
  background: disabled ? "#E5E5E5" : kind === "primary" ? ROSE : "#fff",
  color: disabled ? "#999" : kind === "primary" ? "#fff" : ROSE,
});

const nameChip: React.CSSProperties = {
  margin: "16px auto 0",
  display: "block",
  width: "fit-content",
  maxWidth: "100%",
  borderRadius: "16px",
  background: "#fff",
  border: `2px solid ${ROSE}`,
  padding: "12px 20px",
  fontSize: "22px",
  fontWeight: 800,
  letterSpacing: "-0.05em",
  color: ROSE,
  wordBreak: "break-all",
  textAlign: "center",
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

function formatPhoneInput(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function OrderNicknameConflictNotice({
  nickname,
  myPhoneDigits,
  kakaoId,
  kakaoNickname,
  onUseNickname,
  onBack,
}: Props) {
  const [step, setStep] = useState<Step>("ask");
  const [phone, setPhone] = useState("");
  const [tempNickname, setTempNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const call = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/customer-link-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, customer_phone: myPhoneDigits, kakao_id: kakaoId, kakao_nickname: kakaoNickname, ...payload }),
    });
    return (await res.json().catch(() => null)) as any;
  };

  // [아니요, 처음이에요] → 우리가 겹치지 않는 이름을 만들어 준다
  const goNewName = async () => {
    setBusy(true);
    setError("");
    try {
      const json = await call({ action: "check" });
      const suggestion = String(json?.suggestion || "").trim();
      if (!suggestion) throw new Error("no_suggestion");
      setTempNickname(suggestion);
      setStep("newname");
    } catch {
      setError("잠시 후 다시 눌러주세요.");
    } finally {
      setBusy(false);
    }
  };

  // [네, 제가 그 사람이에요] → 예전 번호로 본인 확인 후 «접수»
  const submitClaim = async () => {
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length < 9) {
      setError("전화번호를 끝까지 넣어주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const json = await call({ action: "claim", claimed_phone: digits });
      // 계정이 갈라진 게 아니라 «같은 카톡, 새 폰»이었을 때 — 원래 이름 그대로 통과
      if (json?.ok && json?.same_account) {
        onUseNickname(nickname);
        return;
      }
      if (json?.ok) {
        setTempNickname(String(json?.temp_nickname || "").trim());
        setStep("sent");
        return;
      }
      if (json?.reason === "not_found") {
        setError(`그 번호로 「${nickname}」 이름의 주문 기록을 못 찾았어요.\n\n예전에 주문할 때 쓰신 번호가 맞는지 확인해 주세요.`);
        return;
      }
      if (json?.reason === "bad_phone") {
        setError("전화번호를 다시 확인해 주세요.");
        return;
      }
      if (json?.reason === "too_many") {
        setError("요청이 이미 접수돼 있어요. 조금만 기다려 주세요.");
        return;
      }
      setError("잠시 후 다시 시도해 주세요.");
    } catch {
      setError("잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrapStyle}>
      <section style={cardStyle}>
        <div style={innerStyle}>
          {step === "ask" ? (
            <>
              <h2 style={titleStyle}>
                「{nickname}」
                <br />
                이 이름을 쓰는 분이 이미 계세요
              </h2>
              <p style={leadStyle}>혹시 예전에 이 이름으로 주문하셨던 분인가요?</p>

              <button type="button" style={bigButton("primary")} onClick={() => { setError(""); setStep("phone"); }}>
                네, 제가 그 사람이에요
              </button>
              <button type="button" disabled={busy} style={bigButton("ghost", busy)} onClick={() => void goNewName()}>
                {busy ? "잠시만요…" : "아니요, 저는 처음이에요"}
              </button>
              <button
                type="button"
                onClick={onBack}
                style={{ marginTop: "14px", display: "block", width: "100%", border: "none", background: "transparent", fontSize: "13.5px", fontWeight: 800, letterSpacing: "-0.04em", color: "#8A8A8A", cursor: "pointer" }}
              >
                다른 이름을 직접 쓸래요
              </button>
            </>
          ) : null}

          {step === "phone" ? (
            <>
              <h2 style={titleStyle}>예전에 주문하실 때 쓰신 전화번호를 넣어주세요</h2>
              <p style={leadStyle}>번호가 맞으면 예전 주문·포인트를 그대로 이어드려요.</p>

              <input
                inputMode="numeric"
                value={phone}
                onChange={(event) => { setPhone(formatPhoneInput(event.target.value)); setError(""); }}
                onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                placeholder="010-0000-0000"
                autoFocus
                style={{ marginTop: "16px", width: "100%", boxSizing: "border-box", borderRadius: "18px", border: `1.5px solid ${error ? "#FCA5A5" : "#D9C5CC"}`, background: "#fff", padding: "16px", fontSize: "19px", fontWeight: 800, letterSpacing: "-0.02em", color: "#151923", outline: "none", textAlign: "center" }}
              />

              {error ? <div style={errorBox}>{error}</div> : null}

              <button type="button" disabled={busy} style={bigButton("primary", busy)} onClick={() => void submitClaim()}>
                {busy ? "확인 중…" : "확인하기"}
              </button>
              <button type="button" disabled={busy} style={bigButton("ghost", busy)} onClick={() => void goNewName()}>
                예전 번호가 기억 안 나요
              </button>
            </>
          ) : null}

          {step === "newname" ? (
            <>
              <h2 style={titleStyle}>헷갈리지 않게 이 이름으로 해드릴게요</h2>
              <div style={nameChip}>{tempNickname}</div>
              <p style={leadStyle}>
                입금하실 때도 이 이름으로 보내주시면
                <br />
                주문이 바로 확인돼요.
              </p>

              <button type="button" style={bigButton("primary")} onClick={() => onUseNickname(tempNickname)}>
                네, 이 이름으로 할게요
              </button>
              <button
                type="button"
                onClick={onBack}
                style={{ marginTop: "14px", display: "block", width: "100%", border: "none", background: "transparent", fontSize: "13.5px", fontWeight: 800, letterSpacing: "-0.04em", color: "#8A8A8A", cursor: "pointer" }}
              >
                다른 이름을 직접 쓸래요
              </button>
            </>
          ) : null}

          {step === "sent" ? (
            <>
              <div style={{ margin: "0 auto", display: "flex", height: "64px", width: "64px", alignItems: "center", justifyContent: "center", borderRadius: "24px", background: "#F9EDF1", border: "1px solid #E8D5DD", fontSize: "32px" }}>✅</div>
              <h2 style={{ ...titleStyle, marginTop: "16px" }}>확인됐어요!</h2>
              <p style={leadStyle}>
                예전 주문·포인트를 이 계정으로 이어드릴게요.
                <br />
                사장님이 확인하면 바로 연결됩니다.
              </p>

              <div style={{ marginTop: "16px", borderRadius: "16px", background: "#F5E6EB", padding: "14px 16px", textAlign: "center", wordBreak: "keep-all", fontSize: "13.5px", fontWeight: 800, lineHeight: 1.7, letterSpacing: "-0.04em", color: ROSE }}>
                연결되기 전까지는 이 이름으로 주문해 주세요
              </div>
              <div style={nameChip}>{tempNickname}</div>

              <button type="button" style={bigButton("primary")} onClick={() => onUseNickname(tempNickname)}>
                네, 알겠어요
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
