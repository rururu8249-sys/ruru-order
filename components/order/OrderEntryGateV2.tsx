"use client";

// components/order/OrderEntryGateV2.tsx
// 목적: 주문 전 카카오 간편주문 전용 진입 화면
// 주의:
// - UI 전용 컴포넌트입니다.
// - 주문 저장, 배송비, 합배송, 입금매칭, Supabase 로직 없음.
// - 고객 화면은 카카오 간편주문 전용으로 표시합니다.

type OrderEntryGateV2Props = {
  loginName: string;
  loginPhone: string;
  onLoginNameChange: (value: string) => void;
  onLoginPhoneChange: (value: string) => void;
  onLoadCustomer: () => void;
  onStartNew: () => void;
  onKakaoLogin: () => void;
};

export default function OrderEntryGateV2({ onKakaoLogin }: OrderEntryGateV2Props) {
  return (
    <section style={{ display: "grid", gap: "16px" }}>
      <section style={{ overflow: "hidden", borderRadius: "28px", background: "linear-gradient(to bottom, #ffffff, #F5E6EB)", padding: "28px 20px", border: "1px solid #D9C5CC", boxShadow: "0 22px 55px rgba(123,45,67,0.13)" }}>
        <div style={{ margin: "0 auto", display: "flex", width: "fit-content", alignItems: "center", justifyContent: "center", gap: "12px", borderRadius: "999px", background: "rgba(255,255,255,0.9)", padding: "8px 16px", border: "1px solid #D9C5CC" }}>
          <div style={{ display: "flex", height: "36px", width: "36px", alignItems: "center", justifyContent: "center", borderRadius: "13px", background: "#7B2D43", fontSize: "17px", fontWeight: 800, color: "#fff" }}>
            R
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#bbb" }}>×</div>
          <div style={{ display: "flex", height: "36px", width: "36px", alignItems: "center", justifyContent: "center", borderRadius: "13px", background: "#fee500", fontSize: "13px", fontWeight: 800, color: "#241b17" }}>
            TALK
          </div>
        </div>

        <div style={{ marginTop: "28px", textAlign: "center" }}>
          <h1 style={{ wordBreak: "keep-all", fontSize: "35px", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.085em", color: "#151923" }}>
            <span style={{ color: "#7B2D43" }}>주문은</span>
            <span style={{ color: "#151923" }}> 카카오로 시작</span>
          </h1>
          <p style={{ marginTop: "16px", wordBreak: "keep-all", fontSize: "20px", fontWeight: 800, lineHeight: 1.6, letterSpacing: "-0.06em", color: "#666" }}>
            카카오 로그인 후 주문서를 작성합니다.
          </p>
        </div>

        <div style={{ position: "relative", marginTop: "28px", overflow: "hidden", borderRadius: "28px", background: "#FAF6F2", border: "1px solid #D9C5CC", padding: "28px 16px" }}>
          <button
            type="button"
            onClick={onKakaoLogin}
            style={{ position: "relative", zIndex: 10, margin: "0 auto", display: "flex", width: "100%", maxWidth: "360px", alignItems: "center", justifyContent: "center", borderRadius: "22px", border: "none", background: "#fee500", padding: "20px", color: "#241b17", boxShadow: "0 18px 36px rgba(234,179,8,0.28)", cursor: "pointer" }}
          >
            <span style={{ marginRight: "12px", display: "flex", height: "40px", width: "40px", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "#241b17", fontSize: "12px", fontWeight: 800, color: "#fee500" }}>
              TALK
            </span>
            <span style={{ minWidth: 0, flex: 1, textAlign: "center", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.055em" }}>
              카카오로 주문 시작하기
            </span>
            <span style={{ marginLeft: "12px", fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>›</span>
          </button>
        </div>

        <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", overflow: "hidden", borderRadius: "22px", background: "rgba(255,255,255,0.85)", border: "1px solid #D9C5CC" }}>
          <div style={{ borderRight: "1px solid #D9C5CC", padding: "16px 8px", textAlign: "center" }}>
            <div style={{ fontSize: "22px" }}>📍</div>
            <div style={{ marginTop: "4px", wordBreak: "keep-all", fontSize: "12px", fontWeight: 800, color: "#555" }}>정보확인</div>
          </div>
          <div style={{ borderRight: "1px solid #D9C5CC", padding: "16px 8px", textAlign: "center" }}>
            <div style={{ fontSize: "22px" }}>📝</div>
            <div style={{ marginTop: "4px", wordBreak: "keep-all", fontSize: "12px", fontWeight: 800, color: "#555" }}>주문작성</div>
          </div>
          <div style={{ padding: "16px 8px", textAlign: "center" }}>
            <div style={{ fontSize: "22px" }}>🔒</div>
            <div style={{ marginTop: "4px", wordBreak: "keep-all", fontSize: "12px", fontWeight: 800, color: "#555" }}>주문조회</div>
          </div>
        </div>
      </section>
    </section>
  );
}
