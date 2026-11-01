"use client";
// components/customer/SubscribeFreeShipCard.tsx
// [2026-11-01 사장님] 구독 인증 무료배송 — 손님 화면 카드(주문서 확인 금액표 위) + 첫 화면 한 줄(strip).
//   · 캡처를 올리면 /api/subscribe-verify 가 AI 로 「채널 이름 + 그 채널의 구독중」을 확인 → 인증 기록만 남김.
//   · 배송비 계산은 하지 않는다(부모가 인증 결과로 다시 계산, 서버도 다시 확인). 표시·업로드 전용.
//   · DESIGN.md: 흰 바탕·검정 알약 주버튼·13px 이상·로즈 없음.
import { useRef, useState } from "react";

type Props = {
  variant: "card" | "strip";
  channelName: string;
  exampleUrl: string;
  groupsText: string; // 예: 「일반배송·업체배송1」
  verified: boolean;
  /** 이번 주문서에서 빠지는 배송비(원) — 0이면 금액 문구 없음 */
  waivedAmount?: number;
  kakaoId: string;
  customerPhone?: string;
  youtubeNickname?: string;
  onVerified: () => void;
  /** strip 을 눌렀을 때 — 부모가 카드 창을 연다 */
  onOpenDetail?: () => void;
};

const C = { ink: "#111111", mute: "#707072", line: "#E5E5E5", soft: "#F5F5F5", ok: "#007D48", okBg: "#E8F5EE", bad: "#D30005" };

async function fileToJpegDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("사진을 열 수 없어요"));
      el.src = url;
    });
    const max = 1600;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("사진을 열 수 없어요");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SubscribeFreeShipCard(props: Props) {
  const { variant, channelName, exampleUrl, groupsText, verified, waivedAmount = 0 } = props;
  const [state, setState] = useState<"idle" | "checking" | "fail">("idle");
  const [reason, setReason] = useState("");
  const [zoom, setZoom] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (variant === "strip") {
    return (
      <button
        type="button"
        onClick={props.onOpenDetail}
        style={{ marginTop: "8px", width: "100%", minHeight: "44px", display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", border: `1px solid ${verified ? C.ok : C.line}`, borderRadius: "12px", background: verified ? C.okBg : "#FFFFFF", color: verified ? C.ok : C.ink, fontSize: "14px", fontWeight: 600, textAlign: "left", cursor: "pointer", fontFamily: "inherit", wordBreak: "keep-all" }}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          {verified ? <>구독 인증됐어요 · {groupsText} 배송비 무료</> : <>지금 유튜브 구독 인증하면 <b style={{ fontWeight: 700 }}>배송비 무료</b></>}
        </span>
        {verified ? null : <span style={{ flexShrink: 0, fontSize: "13px", color: C.mute, textDecoration: "underline", textUnderlineOffset: "3px" }}>방법</span>}
      </button>
    );
  }

  if (verified) {
    return (
      <div role="status" style={{ display: "flex", alignItems: "center", gap: "8px", borderRadius: "8px", background: C.okBg, border: `1px solid ${C.ok}`, padding: "12px 14px", color: C.ok, fontSize: "15px", fontWeight: 600, lineHeight: 1.5, wordBreak: "keep-all" }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></svg>
        <span>구독 인증됐어요 · {waivedAmount > 0 ? `배송비 ${waivedAmount.toLocaleString()}원 무료` : `${groupsText} 배송비 무료`}</span>
      </div>
    );
  }

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!props.kakaoId) {
      setState("fail");
      setReason("카카오 로그인 후 올릴 수 있어요.");
      return;
    }
    setState("checking");
    setReason("");
    try {
      const image = await fileToJpegDataUrl(file);
      const res = await fetch("/api/subscribe-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ kakao_id: props.kakaoId, customer_phone: props.customerPhone || "", youtube_nickname: props.youtubeNickname || "", image }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok && json.verified) {
        setState("idle");
        props.onVerified();
        return;
      }
      setState("fail");
      setReason(String(json?.reason || json?.message || "확인하지 못했어요. 다시 올려 주세요."));
    } catch (e) {
      setState("fail");
      setReason(e instanceof Error ? e.message : "확인하지 못했어요. 다시 올려 주세요.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ border: `1.5px solid ${C.ink}`, borderRadius: "8px", padding: "14px", background: "#FFFFFF", color: C.ink }}>
      <div style={{ fontSize: "16px", fontWeight: 700 }}>구독 인증하면 배송비 무료</div>
      <div style={{ marginTop: "2px", fontSize: "14px", color: C.mute, lineHeight: 1.5, wordBreak: "keep-all" }}>
        {groupsText} 배송비가 무료예요. 「{channelName}」 채널 이름과 「구독중」이 같이 보이게 캡처해 올려 주세요.
      </div>

      <div style={{ display: "flex", gap: "12px", margin: "12px 0" }}>
        <button type="button" onClick={() => setZoom(true)} aria-label="예시 사진 크게 보기" style={{ flexShrink: 0, width: "84px", padding: 0, border: `1px solid ${C.line}`, borderRadius: "8px", background: C.soft, overflow: "hidden", cursor: "zoom-in" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={exampleUrl} alt="구독중 캡처 예시" style={{ display: "block", width: "100%", height: "80px", objectFit: "cover", objectPosition: "top" }} />
          <span style={{ display: "block", padding: "2px 0", fontSize: "13px", color: C.mute }}>예시</span>
        </button>
        <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "14px", lineHeight: 1.7, color: "#39393B", wordBreak: "keep-all" }}>
          <li>아래 「유튜브 채널 열기」</li>
          <li>「구독」 누르기</li>
          <li>채널 이름·「구독중」 보이게 캡처</li>
          <li>「캡처 올리기」</li>
        </ol>
      </div>

      {state === "checking" ? (
        <div role="status" style={{ height: "52px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", background: C.soft, fontSize: "15px", fontWeight: 600, color: C.mute }}>확인하고 있어요 (5초쯤)</div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} style={{ width: "100%", height: "52px", border: "none", borderRadius: "9999px", background: C.ink, color: "#FFFFFF", fontSize: "16px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {state === "fail" ? "다시 올리기" : "캡처 올리기"}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      <a href="/youtube" target="_blank" rel="noopener" style={{ marginTop: "8px", width: "100%", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #CACACB", borderRadius: "9999px", color: C.ink, fontSize: "15px", fontWeight: 600, textDecoration: "none", boxSizing: "border-box" }}>
        유튜브 채널 열기
      </a>

      {state === "fail" && reason ? (
        <div role="alert" style={{ marginTop: "10px", fontSize: "14px", fontWeight: 600, color: C.bad, lineHeight: 1.5, wordBreak: "keep-all" }}>{reason}</div>
      ) : null}
      <div style={{ marginTop: "8px", fontSize: "13px", color: C.mute, wordBreak: "keep-all" }}>안 해도 주문은 그대로 돼요(배송비만 붙어요).</div>

      {zoom ? (
        <div role="dialog" aria-label="예시 사진" onClick={() => setZoom(false)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={exampleUrl} alt="구독중 캡처 예시" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: "8px" }} />
          <div style={{ marginTop: "12px", color: "#FFFFFF", fontSize: "15px", fontWeight: 600, textAlign: "center", wordBreak: "keep-all" }}>빨간 테두리처럼 채널 이름과 「구독중」이 같이 보여야 해요</div>
          <button type="button" onClick={() => setZoom(false)} style={{ marginTop: "12px", height: "44px", padding: "0 24px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: C.ink, fontSize: "15px", fontWeight: 600 }}>닫기</button>
        </div>
      ) : null}
    </div>
  );
}
