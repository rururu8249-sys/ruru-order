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
// 「앱 설치」를 눌러 넘어온 경우 — 넘어오자마자 큰 「설치하기」 창을 띄움(설치 창 자체는 브라우저 규칙상 손가락 한 번이 꼭 필요)
let installIntent = false;
export function kakaoExternalOpening(): boolean { return openedThisPage; }

// [04:42 사장님 「밖 브라우저에서 카톡 로그인 또 하면 불편」] 로그인 정보 넘겨주기.
//   손님 로그인 상태는 이 폰 브라우저 저장소(ruru_ 로 시작하는 값)뿐이라, 카톡 안 저장소 값을 주소 «#» 뒤에 실어 밖 브라우저로 넘긴다.
//   # 뒤는 서버로 안 감(기록 안 남음). 밖 브라우저는 받자마자 저장하고 주소에서 지운 뒤 새로 고침. 2분 지난 값은 안 씀.
const HANDOFF_KEY = "ruru_handoff";
const HANDOFF_SKIP = new Set([TRIED_KEY]);
function buildHandoff(install = false): string {
  const data: Record<string, string> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i) || "";
      if (!k.startsWith("ruru_") || HANDOFF_SKIP.has(k)) continue;
      const v = window.localStorage.getItem(k) || "";
      if (v.length > 1500) continue; // 장바구니처럼 큰 값은 빼고(장바구니는 서버에서 다시 맞춤)
      data[k] = v;
    }
  } catch { return ""; }
  if (!data.ruru_kakao_id) return "";
  return encodeURIComponent(JSON.stringify({ exp: Date.now() + 120000, data, install: install ? 1 : 0 }));
}
// 밖 브라우저 쪽: 주소 # 에 넘겨받은 값이 있으면 저장하고 주소에서 지움.
//   화면 코드가 저장소를 읽기 «전에» 해야 해서(로그인 안 됨 → 첫 화면으로 보내 버리는 코드보다 먼저) 이 파일이 불려 올 때 바로 한다.
function applyHandoff(): boolean {
  const h = window.location.hash || "";
  const m = h.match(new RegExp(`${HANDOFF_KEY}=([^&]+)`));
  if (!m) return false;
  const clean = window.location.pathname + window.location.search;
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1])) as { exp?: number; data?: Record<string, string>; install?: number };
    if (parsed && typeof parsed.exp === "number" && parsed.exp > Date.now() && parsed.install === 1) installIntent = true;
    if (parsed && typeof parsed.exp === "number" && parsed.exp > Date.now() && parsed.data && parsed.data.ruru_kakao_id) {
      Object.entries(parsed.data).forEach(([k, v]) => { if (k.startsWith("ruru_") && typeof v === "string") window.localStorage.setItem(k, v); });
    }
  } catch { /* 무시 — 그냥 깨끗한 주소로 */ }
  try { window.history.replaceState(window.history.state, "", clean); } catch { /* 무시 */ }
  return true;
}

// 이 파일이 불려 오는 순간(화면 그리기 전) 한 번
if (typeof window !== "undefined" && !isKakaoInAppBrowser(window.navigator.userAgent)) {
  try { applyHandoff(); } catch { /* 무시 */ }
}

/** 카톡 안 → 인터넷 앱으로 이 주소 열기(로그인 정보 같이). 「앱 설치」 버튼이 씀 */
export function openOrderInExternalBrowser(path = "/order", install = false) {
  const u = new URL(path, window.location.origin);
  const ho = buildHandoff(install);
  const target = ho ? `${u.toString()}#${HANDOFF_KEY}=${ho}` : u.toString();
  window.location.href = kakaoOpenExternalUrl(target);
}

// [04:55 사장님 결정 위임] 링크를 열 때마다 저절로 인터넷 앱으로 넘기는 건 끔 — 중장년 손님에겐 화면이 갑자기 다른 앱으로 바뀌는 게 더 헷갈림.
//   이제 «앱을 깔고 싶은 손님»만 「앱 설치」를 누를 때 넘어감(로그인 정보 같이). 다시 켜려면 AUTO_OPEN = true.
const AUTO_OPEN = false;

