"use client";
// [2026-11-10 04:37 사장님] 카톡 채널 「주문서 작성」 링크를 누르면 카톡 안 브라우저 대신 폰 기본 브라우저(크롬·삼성인터넷·사파리)로 바로 열기.
//   카톡 안에서는 앱 설치가 막혀 있어서, 밖 브라우저로 옮겨야 「앱 설치」 한 번으로 설치 창이 뜬다.
//   카톡이 주는 kakaotalk://web/openExternal 주소로 넘김. 한 탭에서 한 번만 시도(sessionStorage), 주소에 ?inapp=1 이면 안 넘김.
//   카톡 안 화면에는 «다른 브라우저로 열었어요» 안내 + 「다시 열기」·「여기서 계속」.
import { useEffect, useState } from "react";
import { isKakaoInAppBrowser, kakaoOpenExternalUrl } from "@/lib/youtubeChannelLink";

const TRIED_KEY = "ruru_kakao_ext_tried";
// 이번 화면에서 밖 브라우저로 넘겼는지 — 시작 화면이 «로그인돼 있으면 /order 로 이동»을 이때는 멈추게(넘김이 취소되지 않게)
let openedThisPage = false;
export function kakaoExternalOpening(): boolean { return openedThisPage; }

export default function KakaoExternalOpen() {
  const [shown, setShown] = useState(false);
  const target = () => {
    const u = new URL(window.location.href);
    u.searchParams.delete("inapp");
    return u.toString();
  };
  const open = () => { window.location.href = kakaoOpenExternalUrl(target()); };
  useEffect(() => {
    if (typeof window === "undefined" || !isKakaoInAppBrowser(navigator.userAgent)) return;
    if (new URLSearchParams(window.location.search).get("inapp") === "1") return;
    let tried = false;
    try { tried = window.sessionStorage.getItem(TRIED_KEY) === "1"; } catch { /* 무시 */ }
    if (tried) return;
    try { window.sessionStorage.setItem(TRIED_KEY, "1"); } catch { /* 무시 */ }
    openedThisPage = true;
    open();
    const t = window.setTimeout(() => setShown(true), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!shown) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="다른 브라우저로 열기" style={{ position: "fixed", inset: 0, zIndex: 200, background: "#FFFFFF", color: "#111111", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", gap: "12px", textAlign: "center", fontFamily: "inherit" }}>
      <div style={{ fontSize: "20px", fontWeight: 700, lineHeight: 1.4 }}>인터넷 앱으로 주문서를 열었어요</div>
      <div style={{ fontSize: "15px", color: "#707072", lineHeight: 1.6 }}>새로 열린 화면에서 주문하시면 돼요.<br />안 열렸으면 아래 「다시 열기」를 눌러 주세요.</div>
      <button type="button" onClick={open} style={{ marginTop: "8px", width: "100%", maxWidth: "320px", height: "52px", border: "none", borderRadius: "9999px", background: "#111111", color: "#FFFFFF", fontSize: "16px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>다시 열기</button>
      <button type="button" onClick={() => setShown(false)} style={{ width: "100%", maxWidth: "320px", height: "48px", border: "1px solid #E5E5E5", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>카톡 안에서 계속</button>
    </div>
  );
}
