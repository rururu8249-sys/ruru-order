"use client";
import { useMemo, useState } from "react";

function parseYoutubeId(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "").trim();
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/(live|shorts|embed)\/([^/?]+)/);
    if (m) return m[2];
  } catch {
    if (/^[\w-]{6,}$/.test(s)) return s;
  }
  return "";
}

export default function OverlayTestPage() {
  const [url, setUrl] = useState("");
  const [showOverlay, setShowOverlay] = useState(true);
  const [controls, setControls] = useState(false);
  const id = useMemo(() => parseYoutubeId(url), [url]);
  const src = id
    ? `https://www.youtube.com/embed/${id}?playsinline=1&rel=0&autoplay=1&mute=1&controls=${controls ? 1 : 0}&enablejsapi=1`
    : "";

  return (
    <div style={{ minHeight: "100vh", background: "#1c1c1e", color: "#fff", padding: "14px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: "460px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "16px", fontWeight: 800, marginBottom: "10px" }}>🧪 오버레이 테스트 (손님페이지 무관)</h1>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="유튜브 라이브 URL 붙여넣기 (youtu.be/... 또는 watch?v=...)"
          style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "none", marginBottom: "8px", fontSize: "13px" }} />
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", fontSize: "12px" }}>
          <button onClick={() => setShowOverlay((v) => !v)} style={{ padding: "7px 12px", borderRadius: "8px", border: "none", background: showOverlay ? "#7B2D43" : "#555", color: "#fff", cursor: "pointer" }}>오버레이 {showOverlay ? "ON" : "OFF"}</button>
          <button onClick={() => setControls((v) => !v)} style={{ padding: "7px 12px", borderRadius: "8px", border: "none", background: controls ? "#7B2D43" : "#555", color: "#fff", cursor: "pointer" }}>유튜브 컨트롤 {controls ? "ON" : "OFF"}</button>
        </div>

        <div style={{ position: "relative", width: "100%", aspectRatio: "9 / 16", background: "#000", borderRadius: "12px", overflow: "hidden" }}>
          {src ? (
            <iframe src={src} title="overlay-test" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: "13px" }}>위에 유튜브 라이브 URL 붙여넣기</div>
          )}

          {showOverlay && src && (
            <>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "10px 12px", background: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0))", display: "flex", alignItems: "center", gap: "8px", pointerEvents: "none" }}>
                <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "#7B2D43" }} />
                <div><div style={{ fontSize: "13px", fontWeight: 700 }}>루루동이 <span style={{ fontSize: "9px", background: "#C0392B", padding: "1px 5px", borderRadius: "4px" }}>LIVE</span></div><div style={{ fontSize: "10px", opacity: 0.8 }}>● 399명 시청</div></div>
              </div>

              <div style={{ position: "absolute", left: "10px", bottom: "150px", width: "70%", display: "flex", flexDirection: "column", gap: "4px", pointerEvents: "none" }}>
                {["민지맘: 이거 색상 더 있어요?", "쇼핑러버: 와 예쁘다", "두두: 95 사이즈 있나요?", "단골손님: 방금 주문했어요~"].map((t, i) => (
                  <div key={i} style={{ fontSize: "11px", background: "rgba(0,0,0,0.4)", padding: "3px 8px", borderRadius: "10px", alignSelf: "flex-start" }}>{t}</div>
                ))}
              </div>

              <div style={{ position: "absolute", left: "10px", right: "10px", bottom: "58px", background: "rgba(255,255,255,0.96)", borderRadius: "12px", padding: "8px 10px", display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "8px", background: "#ddd", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: "12px", fontWeight: 700, color: "#222", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>★타임특가 니트 탑</div><div style={{ fontSize: "14px", fontWeight: 800, color: "#C0392B" }}>39,000원</div></div>
                <div style={{ background: "#7B2D43", color: "#fff", fontSize: "12px", fontWeight: 700, padding: "9px 14px", borderRadius: "99px" }}>담기</div>
              </div>

              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 12px", background: "linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.6))", display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.2)", borderRadius: "99px", padding: "7px 12px", fontSize: "11px", color: "#eee" }}>메시지 입력...</div>
                <span style={{ fontSize: "18px" }}>📢</span><span style={{ fontSize: "18px" }}>💬</span><span style={{ fontSize: "18px" }}>🛒</span>
              </div>
            </>
          )}
        </div>

        <p style={{ fontSize: "11px", color: "#999", marginTop: "10px", lineHeight: 1.6 }}>※ "유튜브 컨트롤 OFF"가 controls=0(깨끗), ON이 기본. 오버레이 ON/OFF로 유튜브 흔적 비교. 실제 라이브 URL 넣고 폰에서 확인.</p>
      </div>
    </div>
  );
}
