"use client";
// components/customer/SubscribeFreeShipCard.tsx
// [2026-11-01 사장님] 구독 인증 무료배송 — 손님 화면 카드(주문서 확인 금액표 위) + 첫 화면 한 줄(strip).
//   · 캡처를 올리면 /api/subscribe-verify 가 AI 로 「채널 이름 + 그 채널의 구독중」을 확인 → 인증 기록만 남김.
//   · 배송비 계산은 하지 않는다(부모가 인증 결과로 다시 계산, 서버도 다시 확인). 표시·업로드 전용.
//   · DESIGN.md: 흰 바탕·검정 알약 주버튼·13px 이상·로즈 없음.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SUBSCRIBE_EXAMPLE_PC, subscribeChannelLabel } from "@/lib/subscribeFreeShip";

type Props = {
  variant: "card" | "strip";
  channelName: string;
  exampleUrl: string;
  groupsText: string; // 예: 「일반배송·업체배송1」
  verified: boolean;
  /** 이번 주문서에서 빠지는 배송비(원) — 0이면 금액 문구 없음 */
  waivedAmount?: number;
  /** 인증하면 빠질 배송비(원, 표시 전용) — 0이면 금액 없이 「배송비 무료 받기」 */
  potentialAmount?: number;
  kakaoId: string;
  customerPhone?: string;
  youtubeNickname?: string;
  onVerified: () => void;
  /** card 만: 처음엔 검정 한 줄(배송비 N원 무료 받기)로 접어 두고 누르면 단계가 펼쳐짐 — 주문서에서 담은 상품·받는 곳을 밀어내지 않게 */
  collapsible?: boolean;
  /** strip 을 눌렀을 때 — 부모가 카드 창을 연다 */
  onOpenDetail?: () => void;
};

