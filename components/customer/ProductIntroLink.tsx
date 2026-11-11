"use client";
import { useEffect, useState } from "react";
import { parseProductIntro, type ProductIntro } from "@/lib/productIntro";

/** Lives beside the price in the existing option sheet. No link for unrecorded products. */
export function ProductIntroLink({ broadcastId, videoId, productId, detailName, onWatch }: {
  broadcastId: string; videoId: string; productId: string; detailName: string; onWatch: (intro: ProductIntro) => void;
}) {
  const [loaded, setLoaded] = useState<{ key: string; intro: ProductIntro } | null>(null);
  const key = JSON.stringify([broadcastId, videoId, productId, detailName]);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(null);
    const params = new URLSearchParams({ bc: broadcastId, video: videoId, product: productId, detail: detailName });
    void fetch(`/api/live-chat/product-intro?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(r => r.ok ? r.json() : null).then(data => {
        const intro = parseProductIntro(data?.intro, videoId);
        if (intro && !controller.signal.aborted) setLoaded({ key, intro });
      }).catch(() => {});
    return () => controller.abort();
  }, [key, broadcastId, videoId, productId, detailName]);
  if (!loaded || loaded.key !== key) return null;
  return <button
    type="button"
    aria-label="이 상품 방송영상 보기"
    onClick={() => onWatch(loaded.intro)}
    className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 active:brightness-95"
    style={{ display: "flex", alignItems: "center", gap: 10, width: "calc(100% - 32px)", minHeight: 56, margin: "8px 16px 4px", padding: "8px 12px", border: "1px solid #E8C65B", borderRadius: 12, background: "#FFF3C4", color: "#171717", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}
  >
    <span aria-hidden="true" style={{ display: "grid", placeItems: "center", flexShrink: 0, width: 32, height: 32, borderRadius: "50%", background: "#24211A", color: "#FFFFFF" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 15, fontWeight: 800, lineHeight: 1.4, wordBreak: "keep-all" }}>이 상품 방송영상 보기</span>
      <span style={{ display: "block", marginTop: 2, fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: "#615022", wordBreak: "keep-all" }}>이 상품 설명하는 장면부터 재생돼요</span>
    </span>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m9 5 7 7-7 7" /></svg>
  </button>;
}