export default function KakaoExternalOpen() {
  const [shown, setShown] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installMsg, setInstallMsg] = useState("");
  useEffect(() => {
    if (!installIntent) return;
    installIntent = false;
    const w = window as unknown as { __ruruPwaPrompt?: unknown };
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const t = window.setTimeout(() => { setIsIos(ios); setInstallOpen(true); setCanPrompt(!!w.__ruruPwaPrompt); }, 0);
    // 설치 준비 소식이 조금 늦게 올 수 있음 — 오면 버튼 켬
    const onReady = (e: Event) => { e.preventDefault(); (window as unknown as { __ruruPwaPrompt?: unknown }).__ruruPwaPrompt = e; setCanPrompt(true); };
    const onInstalled = () => setInstallOpen(false);
    window.addEventListener("beforeinstallprompt", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.clearTimeout(t); window.removeEventListener("beforeinstallprompt", onReady); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  const doInstall = async () => {
    const w = window as unknown as { __ruruPwaPrompt?: { prompt: () => void; userChoice: Promise<{ outcome?: string }> } | null };
    const ev = w.__ruruPwaPrompt;
    if (!ev) { setInstallMsg("오른쪽 위 ⋮ 메뉴 → 「홈 화면에 추가」 또는 「앱 설치」를 눌러 주세요."); return; }
    try {
      ev.prompt();
      const r = await ev.userChoice;
      w.__ruruPwaPrompt = null;
      if (r && r.outcome === "accepted") setInstallOpen(false);
    } catch { setInstallMsg("오른쪽 위 ⋮ 메뉴 → 「홈 화면에 추가」를 눌러 주세요."); }
  };
  const target = () => {
    const u = new URL(window.location.href);
    u.searchParams.delete("inapp");
    u.hash = "";
    const ho = buildHandoff();
    return ho ? `${u.toString()}#${HANDOFF_KEY}=${ho}` : u.toString();
  };
  const open = () => { window.location.href = kakaoOpenExternalUrl(target()); };
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!AUTO_OPEN || !isKakaoInAppBrowser(navigator.userAgent)) return;
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
  if (installOpen) {
    return (
      <div role="dialog" aria-modal="true" aria-label="루루동이 앱 설치" style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: "inherit" }}>
        <div style={{ width: "100%", maxWidth: "480px", boxSizing: "border-box", background: "#FFFFFF", color: "#111111", borderRadius: "20px 20px 0 0", padding: "24px 16px calc(20px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-v2-192.png" alt="" width={64} height={64} style={{ borderRadius: "16px" }} />
          <div style={{ fontSize: "20px", fontWeight: 700 }}>루루동이 앱 설치</div>
          {isIos ? (
            <div style={{ fontSize: "15px", color: "#707072", lineHeight: 1.6 }}>아래 가운데 <b style={{ color: "#111111" }}>공유 버튼(네모에 위 화살표)</b>을 누르고<br /><b style={{ color: "#111111" }}>「홈 화면에 추가」</b>를 눌러 주세요.</div>
          ) : (
            <>
              <div style={{ fontSize: "15px", color: "#707072", lineHeight: 1.6 }}>아래 버튼을 누르면 바로 설치돼요.</div>
              <button type="button" aria-busy={!canPrompt} onClick={() => void doInstall()} style={{ width: "100%", height: "56px", border: "none", borderRadius: "9999px", background: "#111111", color: "#FFFFFF", fontSize: "17px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>설치하기</button>
              {installMsg ? <div role="status" style={{ fontSize: "14px", color: "#111111", lineHeight: 1.5 }}>{installMsg}</div> : null}
            </>
          )}
          <button type="button" onClick={() => setInstallOpen(false)} style={{ width: "100%", height: "48px", border: "1px solid #E5E5E5", borderRadius: "9999px", background: "#FFFFFF", color: "#111111", fontSize: "15px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>나중에</button>
        </div>
      </div>
    );
  }
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