export const SUBSCRIBE_CARD_OPEN_EVENT = "ruru-subscribe-card-open";

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
  const { variant, channelName, exampleUrl, groupsText, verified, waivedAmount = 0, potentialAmount = 0 } = props;
  const [state, setState] = useState<"idle" | "checking" | "fail">("idle");
  const [reason, setReason] = useState("");
  const [zoom, setZoom] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(!props.collapsible);
  const rootRef = useRef<HTMLDivElement>(null);
  // 금액표 위 「인증하러 가기」 → 이 카드를 펼치고 화면에 보이게
  useEffect(() => {
    if (!props.collapsible) return;
    const onOpen = () => {
      setOpen(true);
      window.setTimeout(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    };
    window.addEventListener(SUBSCRIBE_CARD_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SUBSCRIBE_CARD_OPEN_EVENT, onOpen);
  }, [props.collapsible]);

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

  const pcExample = SUBSCRIBE_EXAMPLE_PC;
  const stepNo = (n: number) => (
    <span aria-hidden="true" style={{ flexShrink: 0, width: "28px", height: "28px", borderRadius: "9999px", background: C.ink, color: "#FFFFFF", fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
  );
  const stepText: CSSProperties = { fontSize: "16px", fontWeight: 600, lineHeight: 1.45, color: C.ink, wordBreak: "keep-all" };

  if (!open) {
    return (
      <div ref={rootRef} data-subscribe-card="true">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          style={{ width: "100%", minHeight: "64px", display: "flex", alignItems: "center", gap: "12px", padding: "12px 12px 12px 16px", border: "none", borderRadius: "12px", background: C.ink, color: "#FFFFFF", textAlign: "left", cursor: "pointer", fontFamily: "inherit", wordBreak: "keep-all" }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "18px", fontWeight: 700, lineHeight: 1.35 }}>{potentialAmount > 0 ? `배송비 ${potentialAmount.toLocaleString()}원 무료` : "배송비 무료"}</span>
            <span style={{ display: "block", marginTop: "2px", fontSize: "14px", fontWeight: 400, lineHeight: 1.45, color: "#E5E5E5" }}>유튜브 구독 화면을 캡처해 올리면 돼요</span>
          </span>
          <span style={{ flexShrink: 0, height: "40px", padding: "0 14px", display: "flex", alignItems: "center", borderRadius: "9999px", background: "#FFFFFF", color: C.ink, fontSize: "15px", fontWeight: 700 }}>인증하기</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} data-subscribe-card="true" style={{ border: `2px solid ${C.ink}`, borderRadius: "12px", padding: "16px", background: "#FFFFFF", color: C.ink }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: "20px", fontWeight: 700, lineHeight: 1.35, wordBreak: "keep-all" }}>
          {potentialAmount > 0 ? <>배송비 <span style={{ color: C.bad }}>{potentialAmount.toLocaleString()}원</span> 무료 받기</> : <>배송비 무료 받기</>}
        </div>
        {props.collapsible ? (
          <button type="button" onClick={() => setOpen(false)} aria-expanded={true} style={{ flexShrink: 0, height: "40px", padding: "0 12px", border: `1px solid ${C.line}`, borderRadius: "9999px", background: "#FFFFFF", color: C.mute, fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>접기</button>
        ) : null}
      </div>
      <div style={{ marginTop: "4px", fontSize: "15px", color: "#39393B", lineHeight: 1.5, wordBreak: "keep-all" }}>
        유튜브 {subscribeChannelLabel(channelName)} 구독하고 캡처 한 장만 올리면 돼요. ({groupsText})
      </div>

      <ol style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
        <li style={{ display: "flex", gap: "10px" }}>
          {stepNo(1)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={stepText}>유튜브 채널에서 「구독」 누르기</div>
            <a href="/youtube" target="_blank" rel="noopener" style={{ marginTop: "8px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #CACACB", borderRadius: "9999px", color: C.ink, fontSize: "15px", fontWeight: 600, textDecoration: "none", boxSizing: "border-box" }}>
              유튜브 채널 열기
            </a>
          </div>
        </li>
        <li style={{ display: "flex", gap: "10px" }}>
          {stepNo(2)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={stepText}>아래 사진처럼 화면 캡처</div>
            <div style={{ marginTop: "2px", fontSize: "14px", color: C.mute, lineHeight: 1.5, wordBreak: "keep-all" }}>빨간 칸처럼 채널 이름과 「구독중」이 같이 보이게</div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              {[{ src: exampleUrl, label: "폰 화면", pos: "center 70%" }, { src: pcExample, label: "PC 화면", pos: "left 92%" }].map((ex) => (
                <button key={ex.label} type="button" onClick={() => setZoom(ex.src)} aria-label={`${ex.label} 예시 크게 보기`} style={{ flex: 1, minWidth: 0, padding: 0, border: `1px solid ${C.line}`, borderRadius: "8px", background: C.soft, overflow: "hidden", cursor: "zoom-in", fontFamily: "inherit" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ex.src} alt={`구독중 캡처 예시 (${ex.label})`} style={{ display: "block", width: "100%", height: "120px", objectFit: "cover", objectPosition: ex.pos }} />
                  <span style={{ display: "block", padding: "4px 0", fontSize: "13px", fontWeight: 600, color: C.ink }}>{ex.label} · 크게 보기</span>
                </button>
              ))}
            </div>
          </div>
        </li>
        <li style={{ display: "flex", gap: "10px" }}>
          {stepNo(3)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={stepText}>캡처한 사진 올리기</div>
            {state === "checking" ? (
              <div role="status" style={{ marginTop: "8px", height: "52px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "9999px", background: C.soft, fontSize: "15px", fontWeight: 600, color: C.mute }}>확인하고 있어요 (5초쯤)</div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} style={{ marginTop: "8px", width: "100%", height: "52px", border: "none", borderRadius: "9999px", background: C.ink, color: "#FFFFFF", fontSize: "16px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {state === "fail" ? "다시 올리기" : "캡처 사진 올리기"}
              </button>
            )}
          </div>
        </li>
      </ol>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />

      {state === "fail" && reason ? (
        <div role="alert" style={{ marginTop: "10px", fontSize: "14px", fontWeight: 600, color: C.bad, lineHeight: 1.5, wordBreak: "keep-all" }}>{reason}</div>
      ) : null}
      <div style={{ marginTop: "12px", fontSize: "13px", color: C.mute, lineHeight: 1.5, wordBreak: "keep-all" }}>주문서 제출 전에 인증해야 배송비가 빠져요. 인증 안 해도 주문은 그대로 돼요.</div>

      {zoom ? (
        <div role="dialog" aria-label="예시 사진" onClick={() => setZoom("")} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="구독중 캡처 예시" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: "8px" }} />
          <div style={{ marginTop: "12px", color: "#FFFFFF", fontSize: "15px", fontWeight: 600, textAlign: "center", wordBreak: "keep-all" }}>빨간 테두리처럼 채널 이름과 「구독중」이 같이 보여야 해요</div>
          <button type="button" onClick={() => setZoom("")} style={{ marginTop: "12px", height: "44px", padding: "0 24px", border: "none", borderRadius: "9999px", background: "#FFFFFF", color: C.ink, fontSize: "15px", fontWeight: 600 }}>닫기</button>
        </div>
      ) : null}
    </div>
  );
}
